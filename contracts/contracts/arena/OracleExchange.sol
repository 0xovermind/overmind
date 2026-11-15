// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PriceOracle} from "./PriceOracle.sol";
import {StockToken} from "./StockToken.sol";

/// @title OracleExchange
/// @notice TESTNET venue: swaps USD collateral <-> stock tokens at the oracle price minus a fee.
///         Buying mints stock tokens, selling burns them, so there is no pool to drain.
///         On mainnet the vault would route through Uniswap / Robinhood stock tokens instead.
contract OracleExchange is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usd; // 6 decimals
    PriceOracle public immutable oracle;
    uint16 public feeBps = 10; // 0.10%
    uint64 public maxPriceAge = 1 hours;
    mapping(address => bool) public listed;
    address[] public stocks;

    event Listed(address indexed token, string symbol);
    event Swap(address indexed user, address indexed token, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 price);

    error NotListed();
    error StalePrice();
    error Slippage();
    error ZeroAmount();

    constructor(address owner_, IERC20 usd_, PriceOracle oracle_) Ownable(owner_) {
        usd = usd_;
        oracle = oracle_;
    }

    function list(address token) external onlyOwner {
        if (!listed[token]) {
            listed[token] = true;
            stocks.push(token);
            emit Listed(token, StockToken(token).symbol());
        }
    }

    function setParams(uint16 feeBps_, uint64 maxPriceAge_) external onlyOwner {
        feeBps = feeBps_;
        maxPriceAge = maxPriceAge_;
    }

    function getStocks() external view returns (address[] memory) {
        return stocks;
    }

    /// @return usd8 price with 8 decimals, checked for freshness.
    function price(address token) public view returns (uint256 usd8) {
        if (!listed[token]) revert NotListed();
        (uint256 p, uint256 at) = oracle.getPrice(token);
        if (block.timestamp > at + maxPriceAge) revert StalePrice();
        return p;
    }

    /// @notice USD value (6 decimals) of `amount` stock tokens (18 decimals) at the oracle price.
    function valueOf(address token, uint256 amount) public view returns (uint256) {
        return (amount * price(token)) / 1e20; // 1e18 token * 1e8 price -> 1e6 usd
    }

    function quoteBuy(address token, uint256 usdIn) public view returns (uint256 tokensOut) {
        uint256 net = usdIn - (usdIn * feeBps) / 10_000;
        tokensOut = (net * 1e20) / price(token);
    }

    function quoteSell(address token, uint256 tokensIn) public view returns (uint256 usdOut) {
        uint256 gross = valueOf(token, tokensIn);
        usdOut = gross - (gross * feeBps) / 10_000;
    }

    function buy(address token, uint256 usdIn, uint256 minOut) external nonReentrant returns (uint256 out) {
        if (usdIn == 0) revert ZeroAmount();
        out = quoteBuy(token, usdIn);
        if (out < minOut) revert Slippage();
        usd.safeTransferFrom(msg.sender, address(this), usdIn);
        StockToken(token).mint(msg.sender, out);
        emit Swap(msg.sender, token, true, usdIn, out, price(token));
    }

    function sell(address token, uint256 tokensIn, uint256 minOut) external nonReentrant returns (uint256 out) {
        if (tokensIn == 0) revert ZeroAmount();
        out = quoteSell(token, tokensIn);
        if (out < minOut) revert Slippage();
        StockToken(token).burn(msg.sender, tokensIn);
        usd.safeTransfer(msg.sender, out);
        emit Swap(msg.sender, token, false, tokensIn, out, price(token));
    }
}
