import { ethers } from "ethers";

const files = import.meta.glob("../../../contracts/deployments/*-arena.json", { eager: true, import: "default" });
const DEPLOYMENTS = Object.fromEntries(Object.values(files).map((d) => [d.network, d]));

export const NETWORKS = {
  rhTestnet: { chainId: 46630, name: "Robinhood Chain Testnet", rpc: "https://rpc.testnet.chain.robinhood.com" },
  // On the server the demo chain is reached through the site itself (VITE_RPC=/rpc, proxied by nginx).
  localhost: { chainId: 31337, name: "Overmind demo chain", rpc: import.meta.env.VITE_RPC ? new URL(import.meta.env.VITE_RPC, window.location.origin).href : "http://127.0.0.1:8545" },
};
export const NETWORK = import.meta.env.VITE_NETWORK || (DEPLOYMENTS.rhTestnet ? "rhTestnet" : "localhost");
export const NET = NETWORKS[NETWORK];
/** Static build (no chain behind it): the site replays a recorded snapshot of the demo arena. */
export const STATIC = !!import.meta.env.VITE_SNAPSHOT;
export const DEP = DEPLOYMENTS[NETWORK] || (STATIC ? {} : null);

let snapCache = null;
async function snapshot() {
  if (snapCache) return snapCache;
  const { default: S } = await import("./snapshot.json");
  // Shift every timestamp so the recording ends "now"; ages then keep growing naturally.
  const delta = Math.floor(Date.now() / 1000) - S.arena.now;
  const shift = (o) => {
    if (Array.isArray(o)) return o.map(shift);
    if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (k === "t" || k === "now") && typeof v === "number" ? v + delta : shift(v)]));
    return o;
  };
  snapCache = { arena: shift(S.arena), staking: shift(S.staking) };
  return snapCache;
}
/** $OVERMIND token on Pons — set VITE_OVER_TOKEN once it is launched. */
export const GLASS_TOKEN = import.meta.env.VITE_OVER_TOKEN || "";

export const PERSONA = {
  gATLAS: { key: "atlas", name: "Atlas", color: "#22d3ee", glyph: "A", style: "Value", emoji: "🧊" },
  gVOLT: { key: "volt", name: "Volt", color: "#ff7a1a", glyph: "V", style: "Momentum", emoji: "⚡" },
  gECHO: { key: "echo", name: "Echo", color: "#a78bfa", glyph: "E", style: "Contrarian", emoji: "🔮" },
  gSAGE: { key: "sage", name: "Sage", color: "#facc15", glyph: "S", style: "Balanced", emoji: "🧘" },
};
export const personaOf = (symbol) => PERSONA[symbol] || { key: symbol, name: symbol, color: "#cccccc", glyph: symbol?.[1] || "?", style: "Agent" };

const ARENA_ABI = ["function getVaults() view returns (address[])", "function treasury() view returns (address)"];
const ORACLE_ABI = ["function getPrice(address) view returns (uint256 usd, uint256 updatedAt)", "event PriceUpdated(address indexed token, uint256 usd, uint256 at)"];
export const VAULT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function strategy() view returns (string)",
  "function agent() view returns (address)",
  "function nav() view returns (uint256)",
  "function navPerShare() view returns (uint256)",
  "function peakNavPerShare() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function halted() view returns (bool)",
  "function tradeCount() view returns (uint256)",
  "function maxPositionBps() view returns (uint16)",
  "function maxDrawdownBps() view returns (uint16)",
  "function perfFeeBps() view returns (uint16)",
  "function deposit(uint256 usdIn) returns (uint256)",
  "function withdraw(uint256 shares) returns (uint256)",
  "event Deposit(address indexed user, uint256 usdIn, uint256 shares)",
  "event Withdraw(address indexed user, uint256 shares, uint256 usdOut)",
  "event AgentTrade(uint256 indexed id, address indexed asset, bool isBuy, uint256 amountIn, uint256 amountOut, uint256 navAfter, string thought, uint256 time)",
  "event Thought(string text, uint256 time)",
  "event Halted(uint256 navPerShare, uint256 peak, uint256 time)",
  "event Resumed()",
  "event FeeTaken(uint256 shares, uint256 navPerShare)",
  "event Snapshot(uint256 navPerShare, uint256 nav, uint256 supply, uint256 time)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
];

export const readProvider = new ethers.JsonRpcProvider(NET.rpc, NET.chainId, { staticNetwork: true });
export const usdToken = (runner) => new ethers.Contract(DEP.usd, ERC20_ABI, runner);
export const vaultAt = (addr, runner) => new ethers.Contract(addr, VAULT_ABI, runner);

const num6 = (v) => Number(v) / 1e6;
const num18 = (v) => Number(v) / 1e18;

