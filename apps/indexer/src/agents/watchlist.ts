// Watchlist and hive alerts (/v1/me/watchlist, /v1/me/alerts). Starring a token records the hive's
// current reading as a baseline; the cron (watch.ts) alerts when that reading flips.
import { Hono } from 'hono';
import { fail, isAddr, limit, PRIVATE, requireMember, type C, type Ctx } from './http';
import { baseline } from '../watch';

/** Tokens one member can star. */
const MAX_WATCHED = 100;
const ALERTS_PAGE = 30;

export const watchlist = new Hono<Ctx>();

function tokenParam(c: C): string {
  const a = (c.req.param('address') ?? '').toLowerCase();
  if (!isAddr(a)) throw fail(422, 'invalid_address', 'Expected a token address (0x + 40 hex).');
  return a;
}

/** My starred tokens, newest first, with the hive's last reading of each. */
watchlist.get('/me/watchlist', async (c) => {
  const me = requireMember(c);
  const rows = await c.var.sql<{
    token: string; created_at: Date; symbol: string | null; name: string | null; image_url: string | null;
    market_cap_usd: number | null; side: string | null; score: number | null; voters: number | null; updated_at: Date | null;
  }[]>`
    select w.token, w.created_at, t.symbol, t.name, t.image_url, t.market_cap_usd::float8 as market_cap_usd,
      s.side, s.score, s.voters, s.updated_at
    from watchlist w
    left join tokens t on t.address = w.token
    left join hive_watch_state s on s.token = w.token
    where w.member_id = ${me.id}
    order by w.created_at desc`;
  const items = rows.map((r) => ({
    token: { address: r.token, symbol: r.symbol, name: r.name, imageUrl: r.image_url, marketCapUsd: r.market_cap_usd },
    hive: r.side ? { side: r.side, score: r.score, voters: r.voters ?? 0, at: r.updated_at } : null,
    starredAt: r.created_at,
  }));
  return c.json({ items, max: MAX_WATCHED }, 200, PRIVATE);
});

/** Is this token starred? For the star button on a token page. */
watchlist.get('/me/watchlist/:address', async (c) => {
  const me = requireMember(c);
  const token = tokenParam(c);
  const [row] = await c.var.sql`select 1 from watchlist where member_id = ${me.id} and token = ${token}`;
  return c.json({ token, watching: !!row }, 200, PRIVATE);
});

watchlist.post('/me/watchlist/:address', async (c) => {
  const me = requireMember(c, { scope: 'post' });
  await limit(c, 'write');
  const token = tokenParam(c);
  const sql = c.var.sql;
  const [known] = await sql`select 1 from tokens where address = ${token}`;
  if (!known) throw fail(404, 'unknown_token', 'Overmind does not index this token.');
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from watchlist where member_id = ${me.id}`;
  const n = count?.n ?? 0;
  const [already] = await sql`select 1 from watchlist where member_id = ${me.id} and token = ${token}`;
  if (!already && n >= MAX_WATCHED) throw fail(422, 'watchlist_full', `A watchlist holds up to ${MAX_WATCHED} tokens.`);
  await sql`insert into watchlist (member_id, token) values (${me.id}, ${token}) on conflict do nothing`;
  // The first star of a token sets the baseline its next flip is measured against.
  await baseline(sql, token).catch((err) => console.error('watch baseline failed', token, err));
  return c.json({ token, watching: true }, 200, PRIVATE);
});

watchlist.delete('/me/watchlist/:address', async (c) => {
  const me = requireMember(c, { scope: 'post' });
  await limit(c, 'write');
  const token = tokenParam(c);
  await c.var.sql`delete from watchlist where member_id = ${me.id} and token = ${token}`;
  return c.json({ token, watching: false }, 200, PRIVATE);
});

/** My hive alerts, newest first, and how many are unread. */
watchlist.get('/me/alerts', async (c) => {
  const me = requireMember(c);
  const sql = c.var.sql;
  const rows = await sql<{
    id: string; token: string; side: string; score: number | null; prev_side: string | null; prev_score: number | null;
    created_at: Date; read_at: Date | null; symbol: string | null; image_url: string | null;
  }[]>`
    select a.id, a.token, a.side, a.score, a.prev_side, a.prev_score, a.created_at, a.read_at, t.symbol, t.image_url
    from hive_alerts a left join tokens t on t.address = a.token
    where a.member_id = ${me.id}
    order by a.created_at desc limit ${ALERTS_PAGE}`;
  const [unreadRow] = await sql<{ unread: number }[]>`
    select count(*)::int as unread from hive_alerts where member_id = ${me.id} and read_at is null`;
  const items = rows.map((r) => ({
    id: r.id,
    token: { address: r.token, symbol: r.symbol, imageUrl: r.image_url },
    side: r.side,
    score: r.score,
    from: { side: r.prev_side, score: r.prev_score },
    createdAt: r.created_at,
    read: !!r.read_at,
  }));
  return c.json({ items, unread: unreadRow?.unread ?? 0 }, 200, PRIVATE);
});

/** Mark every alert read. */
watchlist.post('/me/alerts/read', async (c) => {
  const me = requireMember(c);
  await limit(c, 'write');
  await c.var.sql`update hive_alerts set read_at = now() where member_id = ${me.id} and read_at is null`;
  return c.json({ unread: 0 }, 200, PRIVATE);
});
