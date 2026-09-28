// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";

import {LancioLaunchpad} from "../src/LancioLaunchpad.sol";
import {LancioLocker} from "../src/LancioLocker.sol";
import {LancioHook} from "../src/LancioHook.sol";
import {ILancioLaunchpad} from "../src/interfaces/ILancioLaunchpad.sol";

/// @dev Stand-in for the ArbSys precompile, which Foundry/anvil do not emulate.
contract MockArbSys {
    uint256 internal pinned; // slot 0: when non-zero, overrides block.number (forks where vm.roll is ignored)

    function arbBlockNumber() external view returns (uint256) {
        return pinned == 0 ? block.number : pinned;
    }
}

contract RevertingReceiver {
    receive() external payable {
        revert("no");
    }
}

abstract contract Base is Test {
    uint160 internal constant HOOK_FLAGS = uint160(1 << 13); // BEFORE_INITIALIZE

    IPoolManager internal pm;
    LancioLaunchpad internal lp;
    LancioLocker internal locker;
    LancioHook internal hook;
    PoolSwapTest internal swapRouter;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function _deploy(IPoolManager pm_) internal {
        pm = pm_;
        vm.etch(address(100), address(new MockArbSys()).code);

        address hookAddr = address(uint160(uint256(keccak256("lancio.hook")) & ~uint256(0x3FFF)) | HOOK_FLAGS);
        address lpAddr = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        locker = new LancioLocker(pm, ILancioLaunchpad(lpAddr), IHooks(hookAddr));
        lp = new LancioLaunchpad(owner, treasury, address(locker));
        assertEq(address(lp), lpAddr);
        deployCodeTo("LancioHook.sol:LancioHook", abi.encode(address(pm), address(locker)), hookAddr);
        hook = LancioHook(hookAddr);

        swapRouter = new PoolSwapTest(pm);
        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    // ------------------------------------------------------------ helpers

    /// @dev Advance the chain block seen by the launchpad (ArbSys) by `n`.
    function _advanceBlocks(uint256 n) internal {
        uint256 next = lp.currentBlock() + n;
        vm.store(address(100), bytes32(0), bytes32(next));
        vm.mockCall(address(100), abi.encodeWithSignature("arbBlockNumber()"), abi.encode(next));
        vm.roll(next);
    }

    function _create(address who, uint256 devBuy) internal returns (address token) {
        vm.prank(who, who);
        token = lp.create{value: devBuy}("Galley", "GALLEY", "ipfs://meta", 0);
    }

    /// @dev Creates a token and moves past the launch window.
    function _createOpen() internal returns (address token) {
        token = _create(creator, 0);
        vm.roll(block.number + lp.LAUNCH_WINDOW());
    }

    function _buy(address who, address token, uint256 ethIn) internal returns (uint256) {
        vm.prank(who, who);
        return lp.buy{value: ethIn}(token, 0, block.timestamp + 60);
    }

    function _sell(address who, address token, uint256 amount) internal returns (uint256) {
        vm.startPrank(who, who);
        IERC20(token).approve(address(lp), amount);
        uint256 out = lp.sell(token, amount, 0, block.timestamp + 60);
        vm.stopPrank();
        return out;
    }

    function _liabilities(address[] memory tokens) internal view returns (uint256 sum) {
        sum = lp.protocolFees();
        for (uint256 i; i < tokens.length; ++i) {
            LancioLaunchpad.CurveView memory c = lp.getCurve(tokens[i]);
            sum += c.creatorFees;
            if (!c.graduated) sum += c.realEth;
        }
    }

    function _swapEthForToken(address token, uint256 ethIn) internal {
        PoolKey memory key = locker.poolKeyOf(token);
        vm.prank(bob, bob);
        swapRouter.swap{value: ethIn}(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -int256(ethIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _swapTokenForEth(address token, uint256 amountIn) internal {
        PoolKey memory key = locker.poolKeyOf(token);
        vm.startPrank(bob, bob);
        IERC20(token).approve(address(swapRouter), amountIn);
        swapRouter.swap(
            key,
            SwapParams({zeroForOne: false, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1}),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        vm.stopPrank();
    }
}
