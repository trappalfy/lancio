// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title LancioToken
/// @notice Fixed-supply ERC-20. 1,000,000,000 units are minted once, to the launchpad, at creation.
///         No owner, no mint, no burn, no taxes, no transfer restrictions.
contract LancioToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000e18;

    constructor(string memory name_, string memory symbol_, address launchpad) ERC20(name_, symbol_) {
        _mint(launchpad, TOTAL_SUPPLY);
    }
}
