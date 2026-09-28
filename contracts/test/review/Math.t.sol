// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";

import {LancioLaunchpad} from "../../src/LancioLaunchpad.sol";
import {Base} from "../Base.t.sol";

/// @notice Review lens: curve math and rounding.
///         Every buy/sell below is checked against an independent model to the wei:
///         paid == quote, tokens == quote, fees == quote, the trade never beats the exact x*y=k curve,
///         the launchpad holds EXACTLY sum(realEth of live curves) + all fee balances, the state stays
///         on the curve (vEth == ceil(K / vTok)), and every graduation moves exactly 8 ETH / 200M tokens.
contract MathReview is Base {
    uint256 internal constant VE0 = 2.73 ether;
    uint256 internal constant VT0 = 1_073_000_000e18;
    uint256 internal constant VTE = 273_000_000e18;
    uint256 internal constant VEE = 10.73 ether;
    uint256 internal constant KK = VE0 * VT0;
    uint256 internal constant SUPPLY = 1_000_000_000e18;
    uint256 internal constant RESERVE = 200_000_000e18;

    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    address[] internal toks;
    address[] internal actors;

    uint256 internal graduations;
    uint256 internal nBuys;
    uint256 internal nSells;
    uint256 internal nDustSellReverts;
    uint256 internal maxLockerEthDust;
    uint256 internal maxLockerTokDust;

    function setUp() public {
        _deploy(IPoolManager(address(new PoolManager(address(this)))));
        actors.push(alice);
        actors.push(bob);
        actors.push(carol);
        actors.push(dave);
    }

    // ------------------------------------------------------------ helpers

    function _ceil(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    function _rand(uint256 seed, uint256 i, uint256 salt) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, i, salt)));
    }

    /// @dev Smallest gross ETH that completes the curve under the contract's own rule
    ///      (graduates iff ethIn - floor(ethIn/100) >= VEE - vEth).
    function _minGraduating(uint256 vEth) internal pure returns (uint256 m) {
        uint256 nN = VEE - vEth;
        m = _ceil(nN * 100, 99);
        while (m > 1 && (m - 1) - (m - 1) / 100 >= nN) --m;
    }

    function _checkedBuy(address who, address t, uint256 ethIn) internal returns (bool graduated) {
        LancioLaunchpad.CurveView memory c0 = lp.getCurve(t);
        (uint256 qOut, uint256 qUsed, uint256 qRefund, uint256 qFee, bool qGrad) = lp.quoteBuy(t, ethIn);
        vm.deal(who, who.balance + ethIn);
        uint256 ethBefore = who.balance;
        uint256 tokBefore = IERC20(t).balanceOf(who);
        uint256 feesBefore = c0.creatorFees + lp.protocolFees();
        uint256 pmEth = address(pm).balance;
        uint256 lockerEth = address(locker).balance;

        // independent graduation rule
        bool expectGrad = ethIn - ethIn / 100 >= VEE - c0.vEth;
        assertEq(qGrad, expectGrad, "graduation decision");

        vm.prank(who, who);
        lp.buy{value: ethIn}(t, qOut, block.timestamp);
        ++nBuys;

        LancioLaunchpad.CurveView memory c1 = lp.getCurve(t);
        assertEq(ethBefore - who.balance, qUsed, "paid != quoted ethUsed");
        assertEq(qUsed + qRefund, ethIn, "used + refund != sent");
        assertEq(IERC20(t).balanceOf(who) - tokBefore, qOut, "tokens != quote");
        assertEq(c1.creatorFees + lp.protocolFees() - feesBefore, qFee, "fee accrual != quote");
        assertGe(qFee, qUsed / 100, "fee below floor(1%)");
        assertLe(qFee, qUsed / 100 + 1, "fee above 1% + 1 wei");

        uint256 netIn = qUsed - qFee;
        assertEq(c1.vEth - c0.vEth, netIn, "vEth delta != net ETH in");
        assertEq(c0.vTok - c1.vTok, qOut, "vTok delta != tokens out");
        // buyer never beats the exact curve
        assertGe((c0.vEth + netIn) * (c0.vTok - qOut), KK, "buy beat x*y=k");

        if (qGrad) {
            graduated = true;
            ++graduations;
            assertTrue(c1.graduated, "not graduated");
            assertEq(c1.vEth, VEE);
            assertEq(c1.vTok, VTE);
            assertEq(c1.realEth, 8 ether, "realEth != 8 ETH at graduation");
            assertEq(c1.sold, 800_000_000e18);
            assertEq(netIn, VEE - c0.vEth, "net in != ETH needed");
            assertEq(IERC20(t).balanceOf(address(lp)), 0, "tokens left on launchpad");

            uint256 toPool = address(pm).balance - pmEth;
            uint256 ethDust = address(locker).balance - lockerEth;
            assertEq(toPool + ethDust, 8 ether, "ETH to pool+locker != 8 ETH");
            uint256 tokPool = IERC20(t).balanceOf(address(pm));
            uint256 tokDust = IERC20(t).balanceOf(address(locker));
            assertEq(tokPool + tokDust, RESERVE, "tokens to pool+locker != 200M");
            if (ethDust > maxLockerEthDust) maxLockerEthDust = ethDust;
            if (tokDust > maxLockerTokDust) maxLockerTokDust = tokDust;
            assertLt(ethDust, 1e6);
            assertLt(tokDust, 1e6);
        } else {
            assertFalse(c1.graduated);
            assertEq(qUsed, ethIn);
            assertEq(qFee, ethIn / 100);
        }
    }

    function _checkedSell(address who, address t, uint256 amt) internal returns (bool reverted) {
        LancioLaunchpad.CurveView memory c0 = lp.getCurve(t);
        (uint256 qOut, uint256 qFee) = lp.quoteSell(t, amt);
        uint256 gross = qOut + qFee;
        vm.startPrank(who, who);
        IERC20(t).approve(address(lp), amt);
        if (gross == 0) {
            // sub-wei sells: the only allowed revert
            vm.expectRevert(LancioLaunchpad.ZeroAmount.selector);
            lp.sell(t, amt, 0, block.timestamp);
            vm.stopPrank();
            ++nDustSellReverts;
            return true;
        }
        uint256 b = who.balance;
        lp.sell(t, amt, qOut, block.timestamp);
        vm.stopPrank();
        ++nSells;

        LancioLaunchpad.CurveView memory c1 = lp.getCurve(t);
        assertEq(who.balance - b, qOut, "ETH out != quote");
        assertEq(qFee, gross / 100, "sell fee");
        assertEq(c0.realEth - c1.realEth, gross, "realEth delta != gross out");
        assertEq(c1.vTok - c0.vTok, amt);
        // seller never beats the exact curve
        assertGe((c0.vEth - gross) * (c0.vTok + amt), KK, "sell beat x*y=k");
    }

    function _checkGlobal() internal view {
        uint256 liab = lp.protocolFees();
        for (uint256 i; i < toks.length; ++i) {
            address t = toks[i];
            LancioLaunchpad.CurveView memory c = lp.getCurve(t);
            liab += c.creatorFees;
            assertEq(IERC20(t).totalSupply(), SUPPLY);
            if (!c.graduated) {
                liab += c.realEth;
                assertEq(c.vEth, _ceil(KK, c.vTok), "state off-curve");
                assertGe(c.vEth, VE0);
                assertLt(c.vEth, VEE);
                assertGt(c.vTok, VTE);
                assertLe(c.vTok, VT0);
                assertEq(IERC20(t).balanceOf(address(lp)), SUPPLY - c.sold, "launchpad token balance");
            } else {
                assertEq(c.realEth, 8 ether);
                assertEq(IERC20(t).balanceOf(address(lp)), 0);
            }
        }
        assertEq(address(lp).balance, liab, "launchpad ETH != sum(realEth live) + fees");
    }

    function _step(uint256 seed, uint256 i, uint256 nTok, bool allowGrad) internal {
        uint256 r = _rand(seed, i, 0);
        address t = toks[r % nTok];
        address who = actors[(r >> 8) % actors.length];
        uint256 op = (r >> 16) % 100;
        uint256 x = _rand(seed, i, 1);
        LancioLaunchpad.CurveView memory c = lp.getCurve(t);
        if (c.graduated) {
            vm.deal(who, who.balance + 1 ether);
            vm.prank(who, who);
            vm.expectRevert(LancioLaunchpad.CurveClosed.selector);
            lp.buy{value: 1 ether}(t, 0, block.timestamp);
            return;
        }
        if (op < 64) {
            uint256 ethIn;
            if (op < 15) ethIn = _bound(x, 1, 199); // dust, often fee-free
            else if (op < 38) ethIn = _bound(x, 1e6, 0.05 ether);
            else if (op < 56) ethIn = _bound(x, 0.05 ether, 2 ether);
            else if (op < 60) ethIn = _bound(x, 2 ether, 12 ether);
            else if (op < 61) ethIn = _bound(x, 12 ether, 1e30); // extreme
            else {
                // straddle the graduation boundary: m-2 .. m+1
                uint256 m = _minGraduating(c.vEth);
                ethIn = m + (x % 4);
                ethIn = ethIn > 2 ? ethIn - 2 : 1;
            }
            if (!allowGrad) {
                uint256 m2 = _minGraduating(c.vEth);
                if (m2 <= 1) return;
                if (ethIn >= m2) ethIn = _bound(ethIn, 1, m2 - 1);
            }
            _checkedBuy(who, t, ethIn);
        } else {
            uint256 bal = IERC20(t).balanceOf(who);
            if (bal == 0) return;
            uint256 amt;
            if (op < 74) amt = _bound(x, 1, bal < 1e9 ? bal : 1e9); // near-zero, often < 1 wei gross
            else if (op < 92) amt = _bound(x, 1, bal);
            else amt = bal;
            _checkedSell(who, t, amt);
        }
    }

    // ------------------------------------------------------------ properties (all expected to hold)

    /// 3 curves, 4 traders, 150 random steps incl. dust (1..199 wei), extreme (up to 1e30 wei) buys,
    /// boundary buys at minGraduating-2..+1, 1-unit sells and full exits.
    /// forge-config: default.fuzz.runs = 400
    function testFuzz_randomWalk_manyCurvesExtremeAmounts(uint256 seed) public {
        for (uint256 i; i < 3; ++i) toks.push(_create(creator, 0));
        vm.roll(block.number + lp.LAUNCH_WINDOW());
        for (uint256 i; i < 150; ++i) {
            _step(seed, i, 3, true);
            _checkGlobal();
        }
        emit log_named_uint("buys", nBuys);
        emit log_named_uint("sells", nSells);
        emit log_named_uint("sub-wei sells (ZeroAmount)", nDustSellReverts);
        emit log_named_uint("graduations", graduations);
    }

    /// Long-lived curves: 300 steps that never graduate (curves pushed to 1-2 wei short of full, then
    /// sold into, re-filled, etc.), then every curve is graduated with a random amount >= minimum.
    /// forge-config: default.fuzz.runs = 300
    function testFuzz_randomWalk_longLivedThenGraduate(uint256 seed) public {
        for (uint256 i; i < 3; ++i) toks.push(_create(creator, 0));
        vm.roll(block.number + lp.LAUNCH_WINDOW());
        for (uint256 i; i < 300; ++i) {
            _step(seed, i, 3, false);
            _checkGlobal();
        }
        for (uint256 i; i < 3; ++i) {
            uint256 m = _minGraduating(lp.getCurve(toks[i]).vEth);
            uint256 x = _rand(seed, 1000 + i, 2);
            uint256 ethIn = x % 3 == 0 ? m : _bound(x, m, x % 3 == 1 ? m + 1e18 : 1e30);
            assertTrue(_checkedBuy(actors[i], toks[i], ethIn));
            _checkGlobal();
        }
        assertEq(graduations, 3);
        emit log_named_uint("buys", nBuys);
        emit log_named_uint("sells", nSells);
        emit log_named_uint("sub-wei sells (ZeroAmount)", nDustSellReverts);
    }

    /// From any reachable non-graduated state, ANY amount >= the minimal graduating amount graduates
    /// (no revert, exactly 8 ETH / 200M out), and minimal-1 leaves the curve open but always finishable.
    /// forge-config: default.fuzz.runs = 400
    function testFuzz_graduationAlwaysReachable(uint256 seed, uint256 ethIn, bool edge) public {
        toks.push(_create(creator, 0));
        vm.roll(block.number + lp.LAUNCH_WINDOW());
        for (uint256 i; i < 40; ++i) {
            _step(seed, i, 1, false); // never graduates during the walk
            _checkGlobal();
        }
        address t = toks[0];
        uint256 m = _minGraduating(lp.getCurve(t).vEth);
        if (edge && m > 1) {
            // one wei short: must not graduate, must not revert
            assertFalse(_checkedBuy(carol, t, m - 1));
            _checkGlobal();
            // whatever is left is completed by a dust buy
            uint256 left = VEE - lp.getCurve(t).vEth;
            assertGt(left, 0);
            assertLt(left, 3);
            assertTrue(_checkedBuy(dave, t, _minGraduating(lp.getCurve(t).vEth)));
        } else {
            ethIn = _bound(ethIn, m, 1e30);
            assertTrue(_checkedBuy(bob, t, ethIn));
        }
        _checkGlobal();
        emit log_named_uint("locker ETH dust (wei)", maxLockerEthDust);
        emit log_named_uint("locker token dust (units)", maxLockerTokDust);
    }

    /// A lone trader cannot extract anything through rounding: after any sequence of buys/sells and a
    /// full exit their ETH never exceeds the start. In dust mode every trade is < 100 wei gross.
    /// forge-config: default.fuzz.runs = 400
    function testFuzz_loneTraderNeverProfitsFromRounding(uint256 seed, bool dustOnly) public {
        address t = _createOpen();
        toks.push(t);
        vm.deal(alice, 1000 ether);
        uint256 start = alice.balance;
        for (uint256 i; i < 120; ++i) {
            uint256 r = _rand(seed, i, 7);
            uint256 x = _rand(seed, i, 8);
            uint256 bal = IERC20(t).balanceOf(alice);
            if (r % 2 == 0 || bal == 0) {
                uint256 ethIn = dustOnly ? _bound(x, 1, 99) : _bound(x, 1, 0.05 ether);
                // pay from alice's own balance (no deal): use prank directly
                vm.prank(alice, alice);
                lp.buy{value: ethIn}(t, 0, block.timestamp);
            } else {
                uint256 amt = (r >> 8) % 3 == 0 ? bal : _bound(x, 1, bal);
                (uint256 q, uint256 f) = lp.quoteSell(t, amt);
                if (q + f == 0) continue;
                _sell(alice, t, amt);
            }
            _checkGlobal();
        }
        uint256 rest = IERC20(t).balanceOf(alice);
        if (rest > 0) {
            (uint256 q, uint256 f) = lp.quoteSell(t, rest);
            if (q + f > 0) _sell(alice, t, rest);
        }
        assertLe(alice.balance, start, "trader profited");
        _checkGlobal();
    }

    /// Everyone exits: the curve returns exactly to its start and the launchpad keeps exactly the fees.
    function test_allHoldersExit_curveResetsExactly() public {
        address t = _createOpen();
        toks.push(t);
        _checkedBuy(alice, t, 1.234567891234567891 ether);
        _checkedBuy(bob, t, 3 ether + 7);
        _checkedBuy(carol, t, 99);
        _checkedBuy(dave, t, 0.5 ether + 1);
        _checkedSell(bob, t, IERC20(t).balanceOf(bob) / 3);
        _checkedSell(alice, t, IERC20(t).balanceOf(alice));
        _checkedSell(dave, t, IERC20(t).balanceOf(dave));
        _checkedSell(bob, t, IERC20(t).balanceOf(bob));
        _checkedSell(carol, t, IERC20(t).balanceOf(carol));
        LancioLaunchpad.CurveView memory c = lp.getCurve(t);
        assertEq(c.vEth, VE0);
        assertEq(c.vTok, VT0);
        assertEq(c.realEth, 0);
        assertEq(address(lp).balance, lp.protocolFees() + c.creatorFees);
        _checkGlobal();
    }

    /// Curve one wei short of full: a 1-wei buy completes it (no stuck state, no zero-token revert).
    function test_oneWeiShort_oneWeiGraduates() public {
        address t = _createOpen();
        toks.push(t);
        uint256 m = _minGraduating(VE0);
        _checkedBuy(alice, t, m - 1);
        emit log_named_uint("ETH still needed after min-1 (wei)", VEE - lp.getCurve(t).vEth);
        emit log_named_uint("tokens left on curve (units)", lp.getCurve(t).vTok - VTE);
        assertTrue(_checkedBuy(bob, t, VEE - lp.getCurve(t).vEth));
        _checkGlobal();
    }

    // ------------------------------------------------------------ informational (not a loss)

    /// Trades whose gross is < 100 wei pay no fee (floor rounding). Quantifies the "evasion".
    function test_info_dustTradesAreFeeFree() public {
        address t = _createOpen();
        toks.push(t);
        uint256 f0 = lp.protocolFees();
        for (uint256 i; i < 200; ++i) {
            _buy(alice, t, 99);
        }
        uint256 feesDust = lp.protocolFees() - f0 + lp.getCurve(t).creatorFees;
        emit log_named_uint("fees paid by 200 x 99-wei buys (wei)", feesDust);
        emit log_named_uint("fee a single 19,800-wei buy pays (wei)", uint256(19_800) / 100);
        assertEq(feesDust, 0);
        _checkGlobal();
    }
}
