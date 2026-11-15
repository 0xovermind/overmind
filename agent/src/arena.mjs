// Overmind live runner: keeps the arena moving.
//   node src/arena.mjs            agents trade every TICK_SECONDS (default 45)
//   node src/arena.mjs --feed     also pushes demo prices (local chain only)
//   node src/arena.mjs --once     one round
// With ANTHROPIC_API_KEY set, each agent thinks with Claude; otherwise it uses its rule-based persona brain.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { PERSONAS, decide: ruleDecide } = require(path.join(here, "..", "..", "contracts", "scripts", "personas.js"));

const args = new Set(process.argv.slice(2));
const ONCE = args.has("--once");
const FEED = args.has("--feed");
const TICK = Number(process.env.TICK_SECONDS || 45);
const MODEL = "claude-opus-5-5";

const DEP = JSON.parse(fs.readFileSync(process.env.ARENA_DEPLOYMENT || path.join(here, "..", "..", "contracts", "deployments", "localhost-arena.json"), "utf8"));
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_ARENA || "http://127.0.0.1:8545");

// Local demo: Hardhat's public test mnemonic. Account 0 = owner/feeder, 10.. = agents.
const DEV_MNEMONIC = "test test test test test test test test test test test junk";
const devWallet = (i) => new ethers.NonceManager(ethers.HDNodeWallet.fromPhrase(DEV_MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).connect(provider));
const isLocal = DEP.chainId === 31337;
const feeder = isLocal ? devWallet(0) : process.env.FEEDER_PRIVATE_KEY && new ethers.NonceManager(new ethers.Wallet(process.env.FEEDER_PRIVATE_KEY, provider));
const agentSigner = (i) => (isLocal ? devWallet(10 + i) : new ethers.NonceManager(new ethers.Wallet(process.env[`AGENT_KEY_${PERSONAS[i].key.toUpperCase()}`], provider)));

const ORACLE_ABI = [
  "function setPrices(address[] tokens, uint256[] usd)",
  "function getPrice(address) view returns (uint256 usd, uint256 updatedAt)",
  "event PriceUpdated(address indexed token, uint256 usd, uint256 at)",
];
const VAULT_ABI = [
  "function nav() view returns (uint256)",
  "function halted() view returns (bool)",
  "function trade(address asset, bool isBuy, uint256 amount, uint256 minOut, string thought) returns (uint256)",
  "function think(string text)",
  "function checkpoint()",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

const oracle = new ethers.Contract(DEP.oracle, ORACLE_ABI, provider);
const usd = new ethers.Contract(DEP.usd, ERC20_ABI, provider);
const stocks = DEP.stocks;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// --------------------------------------------------------------- prices

async function priceSnapshot() {
  const now = Number((await provider.getBlock("latest")).timestamp);
  const latest = await provider.getBlockNumber();
  const from = Math.max(DEP.startBlock ?? 0, latest - 20000);
  const logs = await oracle.queryFilter(oracle.filters.PriceUpdated(), from);
  const series = Object.fromEntries(stocks.map((s) => [s.address.toLowerCase(), []]));
  // args[2] is the `at` timestamp — `args.at` would hit Array.prototype.at on ethers' Result.
  for (const l of logs) series[l.args.token.toLowerCase()]?.push({ t: Number(l.args[2]), p: Number(l.args.usd) / 1e8 });
  const at = (arr, t) => { let v = arr[0]?.p; for (const x of arr) { if (x.t > t) break; v = x.p; } return v; };
  return Object.fromEntries(stocks.map((s) => {
    const arr = series[s.address.toLowerCase()];
    const nowP = arr[arr.length - 1]?.p;
    return [s.symbol, { now: nowP, h6: at(arr, now - 6 * 3600) ?? nowP, h24: at(arr, now - 24 * 3600) ?? nowP }];
  }));
}

let walk = null;
async function feedPrices() {
  if (!walk) walk = await Promise.all(stocks.map(async (s) => Number((await oracle.getPrice(s.address)).usd) / 1e8));
  const m = (Math.random() - 0.5) * 0.004;
  walk = walk.map((p) => p * Math.exp(m + (Math.random() - 0.5) * 0.012));
  const o = oracle.connect(feeder);
  await (await o.setPrices(stocks.map((s) => s.address), walk.map((p) => BigInt(Math.round(p * 1e8))))).wait();
}

// ----------------------------------------------------------------- brain

const Decision = z.object({
  action: z.enum(["buy", "sell", "hold"]),
  symbol: z.string().nullable(),
  usd: z.number().nullable(),
  fraction: z.number().nullable(),
  thought: z.string(),
});
const DECISION_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["action", "symbol", "usd", "fraction", "thought"],
  properties: {
    action: { type: "string", enum: ["buy", "sell", "hold"] },
    symbol: { type: ["string", "null"], description: "Ticker to trade, or null when holding" },
    usd: { type: ["number", "null"], description: "USD to spend when buying" },
    fraction: { type: ["number", "null"], description: "Fraction of the position to sell, 0-1" },
    thought: { type: "string", description: "Your reasoning in first person, max 240 characters, with concrete numbers. Published on-chain." },
  },
};

