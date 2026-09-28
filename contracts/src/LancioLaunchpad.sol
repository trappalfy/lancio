// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {LancioToken} from "./LancioToken.sol";
import {IArbSys} from "./interfaces/IArbSys.sol";
import {ILancioLocker} from "./interfaces/ILancioLocker.sol";

/// @title LancioLaunchpad
/// @notice Creates fixed-supply tokens and runs one constant-product bonding curve per token.
///         Same rules for every token, fixed at deployment:
///         - 1B supply: 800M sold on the curve, 200M held for the pool. No allocations.
///         - x·y = k with virtual reserves 2.73 ETH / 1.073B tokens.
///         - 1% fee per trade in ETH: 0.6% creator, 0.4% protocol (pull-based balances).
///         - First 2 blocks: max 1% of supply per wallet (the developer buy counts for the creator);
///           `buy` is open to externally owned accounts only during those blocks.
///         - At 8 ETH raised the curve closes and, in the same transaction, 8 ETH + 200M tokens
///           are locked forever in a Uniswap v4 pool through LancioLocker.
///         The owner can only change the treasury address and pause creation of new tokens.
contract LancioLaunchpad is Ownable2Step, ReentrancyGuard {
    // ------------------------------------------------------------------ constants

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant CURVE_SUPPLY = 800_000_000e18;
    uint256 public constant POOL_RESERVE = 200_000_000e18;
    uint256 public constant VIRTUAL_ETH_0 = 2.73 ether;
    uint256 public constant VIRTUAL_TOKEN_0 = 1_073_000_000e18;
    uint256 public constant K = VIRTUAL_ETH_0 * VIRTUAL_TOKEN_0;
    /// @notice vTok when the curve is sold out (273M).
    uint256 public constant VIRTUAL_TOKEN_END = VIRTUAL_TOKEN_0 - CURVE_SUPPLY;
    /// @notice vEth when the curve is sold out: k / 273M = 10.73 ETH exactly.
    uint256 public constant VIRTUAL_ETH_END = K / VIRTUAL_TOKEN_END;
    uint256 public constant GRADUATION_ETH = VIRTUAL_ETH_END - VIRTUAL_ETH_0; // 8 ETH
    uint256 public constant TRADE_FEE_BPS = 100; // 1%
    uint256 public constant CREATOR_FEE_PCT = 60; // 60% of the fee = 0.6% of the trade
    uint256 public constant POOL_SPLIT_BPS = 5_000; // 50/50 of pool fees
    uint256 public constant LAUNCH_CAP = 10_000_000e18; // 1% of supply
    uint256 public constant LAUNCH_WINDOW = 2; // blocks: the creation block and the next one

    IArbSys internal constant ARB_SYS = IArbSys(address(100));

    // ------------------------------------------------------------------ state

    struct Curve {
        address creator;
        uint64 createdBlock;
        bool graduated;
        uint256 vEth;
        uint256 vTok;
        uint256 creatorFees; // unclaimed ETH owed to the current creator
    }

    struct CurveView {
        address creator;
        uint64 createdBlock;
        bool graduated;
        uint256 vEth;
        uint256 vTok;
        uint256 realEth;
        uint256 sold;
        uint256 creatorFees;
    }

    address public immutable locker;
    address public treasury;
    bool public creationPaused;
    uint256 public protocolFees; // unclaimed ETH owed to the treasury

    mapping(address token => Curve) internal _curves;
    mapping(address token => mapping(address buyer => uint256)) public boughtInWindow;

    // ------------------------------------------------------------------ events

    event TokenCreated(
        address indexed token, address indexed creator, string name, string symbol, string metadataURI, uint256 createdBlock
    );
    event Trade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 ethAmount,
        uint256 tokenAmount,
        uint256 fee,
        uint256 vEth,
        uint256 vTok,
        uint256 realEth
    );
    event Graduated(address indexed token, bytes32 indexed poolId, uint128 liquidity, uint256 ethIn, uint256 tokensIn);
    event CreatorFeesClaimed(address indexed token, address indexed creator, uint256 amount);
    event CreatorTransferred(address indexed token, address indexed from, address indexed to);
    event PoolFeesDeposited(address indexed token, uint256 creatorEth, uint256 protocolEth);
    event ProtocolFeesClaimed(address indexed treasury, uint256 amount);
    event TreasuryUpdated(address indexed treasury);
    event CreationPausedSet(bool paused);

    // ------------------------------------------------------------------ errors

    error SlippageExceeded();
    error LaunchCapExceeded();
    error CurveClosed();
    error DeadlineExpired();
    error CreationPaused();
    error InvalidName();
    error InvalidSymbol();
    error NotCreator();
    error NotLocker();
    error ZeroAddress();
    error ZeroAmount();
    error UnknownToken();
    error ContractBuyerInWindow();
    error ExceedsSold();
    error EthTransferFailed();
    error RenounceDisabled();

    // ------------------------------------------------------------------ constructor

    constructor(address owner_, address treasury_, address locker_) Ownable(owner_) {
        if (treasury_ == address(0) || locker_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        locker = locker_;
    }

    // ------------------------------------------------------------------ trading

    /// @notice Create a token and its curve. Any ETH sent is a developer buy from the curve, at the curve price,
    ///         with the fee and under the launch-window cap, delivered to the creator.
    function create(string calldata name, string calldata symbol, string calldata metadataURI, uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (address token)
    {
        if (creationPaused) revert CreationPaused();
        _validateName(name);
        _validateSymbol(symbol);

        token = address(new LancioToken(name, symbol, address(this)));
        uint256 createdBlock = _blockNumber();

        Curve storage c = _curves[token];
        c.creator = msg.sender;
        c.createdBlock = uint64(createdBlock);
        c.vEth = VIRTUAL_ETH_0;
        c.vTok = VIRTUAL_TOKEN_0;

        emit TokenCreated(token, msg.sender, name, symbol, metadataURI, createdBlock);

        if (msg.value > 0) _buy(token, c, msg.sender, msg.value, minTokensOut);
    }

    /// @notice Buy tokens with ETH. If the buy sells out the curve, only the ETH needed is used, the rest is
    ///         refunded, and the token graduates in this transaction.
    function buy(address token, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        Curve storage c = _curve(token);
        if (msg.sender != tx.origin && _inWindow(c)) revert ContractBuyerInWindow();
        tokensOut = _buy(token, c, msg.sender, msg.value, minTokensOut);
    }

    /// @notice Sell tokens back to the curve. Always possible until the token graduates.
    function sell(address token, uint256 tokensIn, uint256 minEthOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 ethOut)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();
        Curve storage c = _curve(token);
        if (c.graduated) revert CurveClosed();
        if (tokensIn == 0) revert ZeroAmount();
        if (tokensIn > VIRTUAL_TOKEN_0 - c.vTok) revert ExceedsSold();

        uint256 newVTok = c.vTok + tokensIn;
        uint256 newVEth = _ceilDiv(K, newVTok);
        uint256 grossOut = c.vEth - newVEth;
        if (grossOut == 0) revert ZeroAmount();
        uint256 fee = grossOut * TRADE_FEE_BPS / 10_000;
        ethOut = grossOut - fee;
        if (ethOut < minEthOut) revert SlippageExceeded();

        c.vEth = newVEth;
        c.vTok = newVTok;
        _accrueTradeFee(c, fee);

        IERC20(token).transferFrom(msg.sender, address(this), tokensIn);
        emit Trade(token, msg.sender, false, grossOut, tokensIn, fee, newVEth, newVTok, newVEth - VIRTUAL_ETH_0);
        _sendEth(msg.sender, ethOut);
    }

    // ------------------------------------------------------------------ fees

    /// @notice Claim unclaimed creator fees (curve fees + pool ETH fees) for tokens the caller currently creates.
    function claimCreatorFees(address[] calldata tokens) external nonReentrant returns (uint256 amount) {
        for (uint256 i; i < tokens.length; ++i) {
            Curve storage c = _curve(tokens[i]);
            if (c.creator != msg.sender) revert NotCreator();
            uint256 owed = c.creatorFees;
            if (owed == 0) continue;
            c.creatorFees = 0;
            amount += owed;
            emit CreatorFeesClaimed(tokens[i], msg.sender, owed);
        }
        if (amount > 0) _sendEth(msg.sender, amount);
    }

    /// @notice Hand the creator role (and its unclaimed fees) to another address.
    function transferCreator(address token, address newCreator) external {
        Curve storage c = _curve(token);
        if (c.creator != msg.sender) revert NotCreator();
        if (newCreator == address(0)) revert ZeroAddress();
        c.creator = newCreator;
        emit CreatorTransferred(token, msg.sender, newCreator);
    }

    /// @notice Send accrued protocol fees to the treasury. Anyone can call.
    function claimProtocolFees() external nonReentrant returns (uint256 amount) {
        amount = protocolFees;
        if (amount == 0) return 0;
        protocolFees = 0;
        address to = treasury;
        emit ProtocolFeesClaimed(to, amount);
        _sendEth(to, amount);
    }

    /// @notice Called by the locker with the ETH side of collected pool fees; split 50/50 into pull balances.
    function depositPoolFees(address token) external payable {
        if (msg.sender != locker) revert NotLocker();
        Curve storage c = _curve(token);
        uint256 creatorPart = msg.value * POOL_SPLIT_BPS / 10_000;
        uint256 protocolPart = msg.value - creatorPart;
        c.creatorFees += creatorPart;
        protocolFees += protocolPart;
        emit PoolFeesDeposited(token, creatorPart, protocolPart);
    }

    // ------------------------------------------------------------------ admin

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    /// @notice Ownership can be handed over (two-step) but never renounced: a renounce while creation is
    ///         paused would freeze creation forever.
    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    /// @notice Pause or resume creation of NEW tokens. Trading is never affected.
    function setCreationPaused(bool paused) external onlyOwner {
        creationPaused = paused;
        emit CreationPausedSet(paused);
    }

    // ------------------------------------------------------------------ views

    function getCurve(address token) external view returns (CurveView memory v) {
        Curve storage c = _curves[token];
        v = CurveView({
            creator: c.creator,
            createdBlock: c.createdBlock,
            graduated: c.graduated,
            vEth: c.vEth,
            vTok: c.vTok,
            realEth: c.creator == address(0) ? 0 : c.vEth - VIRTUAL_ETH_0,
            sold: c.creator == address(0) ? 0 : VIRTUAL_TOKEN_0 - c.vTok,
            creatorFees: c.creatorFees
        });
    }

    function creatorOf(address token) external view returns (address) {
        return _curves[token].creator;
    }

    function quoteBuy(address token, uint256 ethIn)
        external
        view
        returns (uint256 tokensOut, uint256 ethUsed, uint256 refund, uint256 fee, bool graduates)
    {
        Curve storage c = _curve(token);
        if (c.graduated) revert CurveClosed();
        (tokensOut, ethUsed, fee, graduates,,) = _quoteBuy(c.vEth, c.vTok, ethIn);
        refund = ethIn - ethUsed;
    }

    function quoteSell(address token, uint256 tokensIn) external view returns (uint256 ethOut, uint256 fee) {
        Curve storage c = _curve(token);
        if (c.graduated) revert CurveClosed();
        if (tokensIn > VIRTUAL_TOKEN_0 - c.vTok) revert ExceedsSold();
        uint256 grossOut = c.vEth - _ceilDiv(K, c.vTok + tokensIn);
        fee = grossOut * TRADE_FEE_BPS / 10_000;
        ethOut = grossOut - fee;
    }

    /// @return remaining Tokens `account` may still buy in the launch window (type(uint256).max after it).
    /// @return blocksLeft Blocks left in the launch window, counting the current one (0 when closed).
    function launchCapRemaining(address token, address account)
        external
        view
        returns (uint256 remaining, uint256 blocksLeft)
    {
        Curve storage c = _curve(token);
        uint256 end = uint256(c.createdBlock) + LAUNCH_WINDOW;
        uint256 nowBlock = _blockNumber();
        if (nowBlock >= end) return (type(uint256).max, 0);
        uint256 bought = boughtInWindow[token][account];
        remaining = bought >= LAUNCH_CAP ? 0 : LAUNCH_CAP - bought;
        blocksLeft = end - nowBlock;
    }

    function currentBlock() external view returns (uint256) {
        return _blockNumber();
    }

    // ------------------------------------------------------------------ internal

    function _buy(address token, Curve storage c, address buyer, uint256 ethIn, uint256 minTokensOut)
        internal
        returns (uint256 tokensOut)
    {
        if (c.graduated) revert CurveClosed();
        if (ethIn == 0) revert ZeroAmount();

        (uint256 out, uint256 ethUsed, uint256 fee, bool graduates, uint256 newVEth, uint256 newVTok) =
            _quoteBuy(c.vEth, c.vTok, ethIn);
        tokensOut = out;
        if (tokensOut == 0) revert ZeroAmount();
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        if (_inWindow(c)) {
            uint256 bought = boughtInWindow[token][buyer] + tokensOut;
            if (bought > LAUNCH_CAP) revert LaunchCapExceeded();
            boughtInWindow[token][buyer] = bought;
        }

        c.vEth = newVEth;
        c.vTok = newVTok;
        _accrueTradeFee(c, fee);

        emit Trade(token, buyer, true, ethUsed, tokensOut, fee, newVEth, newVTok, newVEth - VIRTUAL_ETH_0);
        IERC20(token).transfer(buyer, tokensOut);

        if (graduates) _graduate(token, c);

        uint256 refund = ethIn - ethUsed;
        if (refund > 0) _sendEth(buyer, refund);
    }

    /// @dev Curve is sold out: realEth == 8 ETH and this contract holds exactly POOL_RESERVE of the token
    ///      (plus any donations, which stay here). Both go to the locker, which opens and locks the pool.
    function _graduate(address token, Curve storage c) internal {
        c.graduated = true;
        IERC20(token).transfer(locker, POOL_RESERVE);
        (bytes32 poolId, uint128 liquidity) = ILancioLocker(locker).lock{value: GRADUATION_ETH}(token);
        emit Graduated(token, poolId, liquidity, GRADUATION_ETH, POOL_RESERVE);
    }

    /// @dev Mirrors packages/shared/src/curve.ts quoteBuy — keep both identical.
    function _quoteBuy(uint256 vEth, uint256 vTok, uint256 ethIn)
        internal
        pure
        returns (uint256 tokensOut, uint256 ethUsed, uint256 fee, bool graduates, uint256 newVEth, uint256 newVTok)
    {
        fee = ethIn * TRADE_FEE_BPS / 10_000;
        newVEth = vEth + (ethIn - fee);
        newVTok = _ceilDiv(K, newVEth);
        if (newVTok > VIRTUAL_TOKEN_END) {
            tokensOut = vTok - newVTok;
            ethUsed = ethIn;
        } else {
            // Sells out the curve: take only the ETH needed, fee on the used part.
            graduates = true;
            uint256 netNeeded = VIRTUAL_ETH_END - vEth;
            ethUsed = _ceilDiv(netNeeded * 100, 99);
            if (ethUsed > ethIn) ethUsed = ethIn;
            fee = ethUsed - netNeeded;
            newVEth = VIRTUAL_ETH_END;
            newVTok = VIRTUAL_TOKEN_END;
            tokensOut = vTok - VIRTUAL_TOKEN_END;
        }
    }

    function _accrueTradeFee(Curve storage c, uint256 fee) internal {
        uint256 creatorPart = fee * CREATOR_FEE_PCT / 100;
        c.creatorFees += creatorPart;
        protocolFees += fee - creatorPart;
    }

    function _curve(address token) internal view returns (Curve storage c) {
        c = _curves[token];
        if (c.creator == address(0)) revert UnknownToken();
    }

    function _inWindow(Curve storage c) internal view returns (bool) {
        return _blockNumber() < uint256(c.createdBlock) + LAUNCH_WINDOW;
    }

    function _blockNumber() internal view returns (uint256) {
        return ARB_SYS.arbBlockNumber();
    }

    function _sendEth(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    function _validateName(string calldata name) internal pure {
        uint256 len = bytes(name).length;
        if (len == 0 || len > 32) revert InvalidName();
    }

    function _validateSymbol(string calldata symbol) internal pure {
        bytes memory s = bytes(symbol);
        if (s.length == 0 || s.length > 10) revert InvalidSymbol();
        for (uint256 i; i < s.length; ++i) {
            bytes1 ch = s[i];
            bool ok = (ch >= 0x30 && ch <= 0x39) || (ch >= 0x41 && ch <= 0x5A); // 0-9 A-Z
            if (!ok) revert InvalidSymbol();
        }
    }
}
