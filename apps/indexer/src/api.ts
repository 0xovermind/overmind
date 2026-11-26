import { Hono } from 'hono';
import postgres, { type Sql } from 'postgres';
import { ROBINHOOD_CHAIN, circulatingSupply, tagHolders } from '@overmind/core';
import { dbUrl, type Env } from './env';
import { hydrator } from './hydrator';
import {
  POOL_TVL_TTL_S, walletPnl, minuteCandles, subMinuteCandles, tokenDetail, tokenPools, tokenSnapshot, tokenStats, tokenSummaries, trenchesList,
  liftfunOn,
} from './data';

export { tokenSummaries } from './data';
import { loadSnapshot } from './signals';
import { searchTokens } from './search';
import { refreshSignalsIfStale } from './signals-refresh';
import { page, repairBalances, walletHoldings, walletPosition } from './wallets';
import { PAUSED_BODY, readPause } from './pause';
import { TRANSPARENCY_CACHE_S, transparency } from './transparency';
import { asScope, hiveBoard, hiveDaily, hiveHistory, hiveToken, smartTrades, smartTraders } from './hive';
import { hiveSignals, pendingSignals, PUBLIC_DELAY } from './signals-hive';
import { BurnsNotReady, ovhiveBurns } from './burns';
import { devWallet } from './dev-wallet';

type Ctx = { Bindings: Env; Variables: { sql: Sql } };

export const api = new Hono<Ctx>();

// Short-lived connections per request (Neon's pooler in production).
api.use('*', async (c, next) => {
  const sql = postgres(dbUrl(c.env), { max: 2, fetch_types: false, prepare: false });
  c.set('sql', sql);
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(sql.end({ timeout: 5 }));
  }
});

/** The RPC URL for best-effort chain refreshes inside reads, or null while the indexer is paused. */
const chainUrl = async (c: { env: Env; var: { sql: Sql } }) => ((await readPause(c.var.sql)).paused ? null : c.env.RPC_URL);

const cache = (seconds: number) => ({ 'cache-control': `public, max-age=${seconds}, s-maxage=${seconds}` });
const addr = (s: string | undefined) => (s ?? '').toLowerCase();

/**
 * A token we have nothing on: ask its hydrator to fetch it from chain (coalesced per token, rate
 * limited) and answer 202 so the page can show "fetching from chain" and follow the socket.
 */
async function hydrating(c: { env: Env; var: { sql: Sql }; json: (b: unknown, s: 202 | 404 | 503) => Response }, token: string) {
  if (!/^0x[0-9a-f]{40}$/.test(token)) return c.json({ error: 'not found' }, 404);
  // Paused: no chain lookups at all (checked here too, so a paused indexer doesn't even wake the hydrator).
  if ((await readPause(c.var.sql)).paused) return c.json(PAUSED_BODY, 503);
  const { state } = await hydrator(c.env, token).hydrate(token);
  if (state === 'paused') return c.json(PAUSED_BODY, 503);
  if (state === 'not_token') return c.json({ error: 'not found' }, 404);
  return c.json({ address: token, state, source: 'chain' }, 202);
}

/** Trenches columns. new / almost (bonding) / migrated, with GMGN-style filters. */
api.get('/tokens', async (c) => {
  const q = (k: string) => c.req.query(k);
  const column = q('column') ?? 'new';
  const tokens = await trenchesList(c.var.sql, {
    column,
    liftfun: liftfunOn(c.env),
    limit: Math.min(Number(q('limit') ?? 50), 100),
    minMcap: Number(q('minMcap') ?? 0),
    maxMcap: Number(q('maxMcap') ?? 1e15),
    maxAgeMin: Number(q('maxAgeMin') ?? 7 * 24 * 60),
    minHolders: Number(q('minHolders') ?? 0),
    launchpad: q('launchpad') ?? null,
    hideHighRisk: q('hideHighRisk') === '1',
    showSpam: q('showSpam') === '1',
    showPlain: q('plain') === '1',
    showDust: q('dust') === '1',
  });
  return c.json({ column, tokens }, 200, cache(2));
});

