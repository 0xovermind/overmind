// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice LOCAL DEMO stand-in for $OVER. The real token is launched on Pons; this only exists so the
///         staking flow can be shown before that. Fixed 1B supply minted to the deployer.
contract MockGlass is ERC20 {
    constructor(address to) ERC20("Overmind", "OVER") {
        _mint(to, 1_000_000_000e18);
    }
}
