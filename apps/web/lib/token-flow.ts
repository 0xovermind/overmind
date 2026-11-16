/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- ported as-is from Coreum (MIT); written for a looser tsconfig (no noUncheckedIndexedAccess).
// Token Map data (from Coreum, MIT): every Transfer of a token on Robinhood Chain, turned into a graph of
// who holds it, who moved it and who is linked. Read on the site (the public RPC turns
// away Workers). A linked group is 3+ wallets whose first tokens came from one wallet;
// a sniper bought from a contract in the first 3 blocks of trading.

const RPC = "https://rpc.mainnet.chain.robinhood.com";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dead";
const BURN = new Set([ZERO, DEAD]);
const SPAN = 10_000_000; // the RPC caps getLogs at 10M blocks and 10k results
const MAX_LOGS = 20_000;
const LAUNCH_LOGS = 3_000;
const MAX_NODES = 80;
const MAX_EVENTS = 3000;

// Contracts that hold supply for everyone
export const KNOWN: Record<string, string> = {
  "0x8366a39cc670b4001a1121b8f6a443a643e40951": "Uniswap v4 PoolManager",
  "0x267444d099b10fb5ed7c3cc7b7c767adca574952": "Pons locker",
  "0xe5e702641ea86f4ae6cc3cdaed2b886f976be044": "Pons hook",
  "0x9689992f5b5c09447f15906d8d11214944488341": "Pons router",
};

type Transfer = { from: string; to: string; value: bigint; block: number; li: number };
export type NodeKind = "mint" | "burn" | "pool" | "contract" | "deployer" | "wallet" | "others";
export type FlowNode = { id: string; label: string; kind: NodeKind; balance: number; volume: number; cluster?: number; sniper?: boolean; members?: number };
export type TokenFlow = {
  token: string; name: string; symbol: string; deployer: string | null; complete: boolean;
  holders: number | null; linked: number; linkedShare: number; snipers: number; sniperShare: number; top10: number;
  nodes: FlowNode[]; edges: [number, number, number, number][]; events: [number, number, number, number][]; totalEvents: number;
  at: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (n: number) => "0x" + n.toString(16);
const addr = (topic: string) => "0x" + topic.slice(26).toLowerCase();

async function post<T>(body: unknown, tries = 4): Promise<T> {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(20000) });
  const t = await r.text();
  const j = t.startsWith("{") || t.startsWith("[") ? JSON.parse(t) : null;
  if ((!j || (!Array.isArray(j) && (j.error?.code === 429 || /too many requests|rate/i.test(j.error?.message || "")))) && tries > 0) {
    await sleep(1500 * (5 - tries));
    return post<T>(body, tries - 1);
  }
  if (!j) throw new Error("RPC unavailable");
  return j as T;
}
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const j = await post<{ result?: T; error?: { message: string } }>({ jsonrpc: "2.0", id: 1, method, params });
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}
async function batch(calls: { method: string; params: unknown[] }[]): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let i = 0; i < calls.length; i += 25) {
    const part = calls.slice(i, i + 25);
    const j = await post<{ id: number; result?: string }[]>(part.map((c, id) => ({ jsonrpc: "2.0", id, ...c })));
    const by = new Map((Array.isArray(j) ? j : []).map((r) => [r.id, r.result ?? null]));
    part.forEach((_, id) => out.push(by.get(id) ?? null));
  }
  return out;
}
const str = (h: string | null) => {
  if (!h || h.length < 130) return "";
  const len = parseInt(h.slice(66, 130), 16);
  const bytes = (h.slice(130, 130 + len * 2).match(/../g) ?? []).map((b) => parseInt(b, 16));
  return new TextDecoder().decode(new Uint8Array(bytes)).replace(/[^\x20-\x7e]/g, "").slice(0, 40);
};

class TooMany extends Error {}

