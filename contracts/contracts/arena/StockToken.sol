// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice TESTNET stand-in for a tokenized stock (e.g. TSLA). Only the exchange can mint/burn.
contract StockToken is ERC20 {
    address public immutable exchange;

    error NotExchange();

    constructor(string memory name_, string memory symbol_, address exchange_) ERC20(name_, symbol_) {
        exchange = exchange_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != exchange) revert NotExchange();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != exchange) revert NotExchange();
        _burn(from, amount);
    }
}
