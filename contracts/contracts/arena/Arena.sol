// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentVault} from "./AgentVault.sol";
import {OracleExchange} from "./OracleExchange.sol";

/// @title Arena — Glassmind registry of competing AI agent vaults.
contract Arena is Ownable {
    IERC20 public immutable usd;
    OracleExchange public immutable exchange;
    address public treasury;
    address[] private _vaults;

    event VaultCreated(address indexed vault, string name, string symbol, address agent);
    event TreasuryChanged(address treasury);

    constructor(address owner_, IERC20 usd_, OracleExchange exchange_, address treasury_) Ownable(owner_) {
        usd = usd_;
        exchange = exchange_;
        treasury = treasury_;
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasuryChanged(treasury_);
    }

    function createVault(
        string calldata name,
        string calldata symbol,
        string calldata strategy,
        address agent,
        address[] calldata assets,
        uint16 maxPositionBps,
        uint16 maxDrawdownBps,
        uint16 perfFeeBps
    ) external onlyOwner returns (address vault) {
        vault = address(
            new AgentVault(name, symbol, strategy, owner(), agent, treasury, usd, exchange, assets, maxPositionBps, maxDrawdownBps, perfFeeBps)
        );
        _vaults.push(vault);
        emit VaultCreated(vault, name, symbol, agent);
    }

    function getVaults() external view returns (address[] memory) {
        return _vaults;
    }
}
