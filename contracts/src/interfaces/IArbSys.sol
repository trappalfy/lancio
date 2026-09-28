// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Arbitrum precompile at address(100). On Arbitrum chains `block.number` is the parent-chain block;
///         arbBlockNumber() is the chain's own block number.
interface IArbSys {
    function arbBlockNumber() external view returns (uint256);
}
