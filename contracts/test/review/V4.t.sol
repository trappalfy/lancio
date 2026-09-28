// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {IUnlockCallback} from "v4-core/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolDonateTest} from "v4-core/test/PoolDonateTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";
import {LiquidityAmounts} from "v4-periphery/libraries/LiquidityAmounts.sol";

import {LancioLaunchpad} from "../../src/LancioLaunchpad.sol";
import {LancioLocker} from "../../src/LancioLocker.sol";
import {LancioHook} from "../../src/LancioHook.sol";
import {Base, RevertingReceiver} from "../Base.t.sol";

/// Buys (after the launch window) from a contract; on the refund it re-enters the locker / launchpad.
contract GradBuyer {
    LancioLaunchpad lp;
    LancioLocker locker;
    address token;
    bool public reenterCollectOk;
    bool public reenterBuyReverted;

    constructor(LancioLaunchpad lp_, LancioLocker locker_) {
        lp = lp_;
        locker = locker_;
    }

    function go(address t) external payable {
        token = t;
        lp.buy{value: msg.value}(t, 0, block.timestamp);
    }

    function goTwo(address a, address b) external payable {
        lp.buy{value: msg.value / 2}(a, 0, block.timestamp);
        lp.buy{value: msg.value / 2}(b, 0, block.timestamp);
    }

    receive() external payable {
        if (token == address(0) || msg.sender != address(lp)) return;
        try locker.collectFees(token) {
            reenterCollectOk = true;
        } catch {}
        try lp.buy{value: 1}(token, 0, block.timestamp) {} catch {
            reenterBuyReverted = true;
        }
    }
}

/// Syncs a currency on the PoolManager (allowed while locked) and then graduates in the same tx.
contract PreSyncBuyer {
    function go(IPoolManager pm, LancioLaunchpad lp, address t) external payable {
        pm.sync(Currency.wrap(t));
        lp.buy{value: msg.value}(t, 0, block.timestamp);
    }
}

/// Tries to graduate from inside its own PoolManager unlock (e.g. a v4-native router / hook).
contract UnlockBuyer is IUnlockCallback {
    IPoolManager pm;
    LancioLaunchpad lp;
    address t;

    function go(IPoolManager pm_, LancioLaunchpad lp_, address t_) external payable {
        pm = pm_;
        lp = lp_;
        t = t_;
        pm.unlock("");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        lp.buy{value: address(this).balance}(t, 0, block.timestamp);
        return "";
    }

    receive() external payable {}
}

/// Unlocks the PoolManager and, inside the callback, tries to drive the locker's callback with an ADD/REMOVE payload.
contract CallbackSpoofer is IUnlockCallback {
    IPoolManager pm;
    LancioLocker locker;
    bytes payload;

    function go(IPoolManager pm_, LancioLocker locker_, bytes memory payload_) external {
        pm = pm_;
        locker = locker_;
        payload = payload_;
        pm.unlock("");
    }

    function unlockCallback(bytes calldata) external returns (bytes memory) {
        return locker.unlockCallback(payload);
    }
}