/** Everything the arena screens need, read straight from the chain. */
export async function loadArena() {
  if (STATIC) { const a = (await snapshot()).arena; return { ...a, now: Math.floor(Date.now() / 1000) }; }
  const arena = new ethers.Contract(DEP.arena, ARENA_ABI, readProvider);
  const oracle = new ethers.Contract(DEP.oracle, ORACLE_ABI, readProvider);
  const [addrs, treasury, block] = await Promise.all([arena.getVaults(), arena.treasury(), readProvider.getBlock("latest")]);
  const now = Number(block.timestamp);
  const from = DEP.startBlock ?? 0;

  // Prices + history
  const priceLogs = await oracle.queryFilter(oracle.filters.PriceUpdated(), from);
  const stocks = DEP.stocks.map((s) => ({ ...s, series: [] }));
  const byAddr = Object.fromEntries(stocks.map((s) => [s.address.toLowerCase(), s]));
  // args[2] is the `at` timestamp — `args.at` would hit Array.prototype.at on ethers' Result.
  for (const l of priceLogs) byAddr[l.args.token.toLowerCase()]?.series.push({ t: Number(l.args[2]), p: Number(l.args.usd) / 1e8 });
  for (const s of stocks) s.price = s.series[s.series.length - 1]?.p ?? 0;

  const vaults = await Promise.all(addrs.map(async (address) => {
    const v = vaultAt(address, readProvider);
    const [name, symbol, strategy, agent, nav, nps, peak, supply, halted, tradeCount, maxPos, maxDd, fee, treasuryShares] = await Promise.all([
      v.name(), v.symbol(), v.strategy(), v.agent(), v.nav(), v.navPerShare(), v.peakNavPerShare(), v.totalSupply(), v.halted(),
      v.tradeCount(), v.maxPositionBps(), v.maxDrawdownBps(), v.perfFeeBps(), v.balanceOf(treasury),
    ]);
    const [snaps, trades, thoughts, deps, wds, halts] = await Promise.all([
      v.queryFilter(v.filters.Snapshot(), from),
      v.queryFilter(v.filters.AgentTrade(), from),
      v.queryFilter(v.filters.Thought(), from),
      v.queryFilter(v.filters.Deposit(), from),
      v.queryFilter(v.filters.Withdraw(), from),
      v.queryFilter(v.filters.Halted(), from),
    ]);
    // Every event carries its own timestamp, so no per-block lookups are needed.
    const curve = snaps.map((e) => ({ t: Number(e.args.time), p: num18(e.args.navPerShare) }));
    const holdings = await Promise.all(stocks.map(async (s) => {
      const bal = await new ethers.Contract(s.address, ERC20_ABI, readProvider).balanceOf(address);
      return { symbol: s.symbol, tokens: num18(bal), value: num18(bal) * s.price };
    }));
    const navUsd = num6(nav);
    const feed = [
      ...trades.map((e) => {
        const stock = byAddr[e.args.asset.toLowerCase()];
        const isBuy = e.args.isBuy;
        return {
          key: `${e.transactionHash}-${e.index}`, t: Number(e.args.time), kind: "trade", isBuy, symbol: stock?.symbol,
          usd: isBuy ? num6(e.args.amountIn) : num6(e.args.amountOut), thought: e.args.thought, tx: e.transactionHash,
        };
      }),
      ...thoughts.map((e) => ({ key: `${e.transactionHash}-${e.index}`, t: Number(e.args.time), kind: "thought", thought: e.args.text, tx: e.transactionHash })),
      ...halts.map((e) => ({ key: `${e.transactionHash}-${e.index}-h`, t: Number(e.args.time), kind: "halt",
        thought: `Guardrail triggered: value per share fell to $${num18(e.args.navPerShare).toFixed(3)} from a $${num18(e.args.peak).toFixed(3)} peak. Trading paused automatically.` })),
    ].sort((a, b) => b.t - a.t);
    const backers = new Map();
    for (const e of deps) backers.set(e.args.user.toLowerCase(), (backers.get(e.args.user.toLowerCase()) || 0) + num6(e.args.usdIn));
    const npsNum = num18(nps);
    const at = (t) => { let p = curve[0]?.p ?? 1; for (const x of curve) { if (x.t > t) break; p = x.p; } return p; };
    return {
      address, name, symbol, strategy, agent, persona: personaOf(symbol),
      nav: navUsd, nps: npsNum, peak: num18(peak), supply: num18(supply), halted, trades: Number(tradeCount),
      maxPos: Number(maxPos) / 1e4, maxDd: Number(maxDd) / 1e4, fee: Number(fee) / 1e4,
      ret: npsNum - 1, ret24: at(now - 86400) ? npsNum / at(now - 86400) - 1 : 0,
      drawdown: num18(peak) > 0 ? 1 - npsNum / num18(peak) : 0,
      cash: navUsd - holdings.reduce((s, h) => s + h.value, 0),
      holdings, curve: curve.length ? curve : [{ t: now, p: npsNum }], feed,
      backers: backers.size, depositsLog: deps, withdrawsLog: wds,
      treasuryValue: num18(treasuryShares) * npsNum,
    };
  }));

  vaults.sort((a, b) => b.ret - a.ret);
  return { now, vaults, stocks, treasury };
}

