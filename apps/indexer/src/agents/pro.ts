// Hive Pro: holders of $OVHIVE unlock the longer hive history (7D/30D) and other pro reads.
// Holdings are summed over every Ethereum wallet on the signed-in Privy account (the embedded wallet
// plus any external wallet the user signed in with or linked), read on chain and cached briefly.
import { Hono } from 'hono';
import { Rpc } from '../rpc';
import { asScope, hiveHistory } from '../hive';
import { hiveSignals } from '../signals-hive';
import { fail, privyProfile, type Ctx, type C } from './http';

export const OVHIVE = '0x53d38ba0c217cd4d1f74a36503731023fcd7f358';
/** Default threshold in whole tokens; PRO_MIN_OVHIVE overrides it. */
const DEFAULT_MIN = 1_000_000;
const CACHE_MS = 5 * 60_000;

export interface ProStatus { pro: boolean; balance: number; threshold: number; wallets: number; token: string }

const cache = new Map<string, { at: number; v: ProStatus }>();

/** Holder badge tiers by whole $OVHIVE held (shown next to a member's name on calls and profiles). */
export type OvhiveTier = 'holder' | 'bee' | 'pro' | 'queen';
export const TIER_MIN: Record<OvhiveTier, number> = { holder: 1, bee: 100_000, pro: 1_000_000, queen: 10_000_000 };
export function ovhiveTier(amount: number | null | undefined): OvhiveTier | null {
  const a = Number(amount ?? 0);
  return a >= TIER_MIN.queen ? 'queen' : a >= TIER_MIN.pro ? 'pro' : a >= TIER_MIN.bee ? 'bee' : a >= TIER_MIN.holder ? 'holder' : null;
}
/**
 * SQL for a member's whole $OVHIVE (alias `m`): the larger of the indexed balance of their member
 * wallet and the sum over all their linked wallets saved at their last Hive Pro check.
 */
export const OVHIVE_AMOUNT_SQL = `greatest(
  coalesce((select b.amount from balances b where b.token = '${OVHIVE}' and b.wallet = lower(m.wallet)), 0) / 1e18,
  coalesce(m.ovhive_balance, 0))::float8`;

const threshold = (c: C) => {
  const n = Number((c.env as { PRO_MIN_OVHIVE?: string }).PRO_MIN_OVHIVE);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MIN;
};

/** The signed-in human's Hive Pro status. Throws 401 when there is no Privy session. */
export async function proStatus(c: C): Promise<ProStatus> {
  const did = c.var.viewer.privyDid;
  if (!did) throw fail(401, 'unauthorized', 'Sign in to check Hive Pro.');
  const hit = cache.get(did);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.v;
  const profile = await privyProfile(c, did);
  const wallets = profile.wallets.slice(0, 10);
  const raw = wallets.length ? await new Rpc(c.env.RPC_URL).balances(wallets.map((holder) => ({ token: OVHIVE, holder }))) : [];
  const balance = raw.reduce<number>((s, b) => s + (b ? Number(b / 10n ** 12n) / 1e6 : 0), 0);
  const min = threshold(c);
  const v: ProStatus = { pro: balance >= min, balance: Math.floor(balance), threshold: min, wallets: wallets.length, token: OVHIVE };
  cache.set(did, { at: Date.now(), v });
  if (cache.size > 5000) cache.clear();
  // Kept on the member for the holder badge (covers linked wallets the indexer can't tie to them).
  const memberId = c.var.viewer.member?.id;
  if (memberId) {
    await c.var.sql`update members set ovhive_balance = ${v.balance}, ovhive_checked_at = now() where id = ${memberId}`
      .catch((err) => console.error('ovhive balance save failed', err));
  }
  return v;
}

export const pro = new Hono<Ctx>();
const PRIVATE = { 'cache-control': 'private, no-store' };

/** GET /v1/me/pro: { pro, balance, threshold, wallets, token }. ?refresh=1 re-reads balances (after buying). */
pro.get('/me/pro', async (c) => {
  if (c.req.query('refresh') === '1' && c.var.viewer.privyDid) cache.delete(c.var.viewer.privyDid);
  return c.json(await proStatus(c), 200, PRIVATE);
});

/** GET /v1/hive/signals: the hive signal feed in real time (Hive Pro). */
pro.get('/hive/signals', async (c) => {
  const s = await proStatus(c);
  if (!s.pro) throw fail(403, 'pro_required', `Hold ${s.threshold.toLocaleString('en-US')} $OVHIVE for real-time hive signals.`);
  const scope = asScope(c.req.query('scope'));
  return c.json({ delayed: false, scope, signals: await hiveSignals(c.var.sql, { delayed: false, scope }) }, 200, PRIVATE);
});

/** GET /v1/hive/:address/history?days=: 1 day for everyone, 7 and 30 days for Hive Pro. */
pro.get('/hive/:address/history', async (c) => {
  const days = Number(c.req.query('days') ?? 1);
  if (days > 1) {
    const s = await proStatus(c);
    if (!s.pro) throw fail(403, 'pro_required', `Hold ${s.threshold.toLocaleString('en-US')} $OVHIVE to unlock ${days}-day history.`);
  }
  const address = c.req.param('address').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) throw fail(422, 'invalid_address', 'Not a token address.');
  return c.json({ points: await hiveHistory(c.var.sql, address, days) }, 200, PRIVATE);
});
