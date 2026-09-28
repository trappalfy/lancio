// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";

import {LancioLaunchpad} from "../../src/LancioLaunchpad.sol";
import {LancioLocker} from "../../src/LancioLocker.sol";
import {Base, RevertingReceiver} from "../Base.t.sol";

/// @dev A contract buyer (bot / router).
contract Buyer {
    LancioLaunchpad internal immutable lp;

    constructor(LancioLaunchpad lp_) payable {
        lp = lp_;
    }

    function buy(address t, uint256 v) external returns (uint256) {
        return lp.buy{value: v}(t, 0, block.timestamp + 60);
    }

    function create(uint256 v) external returns (address) {
        return lp.create{value: v}("BOT", "BOT", "", 0);
    }

    receive() external payable {}
}

/// @dev Contract buyer that rejects ETH (refunds).
contract RejectingBuyer {
    LancioLaunchpad internal immutable lp;

    constructor(LancioLaunchpad lp_) payable {
        lp = lp_;
    }

    function buy(address t, uint256 v) external returns (uint256) {
        return lp.buy{value: v}(t, 0, block.timestamp + 60);
    }
}

/// @dev On every ETH receipt, tries to re-enter everything it can reach.
contract Reenterer {
    LancioLaunchpad internal immutable lp;
    LancioLocker internal immutable locker;
    address public other; // a second, open token
    address public target; // the token being bought
    bytes4[] public errs; // revert selectors of the attempts (0 = succeeded)
    bool internal armed;

    constructor(LancioLaunchpad lp_, LancioLocker locker_) payable {
        lp = lp_;
        locker = locker_;
    }

    function run(address t, address other_, uint256 v) external {
        target = t;
        other = other_;
        armed = true;
        lp.buy{value: v}(t, 0, block.timestamp + 60);
        armed = false;
    }

    function errCount() external view returns (uint256) {
        return errs.length;
    }

    function _rec(bool ok, bytes memory ret) internal {
        errs.push(ok ? bytes4(0) : bytes4(ret));
    }

    receive() external payable {
        if (!armed) return;
        armed = false;
        address[] memory list = new address[](1);
        list[0] = other;
        bool ok;
        bytes memory ret;
        (ok, ret) = address(lp).call{value: 0.01 ether}(abi.encodeCall(lp.buy, (other, 0, block.timestamp + 60)));
        _rec(ok, ret);
        (ok, ret) = address(lp).call(abi.encodeCall(lp.sell, (other, 1e18, 0, block.timestamp + 60)));
        _rec(ok, ret);
        (ok, ret) = address(lp).call(abi.encodeCall(lp.claimCreatorFees, (list)));
        _rec(ok, ret);
        (ok, ret) = address(lp).call(abi.encodeCall(lp.claimProtocolFees, ()));
        _rec(ok, ret);
        (ok, ret) = address(lp).call{value: 0.001 ether}(abi.encodeCall(lp.create, ("R", "R", "", 0)));
        _rec(ok, ret);
        (ok, ret) = address(lp).call{value: 0.001 ether}(abi.encodeCall(lp.depositPoolFees, (target)));
        _rec(ok, ret);
        (ok, ret) = address(locker).call(abi.encodeCall(locker.collectFees, (target)));
        _rec(ok, ret);
    }
}

/// @dev Code an EIP-7702-delegated EOA would run (simulated with vm.etch: same msg.sender / tx.origin semantics).
contract Batch7702 {
    function buyTwice(LancioLaunchpad lp, address t, uint256 a, uint256 b) external {
        lp.buy{value: a}(t, 0, block.timestamp + 60);
        lp.buy{value: b}(t, 0, block.timestamp + 60);
    }

    function buyOnce(LancioLaunchpad lp, address t, uint256 a) external {
        lp.buy{value: a}(t, 0, block.timestamp + 60);
    }

    /// @dev Drive a second delegated EOA inside the same transaction.
    function relay(Batch7702 other, LancioLaunchpad lp, address t, uint256 a) external {
        other.buyOnce(lp, t, a);
    }

    receive() external payable {}
}