/** Every Transfer of the token, oldest first. Past MAX_LOGS it keeps the most recent ones (complete: false). */
async function transfers(token: string, launchBlock?: number | null): Promise<{ list: Transfer[]; complete: boolean }> {
  const head = parseInt(await rpc<string>("eth_blockNumber", []), 16);
  let total = 0;
  const get = async (lo: number, hi: number): Promise<Transfer[]> => {
    if (total > MAX_LOGS) throw new TooMany();
    const j = await post<{ result?: { topics: string[]; data: string; blockNumber: string; logIndex: string }[]; error?: { message: string } }>({
      jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ address: token, topics: [TRANSFER], fromBlock: hex(lo), toBlock: hex(hi) }],
    });
    if (j.error) {
      if (!/exceed|limit|too many|range/i.test(j.error.message) || hi <= lo) throw new Error(j.error.message);
      const mid = Math.floor((lo + hi) / 2);
      const newer = await get(mid + 1, hi); // newer half first, so the cap keeps the recent activity
      const older = await get(lo, mid).catch((e) => { if (e instanceof TooMany) return []; throw e; });
      return [...older, ...newer];
    }
    const L = (j.result ?? []).filter((l) => l.topics.length >= 3);
    total += L.length;
    return L.map((l) => ({ from: addr(l.topics[1]), to: addr(l.topics[2]), value: BigInt(l.data === "0x" ? 0 : l.data.slice(0, 66)), block: parseInt(l.blockNumber, 16), li: parseInt(l.logIndex, 16) }));
  };
  const ranges: [number, number][] = [];
  const start = Math.max(0, (launchBlock ?? 0) - 1); // nothing moves before the launch
  for (let hi = head; hi >= start; hi -= SPAN) ranges.push([Math.max(start, hi - SPAN + 1), hi]);
  const parts: Transfer[][] = new Array(ranges.length);
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (next < ranges.length) {
      const i = next++;
      parts[i] = await get(...ranges[i]).catch((e) => { if (e instanceof TooMany) return []; throw e; });
    }
  }));
  const list = parts.flat().sort((a, b) => a.block - b.block || a.li - b.li);
  const complete = total <= MAX_LOGS;
  if (complete) return { list, complete };
  // a busy token: keep the launch too (who bought first, what the dev did), then the recent activity
  let launch: Transfer[] = [];
  if (launchBlock) {
    total = 0;
    for (let span = 200_000; span >= 2_000 && !launch.length; span = Math.floor(span / 5)) {
      launch = await get(launchBlock, launchBlock + span).catch(() => []);
    }
    launch = launch.slice(0, LAUNCH_LOGS);
  }
  const tail = list.slice(-(MAX_LOGS - launch.length));
  const cut = tail.length ? tail[0].block : Infinity;
  return { list: [...launch.filter((t) => t.block < cut), ...tail], complete };
}

/** Contracts vs wallets by getCode; a failed lookup stays unclassified, never a "wallet". */
async function classify(list: string[]) {
  const codes = await batch(list.map((a) => ({ method: "eth_getCode", params: [a, "latest"] })));
  const contracts = new Set<string>(), classified = new Set<string>();
  list.forEach((a, i) => {
    const c = codes[i];
    if (c === null) return;
    classified.add(a);
    if (c !== "0x" && !c.startsWith("0xef0100")) contracts.add(a); // an EIP-7702 delegated wallet is still a wallet
  });
  return { contracts, classified };
}

