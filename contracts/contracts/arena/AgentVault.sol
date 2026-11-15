// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {OracleExchange} from "./OracleExchange.sol";

/// @title AgentVault — Overmind
/// @notice A pooled account traded by an AI agent under rules the agent cannot break:
///   * the agent can only swap whitelisted stock tokens through the exchange — it has no way to move funds out;
///   * no single position may exceed `maxPositionBps` of the vault's value;
///   * if value per share falls `maxDrawdownBps` below its peak, trading halts until the owner reviews it;
///   * every trade carries the agent's reasoning, emitted on-chain.
/// Depositors receive shares and can withdraw their pro-rata slice at any time, even while halted.
/// A performance fee on new highs is paid in shares to the treasury (which funds $GLASS buybacks).
contract AgentVault is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant ONE = 1e18;
    uint256 private constant BPS = 10_000;

    IERC20 public immutable usd; // 6 decimals
    OracleExchange public immutable exchange;
    address public agent;
    address public treasury;
    string public strategy;

    uint16 public immutable maxPositionBps;
    uint16 public immutable maxDrawdownBps;
    uint16 public immutable perfFeeBps;

    address[] public assets;
    mapping(address => bool) public isAsset;

    uint256 public peakNavPerShare = ONE; // 1e18 = $1.00 per share
    uint256 public highWaterMark = ONE;
    bool public halted;
    uint256 public tradeCount;

    event Deposit(address indexed user, uint256 usdIn, uint256 shares);
    event Withdraw(address indexed user, uint256 shares, uint256 usdOut);
    event AgentTrade(uint256 indexed id, address indexed asset, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 navAfter, string thought, uint256 time);
    event Thought(string text, uint256 time);
    event Halted(uint256 navPerShare, uint256 peak, uint256 time);
    event Resumed();
    event FeeTaken(uint256 shares, uint256 navPerShare);
    event AgentChanged(address agent);
    /// @notice Equity-curve point, emitted on every checkpoint.
    event Snapshot(uint256 navPerShare, uint256 nav, uint256 supply, uint256 time);

    error NotAgent();
    error NotAsset();
    error IsHalted();
    error ZeroAmount();
    error PositionLimit();
    error BadParams();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory strategy_,
        address owner_,
        address agent_,
        address treasury_,
        IERC20 usd_,
        OracleExchange exchange_,
        address[] memory assets_,
        uint16 maxPositionBps_,
        uint16 maxDrawdownBps_,
        uint16 perfFeeBps_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        if (maxPositionBps_ == 0 || maxPositionBps_ > BPS || maxDrawdownBps_ == 0 || maxDrawdownBps_ >= BPS || perfFeeBps_ > 3000) {
            revert BadParams();
        }
        strategy = strategy_;
        agent = agent_;
        treasury = treasury_;
        usd = usd_;
        exchange = exchange_;
        maxPositionBps = maxPositionBps_;
        maxDrawdownBps = maxDrawdownBps_;
        perfFeeBps = perfFeeBps_;
        for (uint256 i; i < assets_.length; ++i) {
            if (!exchange_.listed(assets_[i])) revert NotAsset();
            if (!isAsset[assets_[i]]) {
                isAsset[assets_[i]] = true;
                assets.push(assets_[i]);
            }
        }
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    // ------------------------------------------------------------------ views

    function getAssets() external view returns (address[] memory) {
        return assets;
    }

    /// @notice Vault value in USD (6 decimals): cash plus holdings at oracle prices.
    function nav() public view returns (uint256 total) {
        total = usd.balanceOf(address(this));
        for (uint256 i; i < assets.length; ++i) {
            uint256 bal = IERC20(assets[i]).balanceOf(address(this));
            if (bal > 0) total += exchange.valueOf(assets[i], bal);
        }
    }

    /// @notice Value per share, 1e18 = $1.00.
    function navPerShare() public view returns (uint256) {
        uint256 supply = totalSupply();
        return supply == 0 ? ONE : Math.mulDiv(nav(), 1e12 * ONE, supply);
    }

    function positionValue(address asset) public view returns (uint256) {
        uint256 bal = IERC20(asset).balanceOf(address(this));
        return bal == 0 ? 0 : exchange.valueOf(asset, bal);
    }

    // -------------------------------------------------------------- depositors

    function deposit(uint256 usdIn) external nonReentrant returns (uint256 shares) {
        if (usdIn == 0) revert ZeroAmount();
        uint256 supply = totalSupply();
        uint256 navBefore = nav();
        shares = supply == 0 || navBefore == 0 ? usdIn * 1e12 : Math.mulDiv(usdIn, supply, navBefore);
        if (shares == 0) revert ZeroAmount();
        usd.safeTransferFrom(msg.sender, address(this), usdIn);
        _mint(msg.sender, shares);
        emit Deposit(msg.sender, usdIn, shares);
        emit Snapshot(navPerShare(), nav(), totalSupply(), block.timestamp);
    }

    /// @notice Burn shares for a pro-rata slice of cash plus holdings sold at the oracle price.
    ///         Always available, including while the vault is halted.
    function withdraw(uint256 shares) external nonReentrant returns (uint256 usdOut) {
        uint256 supply = totalSupply();
        if (shares == 0 || shares > balanceOf(msg.sender)) revert ZeroAmount();
        usdOut = Math.mulDiv(usd.balanceOf(address(this)), shares, supply);
        for (uint256 i; i < assets.length; ++i) {
            uint256 part = Math.mulDiv(IERC20(assets[i]).balanceOf(address(this)), shares, supply);
            if (part == 0) continue;
            IERC20(assets[i]).forceApprove(address(exchange), part);
            usdOut += exchange.sell(assets[i], part, 0);
        }
        _burn(msg.sender, shares);
        usd.safeTransfer(msg.sender, usdOut);
        emit Withdraw(msg.sender, shares, usdOut);
    }

    // ------------------------------------------------------------------- agent

    /// @param amount USD (6 dec) to spend when buying, stock tokens (18 dec) to sell when selling.
    /// @param thought the agent's reasoning, published on-chain with the trade.
    function trade(address asset, bool isBuy, uint256 amount, uint256 minOut, string calldata thought)
        external
        onlyAgent
        nonReentrant
        returns (uint256 out)
    {
        if (halted) revert IsHalted();
        if (!isAsset[asset]) revert NotAsset();
        if (amount == 0) revert ZeroAmount();

        if (isBuy) {
            usd.forceApprove(address(exchange), amount);
            out = exchange.buy(asset, amount, minOut);
            if (positionValue(asset) * BPS > nav() * maxPositionBps) revert PositionLimit();
        } else {
            IERC20(asset).forceApprove(address(exchange), amount);
            out = exchange.sell(asset, amount, minOut);
        }

        uint256 navAfter = nav();
        emit AgentTrade(++tradeCount, asset, isBuy, amount, out, navAfter, thought, block.timestamp);
        _checkpoint();
    }

    /// @notice Publish reasoning without trading (e.g. "holding, nothing compelling").
    function think(string calldata text) external onlyAgent {
        emit Thought(text, block.timestamp);
    }

    /// @notice Anyone can record a new peak / trigger the drawdown halt / take the fee.
    function checkpoint() external {
        _checkpoint();
    }

    // ------------------------------------------------------------------- owner

    function resume() external onlyOwner {
        halted = false;
        peakNavPerShare = navPerShare(); // reset the drawdown reference after review
        emit Resumed();
    }

    function setAgent(address agent_) external onlyOwner {
        agent = agent_;
        emit AgentChanged(agent_);
    }

    // ---------------------------------------------------------------- internal

    function _checkpoint() internal {
        uint256 supply = totalSupply();
        if (supply == 0) return;
        uint256 nps = navPerShare();

        // Performance fee on gains above the high-water mark, paid as newly minted shares.
        if (nps > highWaterMark && perfFeeBps > 0 && treasury != address(0)) {
            uint256 navUsd = nav();
            uint256 profit = Math.mulDiv(nps - highWaterMark, supply, 1e12 * ONE); // USD 6 dec
            uint256 fee = (profit * perfFeeBps) / BPS;
            if (fee > 0 && fee < navUsd) {
                uint256 feeShares = Math.mulDiv(fee, supply, navUsd - fee);
                _mint(treasury, feeShares);
                nps = navPerShare();
                emit FeeTaken(feeShares, nps);
            }
            highWaterMark = nps;
        }

        if (nps > peakNavPerShare) peakNavPerShare = nps;
        if (!halted && nps * BPS < peakNavPerShare * (BPS - maxDrawdownBps)) {
            halted = true;
            emit Halted(nps, peakNavPerShare, block.timestamp);
        }
        emit Snapshot(nps, nav(), totalSupply(), block.timestamp);
    }
}
