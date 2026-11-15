// LOCAL DEMO ONLY: deploys the Glassmind arena on the Hardhat node and simulates
// 4 days of 24/7 stock-token prices with 4 AI agent vaults trading and depositors joining.
//   npx hardhat run scripts/seed-arena.js --network localhost
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { PERSONAS, decide } = require("./personas");

const U = (n) => hre.ethers.parseUnits(Number(n).toFixed(6), 6);
const P8 = (n) => BigInt(Math.round(n * 1e8));

const STOCKS = [
  ["NVDA", "NVIDIA", 182, 0.0085, 0.0004],
  ["TSLA", "Tesla", 338, 0.012, 0.0002],
  ["AAPL", "Apple", 231, 0.005, 0.0002],
  ["AMZN", "Amazon", 214, 0.0065, 0.0003],
  ["HOOD", "Robinhood", 118, 0.013, 0.0005],
  ["COIN", "Coinbase", 284, 0.015, 0.0001],
];

async function main() {
  const { ethers, network } = hre;
  if (!["localhost", "hardhat"].includes(network.name)) throw new Error("Local networks only");
  const signers = await ethers.getSigners();
  const owner = signers[0], treasury = signers[1];
  const depositors = signers.slice(2, 10);
  const agents = signers.slice(10, 10 + PERSONAS.length);

  const usd = await ethers.deployContract("MockUSD");
  await usd.waitForDeployment();
  const startBlock = (await usd.deploymentTransaction().getTransaction()).blockNumber;
  const oracle = await ethers.deployContract("PriceOracle", [owner.address, owner.address]);
  const exchange = await ethers.deployContract("OracleExchange", [owner.address, usd.target, oracle.target]);
  await exchange.waitForDeployment();
  const tokens = [];
  for (const [sym, name] of STOCKS) {
    const t = await ethers.deployContract("StockToken", [`${name} (test)`, sym, exchange.target]);
    await t.waitForDeployment();
    await (await exchange.list(t.target)).wait();
    tokens.push(t);
  }
  // Reserve so sells can always pay out.
  for (let i = 0; i < 100; i++) await (await usd.mint(exchange.target, U(10000))).wait();

  const arena = await ethers.deployContract("Arena", [owner.address, usd.target, exchange.target, treasury.address]);
  await arena.waitForDeployment();

  let price = STOCKS.map((s) => s[2]);
  const setPrices = async () => (await oracle.setPrices(tokens.map((t) => t.target), price.map(P8))).wait();
  await setPrices();

  const vaults = [];
  for (let i = 0; i < PERSONAS.length; i++) {
    const p = PERSONAS[i];
    await (await arena.createVault(`Glassmind ${p.name}`, p.symbol, p.tagline, agents[i].address, tokens.map((t) => t.target),
      p.maxPositionBps, p.maxDrawdownBps, p.perfFeeBps)).wait();
  }
  const addrs = await arena.getVaults();
  for (let i = 0; i < addrs.length; i++) vaults.push({ p: PERSONAS[i], v: await ethers.getContractAt("AgentVault", addrs[i]), agent: agents[i], haltedAt: null });

  // $GLASS (local stand-in for the Pons token) + staking that pays out in NVDA.
  const glass = await ethers.deployContract("MockGlass", [owner.address]);
  await glass.waitForDeployment();
  const nvda = tokens[STOCKS.findIndex((s) => s[0] === "NVDA")];
  const staking = await ethers.deployContract("GlassStaking", [glass.target, nvda.target]);
  await staking.waitForDeployment();
  await (await nvda.connect(treasury).approve(staking.target, ethers.MaxUint256)).wait();
  await (await usd.connect(treasury).approve(exchange.target, ethers.MaxUint256)).wait();

  /** Treasury: cash out agent fee shares -> buy NVDA -> stream it to $GLASS stakers. */
  async function routeFees() {
    for (const x of vaults) {
      const sh = await x.v.balanceOf(treasury.address);
      if (sh > 0n) await (await x.v.connect(treasury).withdraw(sh)).wait();
    }
    const cash = await usd.balanceOf(treasury.address);
    if (cash < 1_000000n || (await staking.totalStaked()) === 0n) return 0;
    await (await exchange.connect(treasury).buy(nvda.target, cash, 0)).wait();
    const got = await nvda.balanceOf(treasury.address);
    await (await staking.connect(treasury).notifyReward(got)).wait();
    return Number(cash) / 1e6;
  }

  let seed = 20261114;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());

  for (const d of depositors) {
    await (await usd.mint(d.address, U(10000))).wait();
    for (const x of vaults) await (await usd.connect(d).approve(x.v.target, ethers.MaxUint256)).wait();
  }
  // Holders get $GLASS and most of them stake it.
  for (const d of depositors) {
    const amt = BigInt(Math.floor(200_000 + rnd() * 3_000_000)) * 10n ** 18n;
    await (await glass.transfer(d.address, amt)).wait();
    if (rnd() < 0.8) {
      await (await glass.connect(d).approve(staking.target, ethers.MaxUint256)).wait();
      await (await staking.connect(d).stake((amt * BigInt(50 + Math.floor(rnd() * 50))) / 100n)).wait();
    }
  }

  // The site's local dev wallet (account #16) gets some $GLASS to try staking.
  await (await glass.transfer(signers[16].address, 5_000_000n * 10n ** 18n)).wait();

  // Opening deposits: two backers per agent.
  for (let i = 0; i < vaults.length; i++) {
    for (const d of [depositors[(i * 2) % 8], depositors[(i * 2 + 1) % 8]]) {
      await (await vaults[i].v.connect(d).deposit(U(800 + Math.floor(rnd() * 2400)))).wait();
    }
  }

  const STEP = 30 * 60, STEPS = 4 * 48;
  const hist = []; // price history per step
  let t = (await ethers.provider.getBlock("latest")).timestamp + 60;

  for (let step = 0; step < STEPS; step++) {
    t += STEP;
    await ethers.provider.send("evm_setNextBlockTimestamp", [t]);
    const m = gauss() * 0.004;
    price = price.map((pr, i) => pr * Math.exp(STOCKS[i][4] + m + gauss() * STOCKS[i][3]));
    await setPrices();
    hist.push(price.slice());
    const back = (n) => hist[Math.max(0, hist.length - 1 - n)];

    for (const x of vaults) {
      if (await x.v.halted()) {
        if (x.haltedAt === null) x.haltedAt = step;
        if (step - x.haltedAt >= 10) { await (await x.v.connect(owner).resume()).wait(); x.haltedAt = null; }
        continue;
      }
      if (rnd() < 0.35) continue; // agents don't act every half hour
      const navUsd = Number(await x.v.nav()) / 1e6;
      const cash = Number(await usd.balanceOf(x.v.target)) / 1e6;
      const holdings = {};
      for (let i = 0; i < tokens.length; i++) {
        const bal = await tokens[i].balanceOf(x.v.target);
        holdings[STOCKS[i][0]] = { tokens: bal, value: (Number(bal) / 1e18) * price[i] };
      }
      const prices = Object.fromEntries(STOCKS.map((s, i) => [s[0], { now: price[i], h6: back(12)[i], h24: back(48)[i] }]));
      const d = decide(x.p, { symbols: STOCKS.map((s) => s[0]), prices, holdings, cash, nav: navUsd, rnd });
      const idx = STOCKS.findIndex((s) => s[0] === d.symbol);
      try {
        if (d.action === "buy") await (await x.v.connect(x.agent).trade(tokens[idx].target, true, U(d.usd), 0, d.thought)).wait();
        else if (d.action === "sell") {
          const amt = (holdings[d.symbol].tokens * BigInt(Math.round(d.fraction * 1e6))) / 1_000_000n;
          if (amt > 0n) await (await x.v.connect(x.agent).trade(tokens[idx].target, false, amt, 0, d.thought)).wait();
        } else if (rnd() < 0.25) await (await x.v.connect(x.agent).think(d.thought)).wait();
      } catch (e) {
        // Guardrail hit (e.g. position limit) — the agent just skips this turn.
      }
    }
    for (const x of vaults) await (await x.v.checkpoint()).wait();

    // Occasional new backers and exits.
    if (rnd() < 0.12) {
      const x = vaults[Math.floor(rnd() * vaults.length)];
      const d = depositors[Math.floor(rnd() * depositors.length)];
      if (rnd() < 0.75) await (await x.v.connect(d).deposit(U(200 + Math.floor(rnd() * 1500)))).wait();
      else {
        const sh = await x.v.balanceOf(d.address);
        if (sh > 0n) await (await x.v.connect(d).withdraw(sh / 3n)).wait();
      }
    }
    if (step % 12 === 11) await routeFees(); // every 6h the treasury pays stakers
    if (step % 24 === 0) console.log(`  simulated ${step / 2}h`);
  }

  const out = {
    network: network.name, chainId: 31337, demo: true, startBlock,
    usd: usd.target, oracle: oracle.target, exchange: exchange.target, arena: arena.target, treasury: treasury.address, owner: owner.address,
    glass: glass.target, staking: staking.target, rewardToken: nvda.target,
    stocks: STOCKS.map((s, i) => ({ symbol: s[0], name: s[1], address: tokens[i].target })),
    agents: PERSONAS.map((p, i) => ({ key: p.key, vault: addrs[i], agent: agents[i].address })),
  };
  fs.mkdirSync(path.join(__dirname, "..", "deployments"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "deployments", "localhost-arena.json"), JSON.stringify(out, null, 2));
  console.log(`Paid to $GLASS stakers: ${(Number(await staking.totalDistributed()) / 1e18).toFixed(4)} NVDA in ${await staking.rewardRounds()} rounds`);
  for (const x of vaults) console.log(`${x.p.name.padEnd(6)} NAV/share ${(Number(await x.v.navPerShare()) / 1e18).toFixed(4)}  trades ${await x.v.tradeCount()}  halted ${await x.v.halted()}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
