const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const G = (n) => ethers.parseUnits(String(n), 18);

async function fixture() {
  const [deployer, alice, bob, treasury, carol] = await ethers.getSigners();
  const glass = await ethers.deployContract("MockGlass", [deployer.address]);
  const nvda = await ethers.deployContract("MockGlass", [treasury.address]); // any ERC20 works as the reward token in tests
  const staking = await ethers.deployContract("GlassStaking", [glass.target, nvda.target]);
  for (const u of [alice, bob, carol]) {
    await glass.transfer(u.address, G(1_000_000));
    await glass.connect(u).approve(staking.target, ethers.MaxUint256);
  }
  await nvda.connect(treasury).approve(staking.target, ethers.MaxUint256);
  return { deployer, alice, bob, carol, treasury, glass, nvda, staking };
}

describe("GlassStaking — stake $GLASS, earn NVDA", function () {
  it("splits each reward pro rata to current stakers", async function () {
    const { alice, bob, treasury, staking } = await loadFixture(fixture);
    await staking.connect(alice).stake(G(300));
    await staking.connect(bob).stake(G(100));
    await staking.connect(treasury).notifyReward(G(40));
    expect(await staking.earned(alice.address)).to.equal(G(30));
    expect(await staking.earned(bob.address)).to.equal(G(10));
  });

  it("late stakers don't get earlier rewards", async function () {
    const { alice, carol, treasury, staking } = await loadFixture(fixture);
    await staking.connect(alice).stake(G(100));
    await staking.connect(treasury).notifyReward(G(10));
    await staking.connect(carol).stake(G(100));
    expect(await staking.earned(carol.address)).to.equal(0n);
    await staking.connect(treasury).notifyReward(G(10));
    expect(await staking.earned(alice.address)).to.equal(G(15));
    expect(await staking.earned(carol.address)).to.equal(G(5));
  });

  it("claim pays the reward token; unstake returns $GLASS and keeps earned rewards", async function () {
    const { alice, treasury, staking, glass, nvda } = await loadFixture(fixture);
    await staking.connect(alice).stake(G(500));
    await staking.connect(treasury).notifyReward(G(7));
    await staking.connect(alice).unstake(G(500));
    expect(await glass.balanceOf(alice.address)).to.equal(G(1_000_000));
    await staking.connect(alice).claim();
    expect(await nvda.balanceOf(alice.address)).to.equal(G(7));
    await expect(staking.connect(alice).claim()).to.be.revertedWithCustomError(staking, "ZeroAmount");
  });

  it("rejects rewards when nobody is staked, and over-unstaking", async function () {
    const { alice, treasury, staking } = await loadFixture(fixture);
    await expect(staking.connect(treasury).notifyReward(G(1))).to.be.revertedWithCustomError(staking, "NoStakers");
    await staking.connect(alice).stake(G(1));
    await expect(staking.connect(alice).unstake(G(2))).to.be.revertedWithCustomError(staking, "Insufficient");
  });

  it("tracks totals for the site", async function () {
    const { alice, treasury, staking } = await loadFixture(fixture);
    await staking.connect(alice).stake(G(10));
    await staking.connect(treasury).notifyReward(G(2));
    await staking.connect(treasury).notifyReward(G(3));
    expect(await staking.totalDistributed()).to.equal(G(5));
    expect(await staking.rewardRounds()).to.equal(2n);
  });
});
