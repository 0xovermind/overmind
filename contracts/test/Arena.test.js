const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

const U = (n) => ethers.parseUnits(String(n), 6);
const P = (n) => ethers.parseUnits(String(n), 8); // oracle price
const T = (n) => ethers.parseUnits(String(n), 18); // stock tokens

async function arenaFixture() {
  const [owner, agent, treasury, alice, bob, stranger] = await ethers.getSigners();
  const usd = await ethers.deployContract("MockUSD");
  const oracle = await ethers.deployContract("PriceOracle", [owner.address, owner.address]);
  const exchange = await ethers.deployContract("OracleExchange", [owner.address, usd.target, oracle.target]);
  const tsla = await ethers.deployContract("StockToken", ["Tesla (test)", "TSLA", exchange.target]);
  const nvda = await ethers.deployContract("StockToken", ["NVIDIA (test)", "NVDA", exchange.target]);
  const other = await ethers.deployContract("StockToken", ["Not listed", "XXX", exchange.target]);
  await exchange.list(tsla.target);
  await exchange.list(nvda.target);
  await oracle.setPrices([tsla.target, nvda.target], [P(250), P(150)]);
  // Exchange reserve so sells can pay out after price gains.
  await usd.mint(exchange.target, U(10000));

  const arena = await ethers.deployContract("Arena", [owner.address, usd.target, exchange.target, treasury.address]);
  await arena.createVault("Glassmind Value", "gVALUE", "Patient value investor", agent.address, [tsla.target, nvda.target], 4000, 2500, 1000);
  const [vaultAddr] = await arena.getVaults();
  const vault = await ethers.getContractAt("AgentVault", vaultAddr);

  for (const s of [alice, bob]) {
    await usd.mint(s.address, U(10000));
    await usd.connect(s).approve(vault.target, ethers.MaxUint256);
  }
  return { owner, agent, treasury, alice, bob, stranger, usd, oracle, exchange, tsla, nvda, other, arena, vault };
}

async function funded() {
  const f = await arenaFixture();
  await f.vault.connect(f.alice).deposit(U(1000));
  return f;
}