/** Token page header: summary + full signals + dev record. */
api.get('/tokens/:address', async (c) => {
  const sql = c.var.sql;
  const token = addr(c.req.param('address'));
  const detail = await tokenDetail(sql, token);
  if (!detail) return hydrating(c, token);
  refreshSignalsIfStale(c, token, (detail as { signals_updated_at?: Date | string | null }).signals_updated_at);
  return c.json(detail, 200, cache(2));
});

/** Every pool of a token with its routing key, 24h volume and liquidity (see tokenPools). */
api.get('/tokens/:address/pools', async (c) => {
  const pools = await tokenPools(c.var.sql, await chainUrl(c), addr(c.req.param('address')));
  if (!pools) return c.json({ error: 'not found' }, 404);
  return c.json({ pools }, 200, cache(POOL_TVL_TTL_S));
});

/** 5m/1h/6h/24h windows: price change, volume, buys/sells, buy/sell USD, makers. */
api.get('/tokens/:address/stats', async (c) => {
  const token = addr(c.req.param('address'));
  const stats = await tokenStats(c.var.sql, [token]);
  return c.json(stats.get(token), 200, cache(2));
});

/** The realtime `token:` snapshot (docs/realtime.md), for server rendering. */
api.get('/tokens/:address/snapshot', async (c) => {
  const token = addr(c.req.param('address'));
  const rpcUrl = await chainUrl(c);
  const snap = await tokenSnapshot(c.var.sql, rpcUrl, token);
  if (!snap) return hydrating(c, token);
  if (!snap.trades.length && rpcUrl) c.executionCtx.waitUntil(hydrator(c.env, token).hydrate(token).catch(() => undefined));
  return c.json({ ...snap, state: 'live', source: 'index' }, 200, cache(2));
});

api.get('/tokens/:address/signals', async (c) => {
  const [row] = await c.var.sql`select data, risk_level, verdict, updated_at from signals where token = ${addr(c.req.param('address'))}`;
  return row ? c.json(row, 200, cache(5)) : c.json({ error: 'not found' }, 404);
});

api.get('/tokens/:address/trades', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 100), 500);
  const rows = await c.var.sql`
    select tx, log_index, time, trader, side, token_amount, quote, quote_amount,
      price_usd::float8 as price_usd, usd::float8 as usd
    from swaps where token = ${addr(c.req.param('address'))}
    order by block desc, log_index desc limit ${limit}`;
  return c.json({ trades: rows }, 200, cache(1));
});

/**
 * Holders with tags (dev, sniper, bundler, insider, fresh, airdrop), largest first. Burn addresses, pools
 * (curves, hooks, the PoolManager) and contracts are listed too, tagged `burn` / `pool` / `contract` with
 * `excluded: true`: they don't count in top-10 or other concentration signals.
 */
api.get('/tokens/:address/holders', async (c) => {
  const sql = c.var.sql;
  const token = addr(c.req.param('address'));
  const loaded = await loadSnapshot(sql, token, null);
  if (!loaded) return c.json({ error: 'not found' }, 404);
  const { snapshot, excluded } = loaded;
  const tags = tagHolders(snapshot);
  // Shares of circulating supply (as signals and GMGN/DexScreener); burn addresses as % of totalSupply.
  const supply = Number(circulatingSupply(snapshot));
  const onChain = Number(snapshot.totalSupply);
  const holders = [
    ...snapshot.holders.map((h) => ({
      wallet: h.wallet,
      amount: h.amount,
      tags: (tags[h.wallet] ?? []) as string[],
      excluded: false,
      funder: snapshot.wallets[h.wallet]?.firstFunder ?? null,
    })),
    ...excluded.map((h) => ({ wallet: h.wallet, amount: h.amount, tags: [h.kind] as string[], excluded: true, funder: null })),
  ]
    .sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0))
    .map((h) => {
      const of = h.tags[0] === 'burn' ? onChain : supply;
      return { ...h, amount: h.amount.toString(), pct: of ? (Number(h.amount) / of) * 100 : 0 };
    });
  return c.json({ holders, total: snapshot.holderCount }, 200, cache(5));
});

/**
 * Holder count over time: the token's transfers replayed in chain order, sampled every hour (the
 * last point is now). Burn and zero addresses don't count as holders. Small tokens only (≤ 50k transfers).
 */