contract V4ReviewTest is Base {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    PoolDonateTest donateRouter;
    PoolModifyLiquidityTest lpRouter;

    function setUp() public {
        _deploy(IPoolManager(address(new PoolManager(address(this)))));
        donateRouter = new PoolDonateTest(pm);
        lpRouter = new PoolModifyLiquidityTest(pm);
    }

    function _graduate(address t) internal {
        _buy(alice, t, 20 ether);
        assertTrue(lp.getCurve(t).graduated);
    }

    function _expectedLiquidity() internal pure returns (uint128) {
        return LiquidityAmounts.getLiquidityForAmounts(
            uint160(5000 << 96),
            TickMath.getSqrtPriceAtTick(-887_200),
            TickMath.getSqrtPriceAtTick(887_200),
            8 ether,
            200_000_000e18
        );
    }

    // ------------------------------------------------------------------ constants / orientation

    function test_fullRangeTicksAndOrientation() public {
        assertEq(TickMath.minUsableTick(200), locker.TICK_LOWER());
        assertEq(TickMath.maxUsableTick(200), locker.TICK_UPPER());
        address t = _createOpen();
        PoolKey memory key = locker.poolKeyOf(t);
        assertEq(Currency.unwrap(key.currency0), address(0));
        assertEq(Currency.unwrap(key.currency1), t);
        _graduate(t);
        (uint160 sqrtP, int24 tick,,) = pm.getSlot0(key.toId());
        assertEq(sqrtP, uint160(5000 << 96));
        // price = token1/token0 = (sqrtP/2^96)^2 = 25,000,000 tokens per ETH
        assertEq(uint256(sqrtP) * uint256(sqrtP) >> 192, 25_000_000);
        emit log_named_int("initial tick", tick);
    }

    // ------------------------------------------------------------------ hook

    function test_hook_rejectsEveryForeignInitialize() public {
        address t = _createOpen();
        address t2 = _create(bob, 0);
        PoolKey memory k = locker.poolKeyOf(t);

        // canonical key, any price, including the canonical one
        vm.expectRevert();
        pm.initialize(k, uint160(5000 << 96));
        vm.expectRevert();
        pm.initialize(k, uint160(1 << 96));

        // same hook, other fee / spacing / dynamic fee / other pair
        PoolKey memory k2 = locker.poolKeyOf(t); // fresh copy (memory structs alias)
        k2.fee = 3000;
        vm.expectRevert();
        pm.initialize(k2, uint160(5000 << 96));
        k2 = locker.poolKeyOf(t);
        k2.tickSpacing = 60;
        vm.expectRevert();
        pm.initialize(k2, uint160(5000 << 96));
        k2 = locker.poolKeyOf(t);
        k2.fee = 0x800000; // dynamic fee flag
        vm.expectRevert();
        pm.initialize(k2, uint160(5000 << 96));
        k2 = locker.poolKeyOf(t);
        k2.currency0 = Currency.wrap(t < t2 ? t : t2);
        k2.currency1 = Currency.wrap(t < t2 ? t2 : t);
        vm.expectRevert();
        pm.initialize(k2, uint160(1 << 96));

        // a caller pretending to be the locker cannot reach the hook except through the PoolManager
        vm.expectRevert(LancioHook.NotPoolManager.selector);
        hook.beforeInitialize(address(locker), k, uint160(1 << 96));

        // after graduation the pool cannot be re-initialised (not even by the locker)
        _graduate(t);
        k = locker.poolKeyOf(t);
        vm.expectRevert();
        pm.initialize(k, uint160(1 << 96));
        vm.prank(address(locker));
        vm.expectRevert();
        pm.initialize(k, uint160(1 << 96));
        (uint160 sqrtP,,,) = pm.getSlot0(k.toId());
        assertEq(sqrtP, uint160(5000 << 96));
    }

    function test_donateBeforeGraduation_impossible() public {
        address t = _createOpen();
        PoolKey memory k = locker.poolKeyOf(t);
        vm.deal(address(this), 1 ether);
        vm.expectRevert(IPoolManager.PoolNotInitialized.selector);
        donateRouter.donate{value: 1 ether}(k, 1 ether, 0, "");
        vm.expectRevert(IPoolManager.PoolNotInitialized.selector);
        lpRouter.modifyLiquidity{value: 1 ether}(
            k, ModifyLiquidityParams({tickLower: -887_200, tickUpper: 887_200, liquidityDelta: 1e18, salt: 0}), ""
        );
    }

    // ------------------------------------------------------------------ donations & dust

    function test_donations_doNotChangeGraduation() public {
        address t = _createOpen();
        _buy(bob, t, 1 ether);
        uint256 bal = IERC20(t).balanceOf(bob);
        vm.startPrank(bob);
        IERC20(t).transfer(address(locker), bal / 4); // tokens to the locker
        IERC20(t).transfer(address(lp), bal / 4); // tokens to the launchpad
        IERC20(t).transfer(address(pm), bal / 4); // tokens straight to the PoolManager (unaccounted)
        vm.stopPrank();
        vm.deal(address(locker), 3 ether); // forced ETH (selfdestruct / coinbase)
        uint256 donated = bal / 4;

        _graduate(t);
        PoolKey memory k = locker.poolKeyOf(t);
        (uint160 sqrtP,,,) = pm.getSlot0(k.toId());
        assertEq(sqrtP, uint160(5000 << 96));
        assertEq(locker.liquidityOf(t), _expectedLiquidity());
        assertEq(pm.getLiquidity(k.toId()), _expectedLiquidity());
        // donations just sit there (nothing can move them), graduation used exactly the 8 ETH + 200M
        assertEq(IERC20(t).balanceOf(address(lp)), donated);
        assertGe(IERC20(t).balanceOf(address(locker)), donated);
        assertGe(address(locker).balance, 3 ether);
    }

    function test_graduation_dust() public {
        address t = _createOpen();
        uint256 pmEth = address(pm).balance;
        _graduate(t);
        uint256 ethIn = address(pm).balance - pmEth;
        uint256 tokIn = IERC20(t).balanceOf(address(pm));
        emit log_named_uint("ETH into pool (wei)", ethIn);
        emit log_named_uint("ETH dust in locker (wei)", address(locker).balance);
        emit log_named_uint("token dust in locker (units)", IERC20(t).balanceOf(address(locker)));
        assertEq(ethIn + address(locker).balance, 8 ether);
        assertEq(tokIn + IERC20(t).balanceOf(address(locker)), 200_000_000e18);
        assertLt(address(locker).balance, 1e6);
    }

    // ------------------------------------------------------------------ graduation griefing / composition

    function test_twoGraduationsInOneTx() public {
        address a = _createOpen();
        address b = _create(bob, 0);
        vm.roll(block.number + 2);
        GradBuyer g = new GradBuyer(lp, locker);
        vm.deal(address(g), 0);
        g.goTwo{value: 40 ether}(a, b);
        assertTrue(lp.getCurve(a).graduated);
        assertTrue(lp.getCurve(b).graduated);
    }

    function test_graduatingBuyer_reentryOnRefund() public {
        address t = _createOpen();
        GradBuyer g = new GradBuyer(lp, locker);
        g.go{value: 20 ether}(t);
        assertTrue(lp.getCurve(t).graduated);
        assertTrue(g.reenterCollectOk()); // harmless: fees are 0
        assertTrue(g.reenterBuyReverted());
    }

    /// Self-grief only: the tx that pre-syncs a currency on the PoolManager and then graduates reverts.
    function test_preSync_selfGriefOnly() public {
        address t = _createOpen();
        PreSyncBuyer s = new PreSyncBuyer();
        vm.expectRevert(IPoolManager.NonzeroNativeValue.selector);
        s.go{value: 20 ether}(pm, lp, t);
        _graduate(t); // anybody else still graduates
    }

    /// A graduating buy made from inside a v4 unlock (v4-native router / hook) always reverts.
    function test_graduateInsideUnlock_reverts() public {
        address t = _createOpen();
        UnlockBuyer u = new UnlockBuyer();
        vm.expectRevert(IPoolManager.AlreadyUnlocked.selector);
        u.go{value: 20 ether}(pm, lp, t);
        // a non-graduating buy from the same context works
        UnlockBuyer u2 = new UnlockBuyer();
        u2.go{value: 1 ether}(pm, lp, t);
        assertGt(IERC20(t).balanceOf(address(u2)), 0);
    }

    // ------------------------------------------------------------------ locker cannot lose the position

    function test_locker_positionCannotBeMoved() public {
        address t = _createOpen();
        _graduate(t);
        PoolKey memory k = locker.poolKeyOf(t);
        uint128 L = locker.liquidityOf(t);

        vm.expectRevert(LancioLocker.NotPoolManager.selector);
        locker.unlockCallback(abi.encode(uint8(1), t, uint128(1)));

        CallbackSpoofer s = new CallbackSpoofer();
        vm.expectRevert(LancioLocker.NotPoolManager.selector);
        s.go(pm, locker, abi.encode(uint8(2), t, uint128(0)));

        vm.prank(address(lp));
        vm.expectRevert(LancioLocker.AlreadyLocked.selector);
        locker.lock{value: 0}(t);

        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(locker).call{value: 1}("");
        assertFalse(ok);

        (uint128 liq,,) = pm.getPositionInfo(k.toId(), address(locker), -887_200, 887_200, bytes32(0));
        assertEq(liq, L);
    }

    // ------------------------------------------------------------------ collectFees

    function test_collectFees_cannotBeBlockedByRecipients() public {
        address t = _createOpen();
        _graduate(t);
        RevertingReceiver bad = new RevertingReceiver();
        vm.prank(creator);
        lp.transferCreator(t, address(bad));
        address badTreasury = address(new RevertingReceiver());
        vm.prank(owner);
        lp.setTreasury(badTreasury);

        _swapEthForToken(t, 1 ether);
        _swapTokenForEth(t, IERC20(t).balanceOf(bob) / 2);
        uint256 cf0 = lp.getCurve(t).creatorFees;
        uint256 pf0 = lp.protocolFees();
        (uint256 e, uint256 tk) = locker.collectFees(t);
        assertGt(e, 0);
        assertGt(tk, 0);
        assertEq(IERC20(t).balanceOf(address(bad)), tk / 2);
        assertEq(IERC20(t).balanceOf(badTreasury), tk - tk / 2);
        assertEq(lp.getCurve(t).creatorFees - cf0, e / 2);
        assertEq(lp.protocolFees() - pf0, e - e / 2);
    }

    function test_collectFees_zeroFees_and_repeat() public {
        address t = _createOpen();
        _graduate(t);
        (uint256 e, uint256 tk) = locker.collectFees(t);
        assertEq(e, 0);
        assertEq(tk, 0);
        _swapEthForToken(t, 0.5 ether);
        locker.collectFees(t);
        (e, tk) = locker.collectFees(t);
        assertEq(e + tk, 0);
    }

    /// PoolManager owner turns the protocol fee to the max (0.1% per direction) on our pool:
    /// collect/pending stay exact, the LP still gets ~1% and the handover still has no free jump.
    function test_protocolFeeSwitch_maxFee() public {
        address t = _createOpen();
        _graduate(t);
        PoolKey memory k = locker.poolKeyOf(t);
        pm.setProtocolFeeController(address(this));
        pm.setProtocolFee(k, 1000 | (1000 << 12));

        _swapEthForToken(t, 1 ether);
        (uint256 pe, uint256 pt) = locker.pendingFees(t);
        emit log_named_uint("LP ETH fee on 1 ETH swap with 0.1% protocol fee", pe);
        assertApproxEqRel(pe, 0.00999 ether, 1e15);
        _swapTokenForEth(t, IERC20(t).balanceOf(bob));
        (pe, pt) = locker.pendingFees(t);
        (uint256 e, uint256 tk) = locker.collectFees(t);
        assertEq(e, pe);
        assertEq(tk, pt);
        (pe, pt) = locker.pendingFees(t);
        assertEq(pe + pt, 0);
    }

    function testFuzz_pendingEqualsCollected(uint64[4] memory amts, bool[4] memory dir) public {
        address t = _createOpen();
        _graduate(t);
        vm.deal(bob, 1000 ether);
        for (uint256 i; i < 4; ++i) {
            if (dir[i]) {
                _swapEthForToken(t, bound(amts[i], 1e9, 50 ether));
            } else {
                uint256 b = IERC20(t).balanceOf(bob);
                if (b < 1e18) continue;
                _swapTokenForEth(t, bound(amts[i], 1e18, b));
            }
            if (i == 1) locker.collectFees(t);
        }
        (uint256 pe, uint256 pt) = locker.pendingFees(t);
        (uint256 e, uint256 tk) = locker.collectFees(t);
        assertEq(e, pe);
        assertEq(tk, pt);
    }

    // ------------------------------------------------------------------ handover (sqrtPrice orientation)

    /// Whoever graduates the token and dumps the tokens bought on the curve straight into the pool loses.
    function testFuzz_noFreeJumpAtHandover(uint256 pre) public {
        address t = _createOpen();
        pre = bound(pre, 0, 8 ether);
        if (pre > 0) {
            (,,,, bool g) = lp.quoteBuy(t, pre);
            if (g) pre = 0;
            else _buy(alice, t, pre);
        }
        vm.deal(bob, 100 ether);
        uint256 b0 = bob.balance;
        _buy(bob, t, 20 ether);
        assertTrue(lp.getCurve(t).graduated);
        uint256 paid = b0 - bob.balance;
        uint256 got = IERC20(t).balanceOf(bob);
        uint256 b1 = bob.balance;
        _swapTokenForEth(t, got);
        assertLt(bob.balance - b1, paid);
    }

    // ------------------------------------------------------------------ fee share of the locked position

    /// Anyone can add concentrated liquidity to the canonical pool; the locked full-range position then earns only
    /// a small share of "the pool's trading fees".
    function test_thirdPartyLiquidity_dilutesLockedFees() public {
        address t = _createOpen();
        _graduate(t);
        PoolKey memory k = locker.poolKeyOf(t);
        (, int24 tick,,) = pm.getSlot0(k.toId());
        int24 lower = (tick / 200) * 200;

        deal(t, alice, 50_000_000e18);
        uint256 e0 = alice.balance;
        uint256 tk0 = IERC20(t).balanceOf(alice);
        vm.startPrank(alice);
        IERC20(t).approve(address(lpRouter), type(uint256).max);
        lpRouter.modifyLiquidity{value: 5 ether}(
            k,
            ModifyLiquidityParams({
                tickLower: lower,
                tickUpper: lower + 200,
                liquidityDelta: int256(uint256(locker.liquidityOf(t))) * 10,
                salt: 0
            }),
            ""
        );
        vm.stopPrank();
        uint256 ethUsed = e0 - alice.balance;
        uint256 tokUsed = tk0 - IERC20(t).balanceOf(alice);
        emit log_named_uint("third-party LP: ETH deposited", ethUsed);
        emit log_named_uint("third-party LP: tokens deposited", tokUsed);

        _swapEthForToken(t, 0.1 ether);
        (uint256 pe,) = locker.pendingFees(t);
        emit log_named_uint("locked position fee on 0.1 ETH swap (of 0.001 ETH)", pe);
        assertLt(pe, 0.0001 ether); // < 10% of the swap fee reaches creator + Lancio
    }
}
