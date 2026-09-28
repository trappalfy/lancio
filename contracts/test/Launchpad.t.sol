// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";

import {LancioLaunchpad} from "../src/LancioLaunchpad.sol";
import {LancioLocker} from "../src/LancioLocker.sol";
import {Base, RevertingReceiver} from "./Base.t.sol";

contract LaunchpadTest is Base {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    function setUp() public {
        _deploy(IPoolManager(address(new PoolManager(address(this)))));
    }

    // ------------------------------------------------------------ constants & vectors (brief §7.3)

    function test_constants() public view {
        assertEq(lp.VIRTUAL_ETH_END(), 10.73 ether);
        assertEq(lp.VIRTUAL_ETH_END() * lp.VIRTUAL_TOKEN_END(), lp.K());
        assertEq(lp.GRADUATION_ETH(), 8 ether);
        assertEq(lp.CURVE_SUPPLY() + lp.POOL_RESERVE(), lp.TOTAL_SUPPLY());
    }

    function test_vectors_quotes() public {
        address t = _createOpen();
        (uint256 out1, uint256 used1,, uint256 fee1, bool g1) = lp.quoteBuy(t, 1 ether);
        assertEq(fee1, 0.01 ether);
        assertEq(used1, 1 ether);
        assertFalse(g1);
        assertEq(out1 / 1e17, 2855564516); // ≈ 285,556,451.6 tokens
        (uint256 out01,,, uint256 fee01,) = lp.quoteBuy(t, 0.1 ether);
        assertEq(fee01, 0.001 ether);
        assertEq(out01 / 1e17, 375493107); // ≈ 37,549,310.7 tokens
        // start MC ≈ 2.544 ETH
        LancioLaunchpad.CurveView memory c = lp.getCurve(t);
        assertEq(c.vEth * 1e9 / (c.vTok / 1e18) / 1e15, 2544);
    }

    function test_tokenSupplyAndHoldings() public {
        address t = _create(creator, 0);
        assertEq(IERC20(t).totalSupply(), 1_000_000_000e18);
        assertEq(IERC20(t).balanceOf(address(lp)), 1_000_000_000e18);
        assertEq(lp.creatorOf(t), creator);
    }

    // ------------------------------------------------------------ launch window

    function test_devBuy_atCap() public {
        vm.prank(creator, creator);
        address t = lp.create{value: 0.025941446449442684 ether}("A", "A", "", 0);
        uint256 bal = IERC20(t).balanceOf(creator);
        assertLe(bal, lp.LAUNCH_CAP());
        assertGt(bal, 9_999_999e18);
    }

    function test_devBuy_overCap_reverts() public {
        vm.prank(creator, creator);
        vm.expectRevert(LancioLaunchpad.LaunchCapExceeded.selector);
        lp.create{value: 0.026 ether}("A", "A", "", 0);
    }

    function test_devBuy_countsAgainstCreatorCap() public {
        vm.prank(creator, creator);
        address t = lp.create{value: 0.02 ether}("A", "A", "", 0);
        vm.prank(creator, creator);
        vm.expectRevert(LancioLaunchpad.LaunchCapExceeded.selector);
        lp.buy{value: 0.01 ether}(t, 0, block.timestamp + 60);
    }

    function test_window_cumulativeAndEnds() public {
        address t = _create(creator, 0);
        uint256 b0 = block.number;
        _buy(alice, t, 0.015 ether);
        vm.roll(b0 + 1); // still inside: creation block + next
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.LaunchCapExceeded.selector);
        lp.buy{value: 0.015 ether}(t, 0, block.timestamp + 60);
        (uint256 remaining, uint256 left) = lp.launchCapRemaining(t, alice);
        assertEq(left, 1);
        assertGt(remaining, 0);
        vm.roll(b0 + 2); // window closed
        (, left) = lp.launchCapRemaining(t, alice);
        assertEq(left, 0);
        _buy(alice, t, 1 ether);
    }

    function test_window_blocksContractBuyers() public {
        address t = _create(creator, 0);
        vm.prank(alice); // tx.origin != msg.sender
        vm.expectRevert(LancioLaunchpad.ContractBuyerInWindow.selector);
        lp.buy{value: 0.01 ether}(t, 0, block.timestamp + 60);
        vm.roll(block.number + 2);
        vm.prank(alice);
        lp.buy{value: 0.01 ether}(t, 0, block.timestamp + 60);
    }

    // ------------------------------------------------------------ trading

    function test_buySell_feesSplit() public {
        address t = _createOpen();
        _buy(alice, t, 1 ether);
        assertEq(lp.getCurve(t).creatorFees, 0.006 ether);
        assertEq(lp.protocolFees(), 0.004 ether);
        uint256 bal = IERC20(t).balanceOf(alice);
        uint256 before = alice.balance;
        uint256 out = _sell(alice, t, bal);
        assertEq(alice.balance - before, out);
        assertLt(out, 1 ether);
        LancioLaunchpad.CurveView memory c = lp.getCurve(t);
        assertEq(c.sold, 0);
        assertEq(c.vEth, lp.VIRTUAL_ETH_0()); // round trip returns the curve exactly to start
    }

    function test_slippageAndDeadline() public {
        address t = _createOpen();
        (uint256 q,,,,) = lp.quoteBuy(t, 1 ether);
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.SlippageExceeded.selector);
        lp.buy{value: 1 ether}(t, q + 1, block.timestamp + 60);
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.DeadlineExpired.selector);
        lp.buy{value: 1 ether}(t, 0, block.timestamp - 1);
        vm.prank(alice, alice);
        assertEq(lp.buy{value: 1 ether}(t, q, block.timestamp), q);
    }

    function test_sell_cannotExceedSold() public {
        address t = _createOpen();
        _buy(alice, t, 0.1 ether);
        deal(t, bob, 1e24);
        uint256 tooMuch = IERC20(t).balanceOf(alice) + 1;
        vm.startPrank(bob, bob);
        IERC20(t).approve(address(lp), type(uint256).max);
        vm.expectRevert(LancioLaunchpad.ExceedsSold.selector);
        lp.sell(t, tooMuch, 0, block.timestamp + 60);
        vm.stopPrank();
    }

    function test_unknownToken_reverts() public {
        vm.prank(alice, alice);
        vm.expectRevert(LancioLaunchpad.UnknownToken.selector);
        lp.buy{value: 1 ether}(address(0xdead), 0, block.timestamp + 60);
    }

    function test_symbolValidation() public {
        vm.startPrank(creator, creator);
        vm.expectRevert(LancioLaunchpad.InvalidSymbol.selector);
        lp.create("A", "abc", "", 0);
        vm.expectRevert(LancioLaunchpad.InvalidSymbol.selector);
        lp.create("A", "TOOLONGTICK", "", 0);
        vm.expectRevert(LancioLaunchpad.InvalidName.selector);
        lp.create("", "A", "", 0);
        lp.create("Name", "AZ09", "", 0);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ graduation

    function test_graduation_partialFillRefundAndPool() public {
        address t = _createOpen();
        uint256 before = alice.balance;
        (uint256 qOut, uint256 qUsed, uint256 qRefund, uint256 qFee, bool g) = lp.quoteBuy(t, 20 ether);
        assertTrue(g);
        uint256 gasBefore = gasleft();
        uint256 out = _buy(alice, t, 20 ether);
        emit log_named_uint("graduating buy gas", gasBefore - gasleft());

        assertEq(out, 800_000_000e18);
        assertEq(out, qOut);
        assertEq(before - alice.balance, qUsed);
        assertEq(qUsed + qRefund, 20 ether);
        assertEq(qUsed - qFee, 8 ether); // net into the curve is exactly 8 ETH
        assertApproxEqAbs(qFee, 0.0808 ether, 0.0001 ether);

        LancioLaunchpad.CurveView memory c = lp.getCurve(t);
        assertTrue(c.graduated);
        assertEq(c.realEth, 8 ether);

        // all ETH left in the launchpad is owed as fees; no tokens left behind
        assertEq(address(lp).balance, lp.protocolFees() + c.creatorFees);
        assertEq(IERC20(t).balanceOf(address(lp)), 0);

        // pool opened at exactly 25,000,000 tokens per ETH
        PoolKey memory key = locker.poolKeyOf(t);
        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        assertEq(sqrtP, uint160(5000 << 96));
        assertGt(locker.liquidityOf(t), 0);
        // dust left in the locker is negligible
        assertLt(address(locker).balance, 1e9);
        assertLt(IERC20(t).balanceOf(address(locker)), 1e9);
        emit log_named_uint("locker ETH dust (wei)", address(locker).balance);
        emit log_named_uint("locker token dust (units)", IERC20(t).balanceOf(address(locker)));

        // curve closed
        vm.prank(bob, bob);
        vm.expectRevert(LancioLaunchpad.CurveClosed.selector);
        lp.buy{value: 1 ether}(t, 0, block.timestamp + 60);
        vm.startPrank(alice, alice);
        IERC20(t).approve(address(lp), 1e18);
        vm.expectRevert(LancioLaunchpad.CurveClosed.selector);
        lp.sell(t, 1e18, 0, block.timestamp + 60);
        vm.stopPrank();
    }

    function test_graduation_exactAmount() public {
        address t = _createOpen();
        uint256 exact = (uint256(8 ether) * 100 + 98) / 99; // ceil(8e18 * 100 / 99)
        _buy(alice, t, exact);
        assertTrue(lp.getCurve(t).graduated);
    }

    function test_hook_blocksForeignInitialize() public {
        address t = _createOpen();
        PoolKey memory key = locker.poolKeyOf(t);
        vm.expectRevert();
        pm.initialize(key, uint160(1 << 96));

        // A hook-less pool for the same pair at a silly price does not affect graduation.
        PoolKey memory rogue = PoolKey(Currency.wrap(address(0)), Currency.wrap(t), 3000, 60, IHooks(address(0)));
        pm.initialize(rogue, uint160(1 << 96));
        _buy(alice, t, 20 ether);
        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        assertEq(sqrtP, uint160(5000 << 96));
    }

    function test_noFreeJumpAtHandover() public {
        address t = _createOpen();
        _buy(alice, t, 20 ether);
        // Selling the last tokens bought on the curve straight into the pool must not beat the curve cost.
        uint256 ethBefore = bob.balance;
        deal(t, bob, 10_000_000e18);
        _swapTokenForEth(t, 10_000_000e18);
        uint256 got = bob.balance - ethBefore;
        // last curve price 3.93e-8 ETH/token, /0.99 with fee ≈ 3.97e-8 → 10M tokens cost ≈ 0.397 ETH
        assertLt(got, 0.397 ether);
    }

    // ------------------------------------------------------------ pool fees

    function test_collectFees_split() public {
        address t = _createOpen();
        _buy(alice, t, 20 ether);
        uint256 creatorBefore = lp.getCurve(t).creatorFees;
        uint256 protoBefore = lp.protocolFees();

        _swapEthForToken(t, 2 ether);
        _swapTokenForEth(t, IERC20(t).balanceOf(bob) / 2);
        (uint256 pe, uint256 pt) = locker.pendingFees(t);
        assertApproxEqAbs(pe, 0.02 ether, 1e12); // 1% of 2 ETH
        assertGt(pt, 0);

        uint256 tTreasury = IERC20(t).balanceOf(treasury);
        uint256 tCreator = IERC20(t).balanceOf(creator);
        (uint256 e, uint256 tk) = locker.collectFees(t);
        assertApproxEqAbs(e, pe, 1);
        assertApproxEqAbs(tk, pt, 1);
        assertEq(lp.getCurve(t).creatorFees - creatorBefore, e / 2);
        assertEq(lp.protocolFees() - protoBefore, e - e / 2);
        assertEq(IERC20(t).balanceOf(creator) - tCreator, tk / 2);
        assertEq(IERC20(t).balanceOf(treasury) - tTreasury, tk - tk / 2);

        (pe, pt) = locker.pendingFees(t);
        assertEq(pe, 0);
        assertEq(pt, 0);

        // creator claims everything in one call
        address[] memory list = new address[](1);
        list[0] = t;
        uint256 owed = lp.getCurve(t).creatorFees;
        uint256 b = creator.balance;
        vm.prank(creator);
        lp.claimCreatorFees(list);
        assertEq(creator.balance - b, owed);
        assertEq(lp.getCurve(t).creatorFees, 0);
    }

    function test_locker_onlyLaunchpadCanLock() public {
        vm.expectRevert(LancioLocker.NotLaunchpad.selector);
        locker.lock{value: 1 ether}(address(1));
    }

    // ------------------------------------------------------------ creator & admin

    function test_claim_onlyCreator_andTransfer() public {
        address t = _createOpen();
        _buy(alice, t, 1 ether);
        address[] memory list = new address[](1);
        list[0] = t;
        vm.prank(alice);
        vm.expectRevert(LancioLaunchpad.NotCreator.selector);
        lp.claimCreatorFees(list);

        vm.prank(creator);
        lp.transferCreator(t, bob);
        uint256 b = bob.balance;
        vm.prank(bob);
        lp.claimCreatorFees(list);
        assertEq(bob.balance - b, 0.006 ether);
    }

    function test_revertingTreasury_doesNotBlockTrading() public {
        RevertingReceiver bad = new RevertingReceiver();
        vm.prank(owner);
        lp.setTreasury(address(bad));
        address t = _createOpen();
        _buy(alice, t, 1 ether);
        _sell(alice, t, IERC20(t).balanceOf(alice) / 2);
        _buy(bob, t, 20 ether); // graduates
        _swapEthForToken(t, 1 ether);
        locker.collectFees(t);
        vm.expectRevert(LancioLaunchpad.EthTransferFailed.selector);
        lp.claimProtocolFees();
    }

    function test_admin_onlyOwner_andPauseOnlyCreation() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        lp.setTreasury(alice);
        address t = _createOpen();
        vm.prank(owner);
        lp.setCreationPaused(true);
        vm.prank(creator, creator);
        vm.expectRevert(LancioLaunchpad.CreationPaused.selector);
        lp.create("A", "A", "", 0);
        _buy(alice, t, 1 ether); // trading unaffected
        _sell(alice, t, IERC20(t).balanceOf(alice));
    }

    function test_protocolClaim() public {
        address t = _createOpen();
        _buy(alice, t, 1 ether);
        uint256 b = treasury.balance;
        lp.claimProtocolFees();
        assertEq(treasury.balance - b, 0.004 ether);
    }

    // ------------------------------------------------------------ fuzz

    /// Random buy/sell sequences keep k, keep the contract solvent, and never let a round trip profit.
    function testFuzz_sequencesStaySolvent(uint96[8] memory amounts, bool[8] memory sides) public {
        address t = _createOpen();
        address[] memory list = new address[](1);
        list[0] = t;
        for (uint256 i; i < 8; ++i) {
            if (lp.getCurve(t).graduated) break;
            address who = i % 2 == 0 ? alice : bob;
            if (sides[i]) {
                uint256 ethIn = bound(amounts[i], 1e9, 5 ether);
                vm.deal(who, ethIn);
                _buy(who, t, ethIn);
            } else {
                uint256 bal = IERC20(t).balanceOf(who);
                uint256 amt = bound(amounts[i], 0, bal);
                if (amt == 0) continue;
                (uint256 q,) = lp.quoteSell(t, amt);
                if (q == 0) continue;
                _sell(who, t, amt);
            }
            LancioLaunchpad.CurveView memory c = lp.getCurve(t);
            assertGe(c.vEth * c.vTok, lp.K());
            assertGe(address(lp).balance, _liabilities(list));
        }
    }

    function testFuzz_roundTripNoProfit(uint256 ethIn) public {
        address t = _createOpen();
        ethIn = bound(ethIn, 1e6, 8 ether);
        uint256 out = _buy(alice, t, ethIn);
        uint256 back = _sell(alice, t, out);
        assertLt(back, ethIn);
    }
}