describe("Glassmind arena", function () {
  describe("deposits and withdrawals", function () {
    it("first deposit mints shares at $1.00", async function () {
      const { vault, alice } = await loadFixture(funded);
      expect(await vault.balanceOf(alice.address)).to.equal(T(1000));
      expect(await vault.navPerShare()).to.equal(T(1));
      expect(await vault.nav()).to.equal(U(1000));
    });

    it("later depositors get shares at the current value", async function () {
      const f = await loadFixture(funded);
      await f.vault.connect(f.agent).trade(f.tsla.target, true, U(400), 0, "buy");
      await f.oracle.setPrices([f.tsla.target], [P(300)]); // +20% on TSLA
      const nps = await f.vault.navPerShare();
      await f.vault.connect(f.bob).deposit(U(500));
      const bobShares = await f.vault.balanceOf(f.bob.address);
      expect(bobShares).to.be.closeTo((U(500) * 10n ** 12n * 10n ** 18n) / nps, 10n ** 12n);
    });

    it("withdraw returns a pro-rata slice, selling holdings", async function () {
      const f = await loadFixture(funded);
      await f.vault.connect(f.agent).trade(f.tsla.target, true, U(400), 0, "buy");
      const before = await f.usd.balanceOf(f.alice.address);
      await f.vault.connect(f.alice).withdraw(await f.vault.balanceOf(f.alice.address));
      const got = (await f.usd.balanceOf(f.alice.address)) - before;
      expect(got).to.be.closeTo(U(999.2), U(0.1)); // two 0.1% exchange fees on the $400 leg
      expect(await f.vault.totalSupply()).to.equal(0n);
    });
  });

  describe("guardrails the agent cannot break", function () {
    it("only the agent can trade", async function () {
      const f = await loadFixture(funded);
      await expect(f.vault.connect(f.stranger).trade(f.tsla.target, true, U(10), 0, "x")).to.be.revertedWithCustomError(f.vault, "NotAgent");
      await expect(f.vault.connect(f.owner).trade(f.tsla.target, true, U(10), 0, "x")).to.be.revertedWithCustomError(f.vault, "NotAgent");
    });

    it("the agent cannot trade assets outside the whitelist", async function () {
      const f = await loadFixture(funded);
      await expect(f.vault.connect(f.agent).trade(f.other.target, true, U(10), 0, "x")).to.be.revertedWithCustomError(f.vault, "NotAsset");
    });

    it("the agent has no function to move funds out", async function () {
      const f = await loadFixture(funded);
      const fns = f.vault.interface.fragments.filter((x) => x.type === "function" && x.stateMutability !== "view" && x.stateMutability !== "pure").map((x) => x.name);
      // Agent-callable state-changing functions are only `trade` and `think`; transfers move the caller's own shares.
      expect(fns).to.not.include("sweep");
      expect(fns).to.not.include("rescue");
      await expect(f.vault.connect(f.agent).withdraw(1)).to.be.revertedWithCustomError(f.vault, "ZeroAmount"); // holds no shares
    });

    it("no single position may exceed 40% of the vault", async function () {
      const f = await loadFixture(funded);
      await expect(f.vault.connect(f.agent).trade(f.tsla.target, true, U(450), 0, "all in"))
        .to.be.revertedWithCustomError(f.vault, "PositionLimit");
      await f.vault.connect(f.agent).trade(f.tsla.target, true, U(390), 0, "within limit");
    });

    it("a 25% drawdown halts trading; withdrawals still work; owner can resume", async function () {
      const f = await loadFixture(funded);
      await f.vault.connect(f.agent).trade(f.tsla.target, true, U(399), 0, "buy tsla");
      await f.vault.connect(f.agent).trade(f.nvda.target, true, U(399), 0, "buy nvda");
      await f.oracle.setPrices([f.tsla.target, f.nvda.target], [P(150), P(80)]); // ~-40% / -47%
      await expect(f.vault.checkpoint()).to.emit(f.vault, "Halted");
      expect(await f.vault.halted()).to.equal(true);
      await expect(f.vault.connect(f.agent).trade(f.tsla.target, false, T(0.1), 0, "x")).to.be.revertedWithCustomError(f.vault, "IsHalted");
      await f.vault.connect(f.alice).withdraw(T(100)); // exits stay open
      await expect(f.vault.connect(f.stranger).resume()).to.be.revertedWithCustomError(f.vault, "OwnableUnauthorizedAccount");
      await f.vault.connect(f.owner).resume();
      expect(await f.vault.halted()).to.equal(false);
    });

    it("trades revert on stale prices", async function () {
      const f = await loadFixture(funded);
      await time.increase(2 * 3600);
      await expect(f.vault.connect(f.agent).trade(f.tsla.target, true, U(10), 0, "x")).to.be.revertedWithCustomError(f.exchange, "StalePrice");
    });
  });

  describe("transparency and fees", function () {
    it("every trade emits the agent's reasoning", async function () {
      const f = await loadFixture(funded);
      const why = "TSLA up 4% on delivery beat, momentum intact. Sizing 20%.";
      await expect(f.vault.connect(f.agent).trade(f.tsla.target, true, U(200), 0, why))
        .to.emit(f.vault, "AgentTrade").withArgs(1, f.tsla.target, true, U(200), (v) => v > 0n, (v) => v > 0n, why, (v) => v > 0n);
      await expect(f.vault.connect(f.agent).think("Holding. Nothing compelling.")).to.emit(f.vault, "Thought");
    });

    it("10% performance fee on new highs goes to the treasury", async function () {
      const f = await loadFixture(funded);
      await f.vault.connect(f.agent).trade(f.tsla.target, true, U(400), 0, "buy");
      await f.oracle.setPrices([f.tsla.target], [P(375)]); // TSLA +50% => vault ~ +20%
      await f.vault.checkpoint();
      const feeShares = await f.vault.balanceOf(f.treasury.address);
      expect(feeShares).to.be.gt(0n);
      const nav = Number(await f.vault.nav()) / 1e6;
      const treasuryValue = (Number(feeShares) / Number(await f.vault.totalSupply())) * nav;
      expect(treasuryValue).to.be.closeTo(0.1 * (nav - 1000), 1); // ~10% of the ~$199 gain
      // No fee again until a new high.
      await f.vault.checkpoint();
      expect(await f.vault.balanceOf(f.treasury.address)).to.equal(feeShares);
    });
  });
});
