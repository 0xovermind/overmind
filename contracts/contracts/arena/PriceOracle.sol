// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PriceOracle
/// @notice USD prices (8 decimals) for tokenized stocks, pushed by a feeder.
///         On mainnet this would be replaced by Chainlink feeds; the interface stays the same.
contract PriceOracle is Ownable {
    struct Price {
        uint192 usd; // 1e8 = $1
        uint64 updatedAt;
    }

    address public feeder;
    mapping(address => Price) private _prices;

    event PriceUpdated(address indexed token, uint256 usd, uint256 at);
    event FeederChanged(address feeder);

    error NotFeeder();
    error BadInput();
    error NoPrice();

    constructor(address owner_, address feeder_) Ownable(owner_) {
        feeder = feeder_;
    }

    function setFeeder(address feeder_) external onlyOwner {
        feeder = feeder_;
        emit FeederChanged(feeder_);
    }

    function setPrices(address[] calldata tokens, uint256[] calldata usd) external {
        if (msg.sender != feeder && msg.sender != owner()) revert NotFeeder();
        if (tokens.length != usd.length) revert BadInput();
        for (uint256 i; i < tokens.length; ++i) {
            if (usd[i] == 0 || usd[i] > type(uint192).max) revert BadInput();
            _prices[tokens[i]] = Price(uint192(usd[i]), uint64(block.timestamp));
            emit PriceUpdated(tokens[i], usd[i], block.timestamp);
        }
    }

    function getPrice(address token) external view returns (uint256 usd, uint256 updatedAt) {
        Price memory p = _prices[token];
        if (p.usd == 0) revert NoPrice();
        return (p.usd, p.updatedAt);
    }
}