export async function tokenFlow(token: string, info: { creator?: string | null; curve?: string | null; block?: number | null }): Promise<TokenFlow | null> {
  token = token.toLowerCase();
  const [nameH, symH, supH] = await batch([
    { method: "eth_call", params: [{ to: token, data: "0x06fdde03" }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: "0x95d89b41" }, "latest"] },
    { method: "eth_call", params: [{ to: token, data: "0x18160ddd" }, "latest"] },
  ]);
  const { list: T, complete } = await transfers(token, info.block);
  if (!T.length) return null;
  const deployer = info.creator?.toLowerCase() ?? null;
  const curve = info.curve?.toLowerCase() ?? null;

  // balances, first sender and first block of every address
  const balances = new Map<string, bigint>(), firstFrom = new Map<string, string>(), firstBlock = new Map<string, number>();
  const inflow = new Map<string, bigint>(), outflow = new Map<string, bigint>();
  for (const t of T) {
    balances.set(t.from, (balances.get(t.from) ?? BigInt(0)) - t.value);
    balances.set(t.to, (balances.get(t.to) ?? BigInt(0)) + t.value);
    outflow.set(t.from, (outflow.get(t.from) ?? BigInt(0)) + t.value);
    inflow.set(t.to, (inflow.get(t.to) ?? BigInt(0)) + t.value);
    if (!firstFrom.has(t.to)) { firstFrom.set(t.to, t.from); firstBlock.set(t.to, t.block); }
  }
  for (const a of BURN) balances.delete(a);
  balances.delete(token);
  if (!complete) {
    // the middle of the history is missing, so read the real balance of everyone who could matter
    const cand = [...new Set([...[...balances].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 250).map(([a]) => a),
      ...[...inflow].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 150).map(([a]) => a)])].filter((a) => !BURN.has(a) && a !== token);
    const res = await batch(cand.map((a) => ({ method: "eth_call", params: [{ to: token, data: "0x70a08231" + a.slice(2).padStart(64, "0") }, "latest"] })));
    for (const a of balances.keys()) balances.set(a, BigInt(0));
    cand.forEach((a, i) => { const r = res[i]; if (r && r !== "0x") balances.set(a, BigInt(r.slice(0, 66))); });
  }
  const held = [...balances].filter(([, b]) => b > BigInt(0)).sort((a, b) => (b[1] > a[1] ? 1 : -1));
  const supply = supH && supH !== "0x" && BigInt(supH.slice(0, 66)) > BigInt(0) ? BigInt(supH.slice(0, 66)) : held.reduce((s, [, b]) => s + b, BigInt(0)) || BigInt(1);
  const pct = (v: bigint) => Number((v * BigInt(1_000_000)) / supply) / 10_000;

  // who is a contract: the top holders and every wallet that seeded 3+ holders
  const seeded = new Map<string, number>();
  for (const [a, src] of firstFrom) if (!BURN.has(src) && (balances.get(a) ?? BigInt(0)) > BigInt(0)) seeded.set(src, (seeded.get(src) ?? 0) + 1);
  const sources = [...seeded].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([a]) => a);
  const volume = new Map<string, bigint>();
  for (const a of new Set([...inflow.keys(), ...outflow.keys()])) {
    const i = inflow.get(a) ?? BigInt(0), o = outflow.get(a) ?? BigInt(0);
    volume.set(a, i > o ? i : o);
  }
  const busiest = [...volume].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 40).map(([a]) => a);
  const toCheck = [...new Set([...held.slice(0, 40).map(([a]) => a), ...sources.slice(0, 60), ...busiest])].filter((a) => !BURN.has(a));
  const { contracts, classified } = await classify(toCheck);
  for (const a of [...Object.keys(KNOWN), ...(curve ? [curve] : [])]) { contracts.add(a); classified.add(a); }

  const wallets = held.filter(([a]) => !contracts.has(a) && (classified.has(a) || !held.slice(0, 40).some(([h]) => h === a)));
  const top10 = pct(wallets.slice(0, 10).reduce((s, [, b]) => s + b, BigInt(0)));

  // linked wallets: 3+ wallets whose first tokens came straight from the same wallet
  const groups = new Map<string, string[]>();
  for (const [a] of wallets) {
    const src = firstFrom.get(a);
    if (!src || BURN.has(src) || contracts.has(src) || !classified.has(src)) continue;
    groups.set(src, [...(groups.get(src) ?? []), a]);
  }
  const clusterOf = new Map<string, number>();
  [...groups].filter(([, ws]) => ws.length >= 3).forEach(([, ws], i) => ws.forEach((w) => clusterOf.set(w, i + 1)));
  const linkedShare = pct([...clusterOf.keys()].reduce((s, a) => s + (balances.get(a) ?? BigInt(0)), BigInt(0)));

  // snipers: bought from a contract in the first 3 blocks of trading
  const snipers = new Set<string>();
  const firstBuy = T.find((t) => contracts.has(t.from) && !contracts.has(t.to) && !BURN.has(t.to));
  if (firstBuy) for (const [a, b] of firstBlock) if (b <= firstBuy.block + 2 && contracts.has(firstFrom.get(a) ?? "") && !contracts.has(a)) snipers.add(a);
  const sniperShare = pct([...snipers].reduce((s, a) => s + ((balances.get(a) ?? BigInt(0)) > BigInt(0) ? balances.get(a)! : BigInt(0)), BigInt(0)));

  // who gets a dot: infrastructure, the deployer, the biggest holders, linked wallets, snipers, busy traders
  const bal = (a: string) => balances.get(a) ?? BigInt(0);
  const byBal = (a: string, b: string) => (bal(b) > bal(a) ? 1 : bal(b) < bal(a) ? -1 : 0);
  const byVol = (a: string, b: string) => ((volume.get(b) ?? BigInt(0)) > (volume.get(a) ?? BigInt(0)) ? 1 : -1);
  const all = [...volume.keys()].filter((a) => !BURN.has(a));
  const picked: string[] = [];
  const add = (a?: string | null) => { if (a && !picked.includes(a) && picked.length < MAX_NODES) picked.push(a); };
  if (volume.has(ZERO)) add(ZERO);
  if (volume.has(DEAD)) add(DEAD);
  all.filter((a) => contracts.has(a)).sort(byVol).slice(0, 10).forEach(add);
  if (deployer && volume.has(deployer)) add(deployer);
  all.filter((a) => !contracts.has(a)).sort(byBal).slice(0, 35).forEach(add);
  [...clusterOf.keys()].sort(byBal).slice(0, 18).forEach(add);
  [...snipers].sort(byVol).slice(0, 8).forEach(add);
  all.filter((a) => !contracts.has(a)).sort(byVol).slice(0, 15).forEach(add);

  const index = new Map(picked.map((a, i) => [a, i]));
  const othersIdx = picked.length;
  const idx = (a: string) => index.get(a) ?? othersIdx;
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const nodes: FlowNode[] = picked.map((a) => {
    const kind: NodeKind = a === ZERO ? "mint" : a === DEAD ? "burn" : a === deployer ? "deployer"
      : a === curve || a === "0x8366a39cc670b4001a1121b8f6a443a643e40951" ? "pool" : contracts.has(a) ? "contract" : "wallet";
    const label = kind === "mint" ? "Mint" : kind === "burn" ? "Burn" : kind === "deployer" ? "Dev"
      : a === curve ? "Pons curve" : KNOWN[a] ?? (kind === "contract" ? "Contract" : short(a));
    return {
      id: a, label, kind,
      balance: kind === "mint" ? 0 : pct(bal(a) > BigInt(0) ? bal(a) : BigInt(0)),
      volume: pct(volume.get(a) ?? BigInt(0)),
      ...(clusterOf.has(a) ? { cluster: clusterOf.get(a) } : {}),
      ...(snipers.has(a) ? { sniper: true } : {}),
    };
  });
  const rest = all.filter((a) => !index.has(a));
  nodes.push({
    id: "others", label: `${rest.length.toLocaleString("en-US")} other wallets`, kind: "others",
    balance: pct(rest.reduce((s, a) => s + (bal(a) > BigInt(0) ? bal(a) : BigInt(0)), BigInt(0))),
    volume: pct(rest.reduce((s, a) => s + (volume.get(a) ?? BigInt(0)), BigInt(0))),
    members: rest.length,
  });

  const agg = new Map<string, [number, number, bigint, number]>();
  const first = T[0].block;
  const allEvents: [number, number, number, number][] = [];
  for (const t of T) {
    const s = idx(t.from), d = idx(t.to);
    if (s === d) continue;
    const k = `${s}>${d}`;
    const e = agg.get(k) ?? [s, d, BigInt(0), 0];
    e[2] += t.value; e[3] += 1;
    agg.set(k, e);
    allEvents.push([t.block - first, s, d, pct(t.value)]);
  }
  // the launch in full detail, then an even sample so the replay stays smooth
  let events = allEvents;
  if (allEvents.length > MAX_EVENTS) {
    const head = allEvents.slice(0, 400), tail = allEvents.slice(400), step = tail.length / (MAX_EVENTS - 400);
    events = [...head, ...Array.from({ length: MAX_EVENTS - 400 }, (_, i) => tail[Math.floor(i * step)])];
  }

  return {
    token, name: str(nameH) || short(token), symbol: str(symH) || "?", deployer, complete,
    holders: complete ? held.length : null, linked: clusterOf.size, linkedShare, snipers: snipers.size, sniperShare, top10,
    nodes, edges: [...agg.values()].map(([s, d, v, n]) => [s, d, pct(v), n]), events, totalEvents: allEvents.length,
    at: Math.floor(Date.now() / 1000),
  };
}
