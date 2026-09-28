// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {StateLibrary} from "v4-core/libraries/StateLibrary.sol";

import {LancioLaunchpad} from "../src/LancioLaunchpad.sol";
import {Base} from "./Base.t.sol";

/// Full lifecycle against the real Uniswap v4 PoolManager on a Robinhood Chain mainnet fork.
/// Run: forge test --match-contract ForkTest -vv  (RPC_URL_4663 optional, defaults to the public RPC)
contract ForkTest is Base {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    address constant POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    function setUp() public {
        vm.createSelectFork(vm.envOr("RPC_URL_4663", string("https://rpc.mainnet.chain.robinhood.com")));
        assertEq(block.chainid, 4663);
        assertGt(POOL_MANAGER.code.length, 0);
        _deploy(IPoolManager(POOL_MANAGER));
    }

    function test_fork_fullCycle() public {
        // create with a developer buy inside the launch window
        vm.prank(creator, creator);
        address t = lp.create{value: 0.02 ether}("Arsenale", "ARSE", "ipfs://meta", 0);
        assertGt(IERC20(t).balanceOf(creator), 0);

        // attacker cannot open the pool early on the real PoolManager
        PoolKey memory key = locker.poolKeyOf(t);
        vm.expectRevert();
        pm.initialize(key, uint160(1 << 96));

        _advanceBlocks(2);
        (, uint256 left) = lp.launchCapRemaining(t, alice);
        assertEq(left, 0);
        _buy(alice, t, 1 ether);
        _sell(alice, t, IERC20(t).balanceOf(alice) / 3);

        // graduating buy with refund
        uint256 before = bob.balance;
        uint256 g0 = gasleft();
        _buy(bob, t, 12 ether);
        emit log_named_uint("fork graduating buy gas", g0 - gasleft());
        LancioLaunchpad.CurveView memory c = lp.getCurve(t);
        assertTrue(c.graduated);
        assertEq(c.realEth, 8 ether);
        assertLt(before - bob.balance, 12 ether);
        assertEq(address(lp).balance, lp.protocolFees() + c.creatorFees);

        (uint160 sqrtP,,,) = pm.getSlot0(key.toId());
        assertEq(sqrtP, uint160(5000 << 96));

        // trade in the real pool both ways, then collect and claim
        _swapEthForToken(t, 1 ether);
        _swapTokenForEth(t, IERC20(t).balanceOf(bob) / 4);
        (uint256 pe, uint256 pt) = locker.pendingFees(t);
        assertGt(pe, 0);
        assertGt(pt, 0);
        (uint256 e, uint256 tk) = locker.collectFees(t);
        assertApproxEqAbs(e, pe, 1);
        assertApproxEqAbs(tk, pt, 1);

        address[] memory list = new address[](1);
        list[0] = t;
        uint256 owed = lp.getCurve(t).creatorFees;
        uint256 cb = creator.balance;
        vm.prank(creator);
        lp.claimCreatorFees(list);
        assertEq(creator.balance - cb, owed);
        uint256 tb = treasury.balance;
        uint256 pf = lp.protocolFees();
        lp.claimProtocolFees();
        assertEq(treasury.balance - tb, pf);
    }
}
