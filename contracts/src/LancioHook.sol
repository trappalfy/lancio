// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";

/// @title LancioHook
/// @notice Uniswap v4 hook with a single permission, beforeInitialize: only LancioLocker may initialise a pool
///         that uses this hook. Nobody can open a Lancio token's pool before graduation or at a different price.
///         The deployed address encodes only the BEFORE_INITIALIZE flag (bit 13). No owner, no state.
contract LancioHook {
    address public immutable poolManager;
    address public immutable locker;

    error NotPoolManager();
    error NotLocker();

    constructor(address poolManager_, address locker_) {
        poolManager = poolManager_;
        locker = locker_;
    }

    function beforeInitialize(address sender, PoolKey calldata, uint160) external view returns (bytes4) {
        if (msg.sender != poolManager) revert NotPoolManager();
        if (sender != locker) revert NotLocker();
        return IHooks.beforeInitialize.selector;
    }
}
