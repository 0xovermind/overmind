// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet-only stablecoin with an open faucet. Stands in for USDG. Has no value.
contract MockUSD is ERC20 {
    uint256 public constant FAUCET_LIMIT = 10_000e6;

    error OverLimit();

    constructor() ERC20("Test USD", "tUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        if (amount > FAUCET_LIMIT) revert OverLimit();
        _mint(to, amount);
    }
}