const claude = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function claudeDecide(persona, ctx) {
  const book = ctx.symbols.map((s) => {
    const p = ctx.prices[s];
    return `${s}: $${p.now.toFixed(2)} | 6h ${((p.now / p.h6 - 1) * 100).toFixed(2)}% | 24h ${((p.now / p.h24 - 1) * 100).toFixed(2)}% | held $${(ctx.holdings[s]?.value || 0).toFixed(0)}`;
  }).join("\n");
  const res = await claude.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: DECISION_SCHEMA } },
    system:
      `You are ${persona.name}, an AI trader in the Overmind arena on Robinhood Chain. Your style: ${persona.tagline}\n` +
      `You trade tokenized stocks 24/7 for depositors. Hard limits enforced by the contract: max ${persona.maxPositionBps / 100}% of the vault in one stock; ` +
      `trading halts at a ${persona.maxDrawdownBps / 100}% drawdown. Your reasoning is published on-chain and read by the public: be specific, honest about uncertainty, in character, no hype or promises. ` +
      `Make at most one trade per turn. Holding is fine.`,
    messages: [{
      role: "user",
      content: `Vault value $${ctx.nav.toFixed(2)}, cash $${ctx.cash.toFixed(2)}.\nMarket and positions:\n${book}\n\nDecide your move.`,
    }],
  });
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") throw new Error(`model stop: ${res.stop_reason}`);
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return Decision.parse(JSON.parse(text));
}

// ----------------------------------------------------------------- round