const STAKING_ABI = [
  "function totalStaked() view returns (uint256)",
  "function totalDistributed() view returns (uint256)",
  "function rewardRounds() view returns (uint256)",
  "function staked(address) view returns (uint256)",
  "function earned(address) view returns (uint256)",
  "function stake(uint256)",
  "function unstake(uint256)",
  "function claim() returns (uint256)",
  "event RewardAdded(address indexed from, uint256 amount, uint256 totalStaked, uint256 time)",
];
export const stakingAt = (runner) => new ethers.Contract(DEP.staking, STAKING_ABI, runner);
export const glassToken = (runner) => new ethers.Contract(DEP.glass, ERC20_ABI, runner);

/** $OVERMIND staking totals and payout history (NVDA amounts valued at today's price). */
export async function loadStaking(nvdaPrice) {
  if (STATIC) return (await snapshot()).staking;
  if (!DEP.staking) return null;
  const s = stakingAt(readProvider);
  const [total, dist, rounds, logs] = await Promise.all([
    s.totalStaked(), s.totalDistributed(), s.rewardRounds(), s.queryFilter(s.filters.RewardAdded(), DEP.startBlock ?? 0),
  ]);
  let cum = 0;
  const payouts = logs.map((e) => {
    const nv = num18(e.args.amount);
    cum += nv * nvdaPrice;
    return { t: Number(e.args.time), nvda: nv, usd: nv * nvdaPrice, cum };
  });
  return { totalStaked: num18(total), paidNvda: num18(dist), paidUsd: num18(dist) * nvdaPrice, rounds: Number(rounds), payouts };
}

export async function loadStake(user) {
  const s = stakingAt(readProvider);
  const [bal, st, earned] = await Promise.all([glassToken(readProvider).balanceOf(user), s.staked(user), s.earned(user)]);
  return { balance: bal, staked: st, earned, balanceNum: num18(bal), stakedNum: num18(st), earnedNum: num18(earned) };
}

export async function ensureGlassAllowance(signer, amount) {
  const t = glassToken(signer);
  const owner = await signer.getAddress();
  if ((await t.allowance(owner, DEP.staking)) < amount) await (await t.approve(DEP.staking, amount)).wait();
}

export async function loadPosition(vault, user) {
  const v = vaultAt(vault.address, readProvider);
  const [shares, balance] = await Promise.all([v.balanceOf(user), usdToken(readProvider).balanceOf(user)]);
  const me = user.toLowerCase();
  const deposited = vault.depositsLog.filter((e) => e.args.user.toLowerCase() === me).reduce((s, e) => s + num6(e.args.usdIn), 0);
  const withdrawn = vault.withdrawsLog.filter((e) => e.args.user.toLowerCase() === me).reduce((s, e) => s + num6(e.args.usdOut), 0);
  const value = num18(shares) * vault.nps;
  return { shares, sharesNum: num18(shares), value, balance, deposited, withdrawn, pnl: value + withdrawn - deposited };
}

// ------------------------------------------------------------------ wallet

// Local demo only: a fresh account from Hardhat's public test mnemonic that the seed script never uses
// (0 = owner, 1 = treasury, 2-9 = demo backers, 10-13 = agents).
const DEV_MNEMONIC = "test test test test test test test test test test test junk";
const DEV_INDEX = 16;

export async function connectWallet() {
  if (STATIC) throw new Error("Staking opens with the $OVERMIND launch on Pons. Stay tuned.");
  if (NETWORK === "localhost" && !window.ethereum) {
    const w = ethers.HDNodeWallet.fromPhrase(DEV_MNEMONIC, undefined, `m/44'/60'/0'/0/${DEV_INDEX}`).connect(readProvider);
    const signer = new ethers.NonceManager(w);
    return { signer, address: await signer.getAddress(), kind: "dev" };
  }
  if (!window.ethereum) throw new Error("No wallet found. Install MetaMask.");
  const bp = new ethers.BrowserProvider(window.ethereum);
  await bp.send("eth_requestAccounts", []);
  const hex = "0x" + NET.chainId.toString(16);
  try {
    await bp.send("wallet_switchEthereumChain", [{ chainId: hex }]);
  } catch (e) {
    if (e?.error?.code === 4902 || e?.code === 4902) {
      await bp.send("wallet_addEthereumChain", [{ chainId: hex, chainName: NET.name, rpcUrls: [NET.rpc], nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 } }]);
    } else throw e;
  }
  const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
  return { signer, address: await signer.getAddress(), kind: "injected" };
}

export async function ensureAllowance(signer, spender, amount) {
  const t = usdToken(signer);
  const owner = await signer.getAddress();
  if ((await t.allowance(owner, spender)) < amount) await (await t.approve(spender, amount)).wait();
}

export const errMsg = (e) => e?.shortMessage || e?.info?.error?.message || e?.reason || e?.message || String(e);
