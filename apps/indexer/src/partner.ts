// Partner API (data partners such as RH Radar / Atlas): smart money trade history with anonymous wallet
// IDs, behind a per-partner key. Keys live in PARTNER_KEYS ("name:key,name2:key2", a server secret).
//
//   GET /partner/smart-trades?token=0x…&since=<unix>&limit=<n>
//     Smart money swaps, oldest first, from `since` (default: all history). Without `token`: every token
//     (bulk, for datasets). Page with `since` = the last row's time (rows at the same second may repeat;
//     dedupe on `id`). Each row: id, time, token, symbol, side, usd, mcap_usd (market cap at the trade),
//     wallet (stable anonymous ID), tier (10 / 50 / 300: the wallet's rank band in today's smart set).
//   GET /partner/trending: the same as /hive/trending, under the partner key.
//
// Which wallets are smart stays private: wallet IDs are salted hashes (TRADE_ID_SALT) that can't be
// matched back to an address, and no tx hash is returned.
import { Hono } from 'hono';
import type { Context } from 'hono';
import { asScope, asTrendWindow, hiveTrending, smartSet } from './hive';
import type { Sql } from 'postgres';
import type { Env } from './env';

type Ctx = { Bindings: Env; Variables: { sql: Sql } };

/** Requests per minute per partner key. */
const PER_MIN = 120;
const MAX_ROWS = 5000;

const hits = new Map<string, { min: number; n: number }>();

function partnerOf(c: Context<Ctx>): string | null {
  const raw = c.env.PARTNER_KEYS ?? '';
  const got = (c.req.header('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!got) return null;
  for (const pair of raw.split(',')) {
    const i = pair.indexOf(':');
    if (i <= 0) continue;
    const name = pair.slice(0, i).trim();
    const key = pair.slice(i + 1).trim();
    if (key.length >= 24 && timingSafeEqual(key, got)) return name;
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function overLimit(name: string): boolean {
  const min = Math.floor(Date.now() / 60_000);
  const h = hits.get(name);
  if (!h || h.min !== min) {
    hits.set(name, { min, n: 1 });
    return false;
  }
  h.n++;
  return h.n > PER_MIN;
}

const PRIVATE = { 'cache-control': 'private, no-store' };

export const partner = new Hono<Ctx>();

partner.use('*', async (c, next) => {
  const name = partnerOf(c);
  if (!name) return c.json({ error: 'unauthorized', message: 'Partner key required (Authorization: Bearer <key>).' }, 401, PRIVATE);
  if (overLimit(name)) return c.json({ error: 'rate_limited', message: `Up to ${PER_MIN} requests per minute.` }, 429, { ...PRIVATE, 'retry-after': '60' });
  await next();
});

partner.get('/trending', async (c) =>
  c.json(await hiveTrending(c.var.sql, asTrendWindow(c.req.query('window')), Number(c.req.query('limit') ?? 60) || 60, asScope(c.req.query('scope'))), 200, PRIVATE),
);

partner.get('/smart-trades', async (c) => {
  const sql = c.var.sql;
  const tokenQ = (c.req.query('token') ?? '').toLowerCase();
  if (tokenQ && !/^0x[0-9a-f]{40}$/.test(tokenQ)) return c.json({ error: 'bad_token' }, 400, PRIVATE);
  const since = Math.max(0, Number(c.req.query('since') ?? 0) || 0);
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 1000) || 1000, 1), MAX_ROWS);
  const salt = c.env.TRADE_ID_SALT ?? '';

  // Both smart sets (chain-wide and Pons); a wallet's tier is its best rank band in either.
  const [all, pons] = await Promise.all([smartSet(sql, 'all'), smartSet(sql, 'pons')]);
  const rank = new Map<string, number>();
  for (const set of [all, pons]) set.forEach((w, i) => rank.set(w.wallet, Math.min(rank.get(w.wallet) ?? Infinity, i + 1)));
  const wallets = [...rank.keys()];
  if (!wallets.length) return c.json({ smart_wallets: 0, trades: [], next_since: null }, 200, PRIVATE);

  const rows = await sql<{ id: string; time: number; token: string; symbol: string | null; side: 'buy' | 'sell'; usd: number | null; mcap_usd: number | null; trader: string; wallet: string }[]>`
    select left(md5(${salt} || s.tx || ':' || s.log_index::text), 20) as id,
      extract(epoch from s.time)::int as time, s.token, t.symbol, s.side, s.usd::float8 as usd,
      case when t.price_usd > 0 and s.price_usd > 0 then (s.price_usd * (t.market_cap_usd / t.price_usd))::float8 end as mcap_usd,
      s.trader, left(md5(${salt} || 'wallet:' || s.trader), 16) as wallet
    from swaps s
    join tokens t on t.address = s.token
    where s.trader = any(${wallets}::text[])
      and s.time >= to_timestamp(${since}) and s.time > '2000-01-01'
      ${tokenQ ? sql`and s.token = ${tokenQ}` : sql``}
    order by s.time, s.tx, s.log_index
    limit ${limit}`;

  const band = (r: number) => (r <= 10 ? 10 : r <= 50 ? 50 : 300);
  const trades = rows.map((r) => ({
    id: r.id,
    time: Number(r.time),
    token: r.token,
    symbol: r.symbol,
    side: r.side,
    usd: r.usd == null ? null : Math.round(Number(r.usd) * 100) / 100,
    mcap_usd: r.mcap_usd == null ? null : Math.round(Number(r.mcap_usd)),
    wallet: r.wallet,
    tier: band(rank.get(r.trader) ?? 300),
  }));
  return c.json(
    {
      smart_wallets: wallets.length,
      trades,
      // Page on: pass this as `since` (rows sharing that second can repeat; dedupe on id).
      next_since: trades.length === limit ? (trades.at(-1)?.time ?? null) : null,
    },
    200,
    PRIVATE,
  );
});