async function round() {
  if (FEED && isLocal) await feedPrices();
  const prices = await priceSnapshot();
  const symbols = stocks.map((s) => s.symbol);

  for (let i = 0; i < DEP.agents.length; i++) {
    const persona = PERSONAS.find((p) => p.key === DEP.agents[i].key);
    const signer = agentSigner(i);
    const v = new ethers.Contract(DEP.agents[i].vault, VAULT_ABI, signer);
    try {
      if (await v.halted()) { log(persona.name, "halted by guardrail — waiting for review"); continue; }
      const navUsd = Number(await v.nav()) / 1e6;
      const cash = Number(await usd.balanceOf(v.target)) / 1e6;
      const holdings = {};
      for (const s of stocks) {
        const bal = await new ethers.Contract(s.address, ERC20_ABI, provider).balanceOf(v.target);
        holdings[s.symbol] = { tokens: bal, value: (Number(bal) / 1e18) * prices[s.symbol].now };
      }
      const ctx = { symbols, prices, holdings, cash, nav: navUsd, rnd: Math.random };
      let d;
      try { d = claude ? await claudeDecide(persona, ctx) : ruleDecide(persona, ctx); }
      catch (e) { log(persona.name, `brain error (${e.message}), using rules`); d = ruleDecide(persona, ctx); }

      const stock = stocks.find((s) => s.symbol === d.symbol);
      const thought = d.thought.slice(0, 280);
      if (d.action === "buy" && stock && d.usd > 1) {
        const capUsd = navUsd * (persona.maxPositionBps / 10000) * 0.95 - holdings[stock.symbol].value;
        const amt = Math.min(d.usd, cash, capUsd);
        if (amt > 1) {
          await (await v.trade(stock.address, true, ethers.parseUnits(amt.toFixed(6), 6), 0, thought)).wait();
          log(persona.name, `BUY ${stock.symbol} $${amt.toFixed(0)} — ${thought}`);
        }
      } else if (d.action === "sell" && stock && d.fraction > 0) {
        const amt = (holdings[stock.symbol].tokens * BigInt(Math.round(Math.min(1, d.fraction) * 1e6))) / 1_000_000n;
        if (amt > 0n) {
          await (await v.trade(stock.address, false, amt, 0, thought)).wait();
          log(persona.name, `SELL ${Math.round(d.fraction * 100)}% ${stock.symbol} — ${thought}`);
        }
      } else if (Math.random() < 0.3) {
        await (await v.think(thought)).wait();
        log(persona.name, `thinks — ${thought}`);
      }
      await (await v.checkpoint()).wait();
    } catch (e) {
      log(persona.name, `skipped: ${e.shortMessage || e.message}`);
    }
  }
}

// ------------------------------------------------- treasury -> $GLASS stakers

const treasury = isLocal ? devWallet(1) : process.env.TREASURY_PRIVATE_KEY && new ethers.NonceManager(new ethers.Wallet(process.env.TREASURY_PRIVATE_KEY, provider));
let rounds = 0;

/** Cash out the treasury's fee shares, buy the reward token, stream it to stakers. */
async function routeFees() {
  if (!treasury || !DEP.staking) return;
  const me = await treasury.getAddress();
  const VAULT = ["function balanceOf(address) view returns (uint256)", "function withdraw(uint256) returns (uint256)"];
  for (const a of DEP.agents) {
    const v = new ethers.Contract(a.vault, VAULT, treasury);
    const sh = await v.balanceOf(me);
    if (sh > 0n) await (await v.withdraw(sh)).wait();
  }
  const cashToken = new ethers.Contract(DEP.usd, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], treasury);
  const cash = await cashToken.balanceOf(me);
  const staking = new ethers.Contract(DEP.staking, ["function totalStaked() view returns (uint256)", "function notifyReward(uint256)"], treasury);
  if (cash < 100_000n || (await staking.totalStaked()) === 0n) return;
  await (await cashToken.approve(DEP.exchange, cash)).wait();
  const ex = new ethers.Contract(DEP.exchange, ["function buy(address,uint256,uint256) returns (uint256)"], treasury);
  await (await ex.buy(DEP.rewardToken, cash, 0)).wait();
  const reward = new ethers.Contract(DEP.rewardToken, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], treasury);
  const got = await reward.balanceOf(me);
  await (await reward.approve(DEP.staking, got)).wait();
  await (await staking.notifyReward(got)).wait();
  log(`TREASURY paid $${(Number(cash) / 1e6).toFixed(2)} of agent fees to $GLASS stakers as NVDA`);
}

async function main() {
  log(`Overmind runner · ${claude ? `Claude (${MODEL})` : "rule brains (no ANTHROPIC_API_KEY)"} · ${FEED ? "feeding demo prices" : "using oracle prices"}`);
  do {
    try { await round(); } catch (e) { log("round failed:", e.message); }
    if (++rounds % 6 === 0) { try { await routeFees(); } catch (e) { log("fee routing failed:", e.shortMessage || e.message); } }
    if (!ONCE) await new Promise((r) => setTimeout(r, TICK * 1000));
  } while (!ONCE);
}
main();
