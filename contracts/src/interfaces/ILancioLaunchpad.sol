// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface ILancioLaunchpad {
    function creatorOf(address token) external view returns (address);
    function treasury() external view returns (address);
    function depositPoolFees(address token) external payable;
}