const holderSeriesCache = new Map<string, { at: number; body: unknown }>();
api.get('/tokens/:address/holders/history', async (c) => {
  const sql = c.var.sql;
  const token = addr(c.req.param('address'));
  const hit = holderSeriesCache.get(token);
  if (hit && Date.now() - hit.at < 60_000) return c.json(hit.body, 200, cache(60));
  const [n] = await sql<{ n: number }[]>`select count(*)::int as n from transfers where token = ${token}`;
  if (!n?.n) return c.json({ points: [], now: 0, change24h: 0 }, 200, cache(60));
  if (n.n > 50_000) return c.json({ error: 'too many transfers' }, 400);
  const rows = await sql<{ from: string; to: string; amount: string; time: Date }[]>`
    select "from", "to", amount::text as amount, time from transfers where token = ${token} order by block, log_index`;
  const skip = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);
  const bal = new Map<string, bigint>();
  let count = 0;
  const move = (w: string, d: bigint) => {
    if (skip.has(w)) return;
    const before = bal.get(w) ?? 0n;
    const after = before + d;
    bal.set(w, after);
    if (before <= 0n && after > 0n) count++;
    else if (before > 0n && after <= 0n) count--;
  };
  const HOUR = 3_600_000;
  const points: { t: string; holders: number }[] = [];
  // Some backfilled transfers carry no timestamp (epoch 0): they take the previous transfer's time.
  const first = rows.find((r) => r.time.getTime() > 1_600_000_000_000);
  if (!first) return c.json({ points: [], now: 0, change24h: 0 }, 200, cache(60));
  let bucket = Math.floor(first.time.getTime() / HOUR) * HOUR;
  let last = first.time.getTime();
  for (const r of rows) {
    const t = Math.max(r.time.getTime(), last);
    last = t;
    while (t >= bucket + HOUR) {
      points.push({ t: new Date(bucket + HOUR).toISOString(), holders: count });
      bucket += HOUR;
    }
    const v = BigInt(r.amount);
    move(r.from, -v);
    move(r.to, v);
  }
  const now = Date.now();
  while (bucket + HOUR < now) {
    points.push({ t: new Date(bucket + HOUR).toISOString(), holders: count });
    bucket += HOUR;
  }
  points.push({ t: new Date(now).toISOString(), holders: count });
  const dayAgo = [...points].reverse().find((p) => Date.parse(p.t) <= now - 24 * HOUR);
  const body = { points, now: count, change24h: dayAgo ? count - dayAgo.holders : count };
  holderSeriesCache.set(token, { at: Date.now(), body });
  return c.json(body, 200, cache(60));
});

/** OHLCV. 1m is stored (5m/15m/1h/4h aggregated from it); 1s/15s/30s come from trades (last 24h). */
api.get('/tokens/:address/candles', async (c) => {
  const token = addr(c.req.param('address'));
  const iv = c.req.query('interval') ?? '1m';
  const hours = Math.min(Number(c.req.query('hours') ?? 24), 24 * 7);
  const sub: Record<string, number> = { '1s': 1, '15s': 15, '30s': 30 };
  if (sub[iv]) {
    // Default windows keep responses small: 1s → 1h, 15s/30s → 6h (max 24h).
    const minutes = Math.min(Number(c.req.query('minutes') ?? (iv === '1s' ? 60 : 360)), 24 * 60);
    return c.json({ candles: await subMinuteCandles(c.var.sql, token, sub[iv], minutes) }, 200, cache(1));
  }
  const intervals: Record<string, string> = { '1m': '1 minute', '5m': '5 minutes', '15m': '15 minutes', '1h': '1 hour', '4h': '4 hours' };
  return c.json({ candles: await minuteCandles(c.var.sql, token, intervals[iv] ?? '1 minute', hours) }, 200, cache(2));
});

/**
 * Bubble map: top holders as nodes, linked when they share a funder, one funded the other,
 * or they sent the token to each other.
 */
