// Fetches for the content script, all from public Overmind and DexScreener endpoints (see host_permissions).
// Nothing about the user is sent or stored: only token and wallet addresses that are already on the page.
const API = 'https://api.overmind.ink';
const pairCache = new Map();
const cache = new Map(); // url -> { at, value }

async function json(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
/** A fetch that is reused for `ttl` ms, so scanning a page never floods the API. */
async function cached(url, ttl) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = json(url);
  cache.set(url, { at: Date.now(), value });
  try { return await value; } catch (e) { cache.delete(url); throw e; }
}

async function tokenOfPair(pair) {
  if (pairCache.has(pair)) return pairCache.get(pair);
  const b = await json(`https://api.dexscreener.com/latest/dex/pairs/robinhood/${pair}`);
  const p = (b.pairs ?? [b.pair]).find(Boolean);
  const token = p?.baseToken?.address?.toLowerCase() ?? null;
  pairCache.set(pair, token);
  return token;
}

/** The smart set: the ~300 most profitable wallets, wallet -> { rank, realizedUsd }. Refreshed hourly. */
async function smartSet() {
  const b = await cached(`${API}/traders?limit=300`, 60 * 60_000);
  const m = {};
  for (const t of b.traders ?? []) m[t.wallet.toLowerCase()] = { rank: t.rank, realizedUsd: t.realizedUsd };
  return m;
}

const handlers = {
  /** The card: hive reading, safety check and the token's deployer. */
  async hive(msg) {
    let token = msg.token;
    if (!token && msg.pair) token = await tokenOfPair(msg.pair);
    if (!token) return { token: null };
    const [hive, safety, info] = await Promise.all([
      json(`${API}/hive/${token}`),
      json(`${API}/tokens/${token}/signals`).catch(() => null),
      cached(`${API}/tokens/${token}`, 10 * 60_000).catch(() => null),
    ]);
    return {
      token,
      consensus: hive.consensus ?? null,
      safety: safety?.data ? { ...safety.data, risk: safety.risk_level ?? safety.data.risk } : null,
      deployer: info?.deployer?.toLowerCase() ?? null,
    };
  },
  /** Labels for wallets on the page: smart set ranks, the dev, and wallets that sniped this token's launch. */
  async labels(msg) {
    const smart = await smartSet();
    let snipers = [];
    if (msg.token) {
      const r = await cached(`${API}/v1/tokens/${msg.token}/replay`, 10 * 60_000).catch(() => null);
      snipers = [...new Set((r?.events ?? []).filter((e) => e.tags?.includes('sniper')).map((e) => e.trader.toLowerCase()))];
    }
    return { smart, snipers };
  },
  /** Smart wallets among the token's top 100 holders. */
  async wallets(msg) {
    const [smart, h] = await Promise.all([smartSet(), cached(`${API}/tokens/${msg.token}/holders?limit=100`, 2 * 60_000)]);
    const holders = (h.holders ?? []).filter((x) => !x.excluded);
    const inSet = holders.filter((x) => smart[x.wallet.toLowerCase()]).map((x) => ({ wallet: x.wallet, pct: x.pct, ...smart[x.wallet.toLowerCase()] }));
    return { smartHolders: inSet, holders: holders.length };
  },
  /** Overmind AI's plain-English read of the token (cached on the server too). */
  async explain(msg) {
    const b = await cached(`${API}/v1/hive/${msg.token}/explain`, 30 * 60_000);
    return { text: b.text ?? '' };
  },
  /** Wallet DNA: what kind of trader a wallet is. */
  async dna(msg) {
    const b = await cached(`${API}/v1/wallets/${msg.wallet}/dna`, 30 * 60_000);
    return { archetype: b.archetype, traits: b.traits ?? [], stats: b.stats ?? {} };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  h(msg).then((r) => reply({ ok: true, ...r })).catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
  return true; // async reply
});
