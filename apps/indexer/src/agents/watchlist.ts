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
    select (select count(*) from hive_alerts where member_id = ${me.id} and read_at is null)::int
         + (select count(*) from wallet_alerts where member_id = ${me.id} and read_at is null)::int as unread`;
  const hive = rows.map((r) => ({
    id: r.id,
    kind: 'hive' as const,
    token: { address: r.token, symbol: r.symbol, imageUrl: r.image_url },
    side: r.side,
    score: r.score,
    from: { side: r.prev_side, score: r.prev_score },
    createdAt: r.created_at,
    read: !!r.read_at,
  }));
  // Followed-wallet alerts (wallet-watch.ts), merged in by time.
  const wrows = await sql<{
    id: string; wallet: string; label: string | null; kind: string; token: string; amount: string; decimals: number | null; usd: number | null;
    counterparty: string | null; tx: string; at: Date; created_at: Date; read_at: Date | null; symbol: string | null; image_url: string | null;
  }[]>`
    select a.id, a.wallet, w.label, a.kind, a.token, a.amount::text as amount, t.decimals, a.usd::float8 as usd, a.counterparty, a.tx, a.at,
      a.created_at, a.read_at, t.symbol, t.image_url
    from wallet_alerts a
    left join tokens t on t.address = a.token
    left join wallet_watch w on w.member_id = a.member_id and w.wallet = a.wallet
    where a.member_id = ${me.id}
    order by a.created_at desc limit ${ALERTS_PAGE}`;
  const wallet = wrows.map((r) => ({
    id: r.id,
    kind: 'wallet' as const,
    token: { address: r.token, symbol: r.symbol, imageUrl: r.image_url },
    wallet: { address: r.wallet, label: r.label },
    action: r.kind,
    amount: r.kind === 'coexit' ? Number(r.amount) : Number(BigInt(r.amount) / 10n ** BigInt(Math.max((r.decimals ?? 18) - 6, 0))) / 1e6,
    usd: r.usd,
    counterparty: r.counterparty,
    tx: r.tx,
    at: r.at,
    createdAt: r.created_at,
    read: !!r.read_at,
  }));
  const items = [...hive, ...wallet]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, ALERTS_PAGE);
  return c.json({ items, unread: unreadRow?.unread ?? 0 }, 200, PRIVATE);
});

// ---- browser push: a member's subscriptions; the overmind-push service sends new alerts to them

/** Push endpoints browsers use (anything else is refused, so the sender only ever calls push services). */
const PUSH_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(googleapis\.com|mozilla\.com|mozaws\.net|windows\.com|notify\.windows\.com|push\.apple\.com)\//i;
const MAX_SUBS = 10;

/** `{ endpoint, keys: { p256dh, auth } }`, the browser's PushSubscription as JSON. */
watchlist.post('/me/push', async (c) => {
  const me = requireMember(c);
  await limit(c, 'write');
  const b = (c.var.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof b.endpoint === 'string' ? b.endpoint : '';
  const p256dh = typeof b.keys?.p256dh === 'string' ? b.keys.p256dh : '';
  const auth = typeof b.keys?.auth === 'string' ? b.keys.auth : '';
  if (!PUSH_HOSTS.test(endpoint) || endpoint.length > 1000) throw fail(422, 'invalid_endpoint', 'Not a browser push endpoint.');
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,64}$/.test(auth)) throw fail(422, 'invalid_keys', 'Bad subscription keys.');
  const sql = c.var.sql;
  await sql`
    insert into push_subscriptions (endpoint, member_id, p256dh, auth) values (${endpoint}, ${me.id}, ${p256dh}, ${auth})
    on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth`;
  // keep the newest few per member
  await sql`
    delete from push_subscriptions where member_id = ${me.id} and endpoint not in (
      select endpoint from push_subscriptions where member_id = ${me.id} order by created_at desc limit ${MAX_SUBS})`;
  return c.json({ push: true }, 200, PRIVATE);
});

watchlist.delete('/me/push', async (c) => {
  const me = requireMember(c);
  await limit(c, 'write');
  const endpoint = c.req.query('endpoint') ?? '';
  await c.var.sql`delete from push_subscriptions where member_id = ${me.id} and endpoint = ${endpoint}`;
  return c.json({ push: false }, 200, PRIVATE);
});

/** Mark every alert read. */
watchlist.post('/me/alerts/read', async (c) => {
  const me = requireMember(c);
  await limit(c, 'write');
  await c.var.sql`update hive_alerts set read_at = now() where member_id = ${me.id} and read_at is null`;
  await c.var.sql`update wallet_alerts set read_at = now() where member_id = ${me.id} and read_at is null`;
  return c.json({ unread: 0 }, 200, PRIVATE);
});