api.get('/tokens/:address/bubblemap', async (c) => {
  const sql = c.var.sql;
  const token = addr(c.req.param('address'));
  const loaded = await loadSnapshot(sql, token, null);
  if (!loaded) return c.json({ error: 'not found' }, 404);
  const { snapshot } = loaded;
  const tags = tagHolders(snapshot);
  const supply = Number(circulatingSupply(snapshot));
  const nodes = snapshot.holders.slice(0, 60).map((h) => ({
    wallet: h.wallet,
    pct: supply ? (Number(h.amount) / supply) * 100 : 0,
    tags: tags[h.wallet] ?? [],
    funder: snapshot.wallets[h.wallet]?.firstFunder ?? null,
  }));
  const ids = new Set(nodes.map((n) => n.wallet));
  const edges: { a: string; b: string; kind: 'shared-funder' | 'funded' | 'transfer' }[] = [];
  const byFunder = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.funder) continue;
    if (ids.has(n.funder)) edges.push({ a: n.funder, b: n.wallet, kind: 'funded' });
    const group = byFunder.get(n.funder) ?? [];
    group.push(n.wallet);
    byFunder.set(n.funder, group);
  }
  for (const group of byFunder.values()) for (let i = 1; i < group.length; i++) edges.push({ a: group[0]!, b: group[i]!, kind: 'shared-funder' });
  const wallets = [...ids];
  const moves = await sql<{ from: string; to: string }[]>`
    select distinct "from", "to" from transfers
    where token = ${token} and "from" = any(${wallets}) and "to" = any(${wallets}) and "from" <> "to"`;
  for (const m of moves) edges.push({ a: m.from, b: m.to, kind: 'transfer' });
  const clusters = [...byFunder.entries()]
    .filter(([, w]) => w.length > 1)
    .map(([funder, w]) => ({ funder, wallets: w, pct: nodes.filter((n) => w.includes(n.wallet)).reduce((t, n) => t + n.pct, 0) }))
    .sort((a, b) => b.pct - a.pct);
  return c.json({ nodes, edges, clusters }, 200, cache(10));
});

/**
 * A wallet's PnL across every indexed venue: summary (all-time realized/unrealized, realized 24h/7d/30d,
 * volume, win rate) and positions with average cost. The summary refreshes every ~5 min.
 */
api.get('/wallets/:address/pnl', async (c) => {
  const wallet = addr(c.req.param('address'));
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return c.json({ error: 'bad address' }, 400);
  return c.json(await walletPnl(c.var.sql, wallet, page((k) => c.req.query(k))), 200, cache(10));
});

/**
 * What a wallet holds now (from Transfers, not trades), by $ value: amount, decimals, price, value, 24h
 * change, icon, cost basis and PnL where it traded. Paged with ?offset=&limit= (default 200, max 500).
 * Balances of tokens indexed after launch are checked against the chain in the background.
 */
api.get('/wallets/:address/holdings', async (c) => {
  const wallet = addr(c.req.param('address'));
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return c.json({ error: 'bad address' }, 400);
  const out = await walletHoldings(c.var.sql, wallet, page((k) => c.req.query(k), 200));
  if (!(await readPause(c.var.sql)).paused) c.executionCtx.waitUntil(
    (async () => {
      const sql = postgres(dbUrl(c.env), { max: 1, fetch_types: false, prepare: false });
      try { await repairBalances(sql, c.env.RPC_URL, wallet); } catch { /* best effort */ } finally { await sql.end({ timeout: 5 }); }
    })(),
  );
  return c.json(out, 200, cache(10));
});

/** One position: bought, sold, held (actual balance), cost basis, realized and unrealized PnL, plus the trades. */
api.get('/wallets/:address/positions/:token', async (c) => {
  const wallet = addr(c.req.param('address'));
  const token = addr(c.req.param('token'));
  if (!/^0x[0-9a-f]{40}$/.test(wallet) || !/^0x[0-9a-f]{40}$/.test(token)) return c.json({ error: 'bad address' }, 400);
  const out = await walletPosition(c.var.sql, wallet, token);
  if (!out) return c.json({ error: 'not found' }, 404);
  return c.json(out, 200, cache(10));
});

/** Dev page: stats plus every token from the deployer. */
api.get('/dev/:address', async (c) => {
  const sql = c.var.sql;
  const dev = addr(c.req.param('address'));
  const [stats] = await sql`select * from deployer_stats where deployer = ${dev}`;
  const tokens = await sql<{ address: string }[]>`select address from tokens where deployer = ${dev} order by created_at desc limit 100`;
  return c.json({ deployer: dev, stats: stats ?? null, tokens: await tokenSummaries(sql, { addresses: tokens.map((t) => t.address) }) }, 200, cache(10));
});