contract AccessReview is Base {
    function setUp() public {
        _deploy(IPoolManager(address(new PoolManager(address(this)))));
    }

    // ================================================================ launch window

    /// Measured on Robinhood Chain mainnet 2026-09-27 (read-only RPC): L2 blocks 74188858 -> 74198858
    /// (10,000 blocks) in 1,005 s  => 0.1005 s per block. ArbSys.arbBlockNumber() returned the L2 number,
    /// eth_getBlockByNumber.l1BlockNumber = 26,070,958 (Ethereum), so the ArbSys choice is correct.
    /// Consequence: the whole window (creation block + next) lasts 0.1-0.2 s. From the third block on,
    /// ONE transaction from ONE contract can take a tenth of the supply.
    function test_window_oneTxTakesTenPercentTwoBlocksAfterCreate() public {
        address t = _create(creator, 0);
        uint256 created = lp.currentBlock();
        _advanceBlocks(2); // ~0.2 s later on mainnet
        assertEq(lp.currentBlock(), created + 2);

        Buyer bot = new Buyer{value: 1 ether}(lp);
        // msg.sender = bot contract, tx.origin = this test contract: a contract, one tx
        uint256 got = bot.buy(t, 0.2835 ether);
        emit log_named_decimal_uint("tokens taken in one contract tx at createdBlock+2 (M)", got / 1e6, 18);
        emit log_named_decimal_uint("share of supply (%)", got * 100 / 1e9, 18);
        assertGe(got, 100_000_000e18, "one tx took >= 10% of supply");
    }

    /// Boundary: blocks createdBlock and createdBlock+1 are in the window, createdBlock+2 is not.
    function test_window_boundaryExact() public {
        address t = _create(creator, 0);
        uint256 created = lp.currentBlock();
        Buyer bot = new Buyer{value: 1 ether}(lp);

        _advanceBlocks(1); // createdBlock + 1: still capped, still EOA-only
        vm.expectRevert(LancioLaunchpad.ContractBuyerInWindow.selector);
        bot.buy(t, 0.001 ether);
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.LaunchCapExceeded.selector);
        lp.buy{value: 0.03 ether}(t, 0, block.timestamp + 60);
        (uint256 rem, uint256 left) = lp.launchCapRemaining(t, alice);
        assertEq(rem, lp.LAUNCH_CAP());
        assertEq(left, 1);

        _advanceBlocks(1); // exactly createdBlock + 2: open
        assertEq(lp.currentBlock(), created + 2);
        (rem, left) = lp.launchCapRemaining(t, alice);
        assertEq(rem, type(uint256).max);
        assertEq(left, 0);
        bot.buy(t, 0.001 ether);
        _buy(alice, t, 0.03 ether);
    }

    /// Selling does not refill the window cap (cap counts gross buys).
    function test_window_sellAndRebuyDoesNotResetCap() public {
        address t = _create(creator, 0);
        _buy(alice, t, 0.0259 ether); // ~9.99M
        _sell(alice, t, IERC20(t).balanceOf(alice));
        assertEq(IERC20(t).balanceOf(alice), 0);
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.LaunchCapExceeded.selector);
        lp.buy{value: 0.001 ether}(t, 0, block.timestamp + 60);
    }

    /// create() has no EOA check: a contract can create + dev-buy 1% inside the window. It cannot
    /// then buy more of that token in the window, and it cannot buy any OTHER token in the window.
    function test_window_contractCreatorDevBuy_noBypassBeyondOnePercent() public {
        Buyer bot = new Buyer{value: 1 ether}(lp);
        address t = bot.create(0.0259 ether); // msg.sender (bot) != tx.origin: allowed
        uint256 got = IERC20(t).balanceOf(address(bot));
        assertGt(got, 9_900_000e18);
        assertLe(got, lp.LAUNCH_CAP());
        assertEq(lp.creatorOf(t), address(bot));
        vm.expectRevert(LancioLaunchpad.ContractBuyerInWindow.selector);
        bot.buy(t, 0.0001 ether);
    }

    /// EIP-7702: a delegated EOA calling the launchpad from its own code still has
    /// msg.sender == tx.origin, but the cap is per address, so batching does not help,
    /// and it cannot drive a second delegated EOA in the same tx.
    function test_window_7702_batchingCannotBypass() public {
        address t = _create(creator, 0);
        bytes memory code = address(new Batch7702()).code;
        vm.etch(alice, code);
        vm.etch(bob, code);

        // two buys in one tx from the same delegated EOA: cumulative cap holds
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.LaunchCapExceeded.selector);
        Batch7702(payable(alice)).buyTwice(lp, t, 0.02 ether, 0.01 ether);

        // alice (tx.origin) drives bob's delegated code: msg.sender = bob != tx.origin
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.ContractBuyerInWindow.selector);
        Batch7702(payable(alice)).relay(Batch7702(payable(bob)), lp, t, 0.02 ether);

        // single in-cap buy from delegated code works (refund-free path)
        vm.prank(alice, alice);
        Batch7702(payable(alice)).buyOnce(lp, t, 0.02 ether);
        assertGt(IERC20(t).balanceOf(alice), 0);
    }

    // ================================================================ reentrancy / griefing

    /// Graduation refund hands control to the buyer after all state is final. Every launchpad
    /// entry point that moves value is behind the shared nonReentrant guard.
    function test_reentrancy_onGraduationRefund() public {
        address other = _createOpen();
        address t = _createOpen();
        Reenterer r = new Reenterer{value: 20 ether}(lp, locker);
        r.run(t, other, 9 ether); // graduates t, refund ~0.9 ETH triggers receive()

        assertTrue(lp.getCurve(t).graduated);
        assertEq(r.errCount(), 7);
        bytes4 guard = ReentrancyGuard.ReentrancyGuardReentrantCall.selector;
        assertEq(r.errs(0), guard, "buy");
        assertEq(r.errs(1), guard, "sell");
        assertEq(r.errs(2), guard, "claimCreatorFees");
        assertEq(r.errs(3), guard, "claimProtocolFees");
        assertEq(r.errs(4), guard, "create");
        assertEq(r.errs(5), LancioLaunchpad.NotLocker.selector, "depositPoolFees");
        assertEq(r.errs(6), bytes4(0), "locker.collectFees reachable but harmless (no fees yet)");
    }

    /// A buyer whose contract rejects the refund only blocks its own graduating buy.
    function test_refundRejectingBuyer_onlyHurtsItself() public {
        address t = _createOpen();
        RejectingBuyer bad = new RejectingBuyer{value: 20 ether}(lp);
        vm.expectRevert(LancioLaunchpad.EthTransferFailed.selector);
        bad.buy(t, 9 ether);
        assertFalse(lp.getCurve(t).graduated);
        _buy(bob, t, 9 ether);
        assertTrue(lp.getCurve(t).graduated);
    }

    function test_claimCreatorFees_duplicatesAndUnknown() public {
        address t = _createOpen();
        _buy(alice, t, 1 ether);
        address[] memory dup = new address[](3);
        dup[0] = t;
        dup[1] = t;
        dup[2] = t;
        uint256 b = creator.balance;
        vm.prank(creator);
        uint256 amt = lp.claimCreatorFees(dup);
        assertEq(amt, 0.006 ether);
        assertEq(creator.balance - b, 0.006 ether);

        address[] memory unk = new address[](1);
        unk[0] = address(0xBEEF);
        vm.prank(creator);
        vm.expectRevert(LancioLaunchpad.UnknownToken.selector);
        lp.claimCreatorFees(unk);
    }

    function test_depositPoolFees_onlyLocker() public {
        address t = _createOpen();
        vm.prank(alice);
        vm.expectRevert(LancioLaunchpad.NotLocker.selector);
        lp.depositPoolFees{value: 1 ether}(t);
    }

    // ================================================================ owner powers

    /// Worst-case owner: pause creation, point treasury at a reverting contract, renounce.
    /// Trading, graduation, pool fee collection and creator claims are unaffected.
    function test_owner_worstCase_cannotTouchTradingOrUserFunds() public {
        address t = _createOpen();
        RevertingReceiver bad = new RevertingReceiver();
        vm.startPrank(owner);
        lp.setCreationPaused(true);
        lp.setTreasury(address(bad));
        vm.expectRevert(LancioLaunchpad.RenounceDisabled.selector);
        lp.renounceOwnership();
        vm.stopPrank();

        _buy(alice, t, 1 ether);
        _sell(alice, t, IERC20(t).balanceOf(alice) / 2);
        _buy(bob, t, 9 ether); // graduates
        assertTrue(lp.getCurve(t).graduated);
        _swapEthForToken(t, 1 ether);
        locker.collectFees(t);
        address[] memory list = new address[](1);
        list[0] = t;
        vm.prank(creator);
        assertGt(lp.claimCreatorFees(list), 0);
    }

    /// Fixed: renounceOwnership() is disabled, so a paused creation can always be resumed by the owner.
    function test_owner_cannotRenounce() public {
        vm.startPrank(owner);
        lp.setCreationPaused(true);
        vm.expectRevert(LancioLaunchpad.RenounceDisabled.selector);
        lp.renounceOwnership();
        lp.setCreationPaused(false);
        vm.stopPrank();
        assertEq(lp.owner(), owner);
    }

    function test_owner_twoStepTransfer() public {
        vm.prank(owner);
        lp.transferOwnership(alice);
        assertEq(lp.owner(), owner);
        vm.prank(bob);
        vm.expectRevert();
        lp.acceptOwnership();
        vm.prank(alice);
        lp.acceptOwnership();
        assertEq(lp.owner(), alice);
    }
}
