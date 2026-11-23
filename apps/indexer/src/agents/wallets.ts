// Followed wallets (Hive Pro): /v1/me/wallets. Following is for $OVHIVE holders over the Pro threshold;
// unfollowing and listing work for everyone, so a member who sold can still clean up. The alerts
// themselves come from the cron (wallet-watch.ts) and show in /v1/me/alerts next to the hive alerts.
import { Hono } from 'hono';
import { fail, isAddr, limit, PRIVATE, requireMember, type C, type Ctx } from './http';
import { proStatus } from './pro';

/** Wallets one member can follow. */
export const MAX_WALLETS = 25;

export const wallets = new Hono<Ctx>();

function walletParam(c: C): string {
  const a = (c.req.param('address') ?? '').toLowerCase();
  if (!isAddr(a)) throw fail(422, 'invalid_address', 'Expected a wallet address (0x + 40 hex).');
  return a;
}

/** My followed wallets, newest first. */
wallets.get('/me/wallets', async (c) => {
  const me = requireMember(c);
  const rows = await c.var.sql<{ wallet: string; label: string | null; created_at: Date; last_at: Date | null }[]>`
    select w.wallet, w.label, w.created_at,
      (select max(a.at) from wallet_alerts a where a.member_id = w.member_id and a.wallet = w.wallet) as last_at
    from wallet_watch w where w.member_id = ${me.id} order by w.created_at desc`;
  return c.json({ items: rows.map((r) => ({ wallet: r.wallet, label: r.label, since: r.created_at, lastAlertAt: r.last_at })), max: MAX_WALLETS }, 200, PRIVATE);
});

/** Follow a wallet (Hive Pro). Body: { label? } */
wallets.post('/me/wallets/:address', async (c) => {
  const me = requireMember(c, { scope: 'post' });
  await limit(c, 'write');
  const wallet = walletParam(c);
  const s = await proStatus(c);
  if (!s.pro) throw fail(403, 'pro_required', `Hold ${s.threshold.toLocaleString('en-US')} $OVHIVE to follow wallets.`);
  const b = (c.var.body ?? {}) as { label?: unknown };
  const label = typeof b.label === 'string' ? b.label.trim().slice(0, 40) || null : null;
  const sql = c.var.sql;
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from wallet_watch where member_id = ${me.id}`;
  const [already] = await sql`select 1 from wallet_watch where member_id = ${me.id} and wallet = ${wallet}`;
  if (!already && (count?.n ?? 0) >= MAX_WALLETS) throw fail(422, 'wallets_full', `You can follow up to ${MAX_WALLETS} wallets.`);
  await sql`
    insert into wallet_watch (member_id, wallet, label) values (${me.id}, ${wallet}, ${label})
    on conflict (member_id, wallet) do update set label = coalesce(excluded.label, wallet_watch.label)`;
  return c.json({ wallet, following: true, label }, 200, PRIVATE);
});

wallets.delete('/me/wallets/:address', async (c) => {
  const me = requireMember(c, { scope: 'post' });
  await limit(c, 'write');
  const wallet = walletParam(c);
  await c.var.sql`delete from wallet_watch where member_id = ${me.id} and wallet = ${wallet}`;
  return c.json({ wallet, following: false }, 200, PRIVATE);
});