/** Search by contract, symbol or name. */
api.get('/search', async (c) => {
  const sql = c.var.sql;
  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 2) return c.json({ tokens: [] });
  // Real token first (see search.ts); tokenSummaries doesn't keep order, so restore it.
  const order = await searchTokens(sql, q);
  const cards = await tokenSummaries(sql, { addresses: order });
  const at = new Map(order.map((a, i) => [a, i]));
  cards.sort((x, y) => (at.get(String(x.address)) ?? 99) - (at.get(String(y.address)) ?? 99));
  return c.json({ tokens: cards }, 200, cache(5));
});

/** Treasury, platform fees and (after $OVERMIND) buybacks, for the public Transparency page (transparency.ts). */
api.get('/transparency', async (c) => c.json(
    await transparency(c.var.sql, [c.env.PUBLIC_RPC_URL ?? ROBINHOOD_CHAIN.publicRpc, ...[await chainUrl(c)].filter((u): u is string => !!u)]),
    200, cache(TRANSPARENCY_CACHE_S)));

/** Overmind Consensus: the hive board, and one token's view (see hive.ts). */
api.get('/hive', async (c) => c.json(await hiveBoard(c.var.sql, Math.min(Number(c.req.query('limit') ?? 30), 60), asScope(c.req.query('scope'))), 200, cache(20)));
/** $OVHIVE burns: every transfer to the dead or zero address, with the running total (burns.ts). */
api.get('/ovhive/burns', async (c) => {
  try {
    return c.json(await ovhiveBurns(c.env.RPC_URL), 200, cache(60));
  } catch (err) {
    if (err instanceof BurnsNotReady) return c.json({ error: 'not ready' }, 503, { 'cache-control': 'no-store' });
    throw err;
  }
});
/** $OVHIVE dev transparency: the dev wallet's buys, sales, burns and transfers, and the team wallets it funded (dev-wallet.ts). */
api.get('/ovhive/dev', async (c) => c.json(await devWallet(c.var.sql), 200, cache(120)));
/** Hive Daily: the smart set's biggest net buys and sells over the last 24h (board-clean tokens only). */
api.get('/hive/daily', async (c) => c.json(await hiveDaily(c.var.sql, Number(c.req.query('limit') ?? 5), asScope(c.req.query('scope'))), 200, cache(300)));
/** Hive signals (flips of the smart crowd's side), delayed for the public; real time is /v1/hive/signals (Hive Pro). */
api.get('/hive/signals', async (c) =>
  {
  const scope = asScope(c.req.query('scope'));
  return c.json({ delayed: true, delay: PUBLIC_DELAY, scope, pending: await pendingSignals(c.var.sql, scope), signals: await hiveSignals(c.var.sql, { delayed: true, scope }) }, 200, cache(30));
});
/** A token's hive reading over the last day (smart-wallet flow, rebuilt from swaps). Longer ranges are Hive Pro: /v1/hive/:address/history. */
api.get('/hive/:address/history', async (c) =>
  c.json({ points: await hiveHistory(c.var.sql, addr(c.req.param('address')), 1) }, 200, cache(60)));
/** The smart set's buys and sells on a token (time, side, size; no wallets), for marks on the chart. */
api.get('/hive/:address/trades', async (c) =>
  c.json({ trades: await smartTrades(c.var.sql, addr(c.req.param('address')), Number(c.req.query('days') ?? 7) || 7) }, 200, cache(30)));
api.get('/hive/:address', async (c) => c.json({ consensus: await hiveToken(c.var.sql, addr(c.req.param('address'))) }, 200, cache(20)));
/** The top traders: the smart set with each wallet's best token and current holdings (see hive.ts). */
api.get('/traders', async (c) => c.json(await smartTraders(c.var.sql, Math.min(Number(c.req.query('limit') ?? 100) || 100, 300)), 200, cache(60)));

/** Headline numbers for the landing page. */
api.get('/stats', async (c) => {
  const [row] = await c.var.sql`
    select (select count(*)::int from tokens) as tokens_tracked,
      (select count(*)::int from tokens where created_at > now() - interval '24 hours') as launches_24h,
      (select count(*)::int from signals) as safety_checks,
      (select count(*)::int from signals where risk_level = 'high') as flagged_high_risk,
      (select count(*)::int from swaps where time > now() - interval '24 hours') as trades_24h`;
  return c.json(row, 200, cache(30));
});

