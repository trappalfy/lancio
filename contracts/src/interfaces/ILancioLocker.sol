// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface ILancioLocker {
    function lock(address token) external payable returns (bytes32 poolId, uint128 liquidity);
}
