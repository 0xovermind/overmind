// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title GlassStaking — stake $GLASS, earn NVDA.
/// @notice Anyone can push reward tokens in with `notifyReward`; they are split instantly across
///         current stakers pro rata. The Glassmind treasury routes the AI agents' performance fees
///         here after converting them to the reward token. No owner, no admin withdraw, no lockup.
contract GlassStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant ACC = 1e36;

    IERC20 public immutable stakeToken; // $GLASS
    IERC20 public immutable rewardToken; // NVDA stock token

    uint256 public totalStaked;
    uint256 public accRewardPerToken; // scaled by ACC
    uint256 public totalDistributed;
    uint256 public rewardRounds;

    mapping(address => uint256) public staked;
    mapping(address => uint256) private _debt;
    mapping(address => uint256) private _owed;

    event Staked(address indexed user, uint256 amount, uint256 time);
    event Unstaked(address indexed user, uint256 amount, uint256 time);
    event Claimed(address indexed user, uint256 amount, uint256 time);
    event RewardAdded(address indexed from, uint256 amount, uint256 totalStaked, uint256 time);

    error ZeroAmount();
    error NoStakers();
    error Insufficient();

    constructor(IERC20 stakeToken_, IERC20 rewardToken_) {
        stakeToken = stakeToken_;
        rewardToken = rewardToken_;
    }

    function earned(address user) public view returns (uint256) {
        return _owed[user] + (staked[user] * accRewardPerToken) / ACC - _debt[user];
    }

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _settle(msg.sender);
        stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        staked[msg.sender] += amount;
        totalStaked += amount;
        _sync(msg.sender);
        emit Staked(msg.sender, amount, block.timestamp);
    }

    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (staked[msg.sender] < amount) revert Insufficient();
        _settle(msg.sender);
        staked[msg.sender] -= amount;
        totalStaked -= amount;
        _sync(msg.sender);
        stakeToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount, block.timestamp);
    }

    function claim() external nonReentrant returns (uint256 amount) {
        _settle(msg.sender);
        _sync(msg.sender);
        amount = _owed[msg.sender];
        if (amount == 0) revert ZeroAmount();
        _owed[msg.sender] = 0;
        rewardToken.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount, block.timestamp);
    }

    /// @notice Split `amount` reward tokens across everyone staked right now.
    function notifyReward(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (totalStaked == 0) revert NoStakers();
        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        accRewardPerToken += (amount * ACC) / totalStaked;
        totalDistributed += amount;
        rewardRounds += 1;
        emit RewardAdded(msg.sender, amount, totalStaked, block.timestamp);
    }

    function _settle(address user) internal {
        uint256 s = staked[user];
        if (s > 0) _owed[user] += (s * accRewardPerToken) / ACC - _debt[user];
    }

    function _sync(address user) internal {
        _debt[user] = (staked[user] * accRewardPerToken) / ACC;
    }
}
