// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {FixedPoint128} from "v4-core/libraries/FixedPoint128.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";

import {ILancioLaunchpad} from "./interfaces/ILancioLaunchpad.sol";

/// @title LancioLocker
/// @notice Holds the Uniswap v4 liquidity of every graduated Lancio token, forever.
///         The position is created by this contract and belongs to it. There is no function to withdraw,
///         transfer or reduce it, no owner and no upgrade path. The only thing anyone can do is collect the
///         position's trading fees: the ETH side is credited 50/50 to the creator and the protocol on the
///         launchpad (pull-based), the token side is sent 50/50 to the creator and the treasury.
///         Rounding dust left over when the position is created (a few wei) stays here permanently.
contract LancioLocker is IUnlockCallback, ReentrancyGuard {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint24 public constant LP_FEE = 10_000; // 1%, static
    int24 public constant TICK_SPACING = 200;
    int24 public constant TICK_LOWER = -887_200; // TickMath.minUsableTick(200)
    int24 public constant TICK_UPPER = 887_200; // TickMath.maxUsableTick(200)
    /// @notice 25,000,000 tokens per ETH = 0.00000004 ETH per token (currency0 = ETH, currency1 = token).
    uint160 public constant SQRT_PRICE_X96 = uint160(5000 << 96);
    uint256 public constant POOL_RESERVE = 200_000_000e18;
    uint256 public constant POOL_SPLIT_BPS = 5_000;

    uint8 internal constant ACTION_ADD = 1;
    uint8 internal constant ACTION_COLLECT = 2;

    IPoolManager public immutable poolManager;
    ILancioLaunchpad public immutable launchpad;
    IHooks public immutable hook;

    mapping(address token => uint128) public liquidityOf;

    event PoolFeesCollected(
        address indexed token, uint256 ethToCreator, uint256 ethToProtocol, uint256 tokenToCreator, uint256 tokenToProtocol
    );

    error NotLaunchpad();
    error NotPoolManager();
    error NotLocked();
    error AlreadyLocked();

    constructor(IPoolManager poolManager_, ILancioLaunchpad launchpad_, IHooks hook_) {
        poolManager = poolManager_;
        launchpad = launchpad_;
        hook = hook_;
    }

    /// @dev Native ETH arrives from the PoolManager when fees are taken.
    receive() external payable {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
    }

    function poolKeyOf(address token) public view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: LP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: hook
        });
    }

    function poolIdOf(address token) external view returns (bytes32) {
        return PoolId.unwrap(poolKeyOf(token).toId());
    }

    /// @notice Called by the launchpad in the graduating transaction with 8 ETH; the 200M tokens were
    ///         transferred just before. Opens the pool at the fixed price and adds full-range liquidity.
    function lock(address token) external payable returns (bytes32 poolId, uint128 liquidity) {
        if (msg.sender != address(launchpad)) revert NotLaunchpad();
        if (liquidityOf[token] != 0) revert AlreadyLocked();

        PoolKey memory key = poolKeyOf(token);
        poolManager.initialize(key, SQRT_PRICE_X96);

        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            SQRT_PRICE_X96,
            TickMath.getSqrtPriceAtTick(TICK_LOWER),
            TickMath.getSqrtPriceAtTick(TICK_UPPER),
            msg.value,
            POOL_RESERVE
        );
        liquidityOf[token] = liquidity;
        poolManager.unlock(abi.encode(ACTION_ADD, token, liquidity));
        poolId = PoolId.unwrap(key.toId());
    }

    /// @notice Collect the position's accumulated trading fees and split them 50/50. Anyone can call.
    function collectFees(address token) external nonReentrant returns (uint256 ethFees, uint256 tokenFees) {
        if (liquidityOf[token] == 0) revert NotLocked();
        (ethFees, tokenFees) = abi.decode(poolManager.unlock(abi.encode(ACTION_COLLECT, token, uint128(0))), (uint256, uint256));

        uint256 ethToCreator = ethFees * POOL_SPLIT_BPS / 10_000;
        uint256 tokenToCreator = tokenFees * POOL_SPLIT_BPS / 10_000;
        uint256 tokenToProtocol = tokenFees - tokenToCreator;

        if (ethFees > 0) launchpad.depositPoolFees{value: ethFees}(token);
        if (tokenToCreator > 0) IERC20(token).transfer(launchpad.creatorOf(token), tokenToCreator);
        if (tokenToProtocol > 0) IERC20(token).transfer(launchpad.treasury(), tokenToProtocol);

        emit PoolFeesCollected(token, ethToCreator, ethFees - ethToCreator, tokenToCreator, tokenToProtocol);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (uint8 action, address token, uint128 liquidity) = abi.decode(data, (uint8, address, uint128));
        PoolKey memory key = poolKeyOf(token);

        if (action == ACTION_ADD) {
            (BalanceDelta delta,) = poolManager.modifyLiquidity(
                key,
                ModifyLiquidityParams({
                    tickLower: TICK_LOWER,
                    tickUpper: TICK_UPPER,
                    liquidityDelta: int256(uint256(liquidity)),
                    salt: bytes32(0)
                }),
                ""
            );
            uint256 owe0 = uint256(uint128(-delta.amount0()));
            uint256 owe1 = uint256(uint128(-delta.amount1()));
            poolManager.settle{value: owe0}();
            poolManager.sync(key.currency1);
            IERC20(token).transfer(address(poolManager), owe1);
            poolManager.settle();
            return "";
        }

        // ACTION_COLLECT: a zero-liquidity poke realises the position's fees as a positive delta.
        (BalanceDelta fees,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({tickLower: TICK_LOWER, tickUpper: TICK_UPPER, liquidityDelta: 0, salt: bytes32(0)}),
            ""
        );
        uint256 fee0 = uint256(uint128(fees.amount0()));
        uint256 fee1 = uint256(uint128(fees.amount1()));
        if (fee0 > 0) poolManager.take(key.currency0, address(this), fee0);
        if (fee1 > 0) poolManager.take(key.currency1, address(this), fee1);
        return abi.encode(fee0, fee1);
    }

    /// @notice Fees accumulated by the position and not yet collected.
    function pendingFees(address token) external view returns (uint256 ethFees, uint256 tokenFees) {
        if (liquidityOf[token] == 0) return (0, 0);
        PoolId id = poolKeyOf(token).toId();
        (uint128 liq, uint256 last0, uint256 last1) =
            poolManager.getPositionInfo(id, address(this), TICK_LOWER, TICK_UPPER, bytes32(0));
        (uint256 inside0, uint256 inside1) = poolManager.getFeeGrowthInside(id, TICK_LOWER, TICK_UPPER);
        unchecked {
            ethFees = FullMath.mulDiv(inside0 - last0, liq, FixedPoint128.Q128);
            tokenFees = FullMath.mulDiv(inside1 - last1, liq, FixedPoint128.Q128);
        }
    }
}
