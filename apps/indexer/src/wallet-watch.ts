// Wallet alerts (Hive Pro): members follow wallets; every minute the recent swaps and transfers of
// followed wallets become alerts in their bell. A buy or sell is one alert (the swap), and the token
// transfers inside that same transaction are not repeated as in/out. Each (member, wallet, tx, log)
// alerts once, so overlapping windows are harmless; nothing older than the follow itself alerts.
import type { Sql } from 'postgres';
import { randomId } from '@overmind/agents/crypto';

/** How far back each pass looks (covers a missed minute or two and slow inserts). */
const WINDOW_MIN = 15;
/** Transfers worth less than this (when priced) are dust and stay quiet. */
const MIN_USD = 1;
/** Alerts one followed wallet can raise per member per hour. */
const MAX_PER_HOUR = 30;

export async function checkWalletWatch(sql: Sql): Promise<{ wallets: number; alerts: number }> {
  const [w] = await sql<{ n: number }[]>`select count(distinct wallet)::int as n from wallet_watch`;
  if (!w?.n) return { wallets: 0, alerts: 0 };
  const since = sql`now() - make_interval(mins => ${WINDOW_MIN})`;

  // Buys and sells.
  const swaps = await sql<{ member_id: string; wallet: string; side: string; token: string; amount: string; usd: number | null; tx: string; log_index: number; at: Date }[]>`
    select ww.member_id, ww.wallet, s.side, s.token, s.token_amount::text as amount, s.usd::float8 as usd, s.tx, s.log_index, s.time as at
    from wallet_watch ww
    join swaps s on s.trader = ww.wallet and s.time > ${since} and s.time >= ww.created_at`;

  // Plain transfers in and out, minus those that are part of a swap by the same wallet.
  const transfers = await sql<{ member_id: string; wallet: string; kind: 'in' | 'out'; token: string; amount: string; usd: number | null; other: string; tx: string; log_index: number; at: Date }[]>`
    with t as (
      select ww.member_id, ww.wallet, 'out' as kind, x.token, x.amount, x."to" as other, x.tx, x.log_index, x.time
      from wallet_watch ww join transfers x on x."from" = ww.wallet and x.time > ${since} and x.time >= ww.created_at
      union all
      select ww.member_id, ww.wallet, 'in' as kind, x.token, x.amount, x."from" as other, x.tx, x.log_index, x.time
      from wallet_watch ww join transfers x on x."to" = ww.wallet and x.time > ${since} and x.time >= ww.created_at
    )
    select t.member_id, t.wallet, t.kind, t.token, t.amount::text as amount, t.other, t.tx, t.log_index, t.time as at,
      (t.amount / power(10::numeric, coalesce(k.decimals, 18)) * k.price_usd)::float8 as usd
    from t
    left join tokens k on k.address = t.token
    where t.amount > 0
      and not exists (select 1 from swaps s where s.tx = t.tx and s.trader = t.wallet)`;

  // One alert per (tx, token, kind): bots and routers split a trade into many swaps.
  type Move = { member_id: string; wallet: string; kind: string; token: string; amount: bigint; usd: number | null; other: string | null; tx: string; log_index: number; at: Date };
  const merged = new Map<string, Move>();
  const all = [
    ...swaps.map((s) => ({ ...s, kind: s.side === 'sell' ? 'sell' : 'buy', other: null as string | null })),
    ...transfers.filter((t) => t.usd == null || t.usd >= MIN_USD),
  ];
  for (const r of all) {
    const key = `${r.member_id}|${r.wallet}|${r.tx}|${r.token}|${r.kind}`;
    const m = merged.get(key);
    if (!m) merged.set(key, { ...r, amount: BigInt(r.amount) });
    else {
      m.amount += BigInt(r.amount);
      m.usd = m.usd == null && r.usd == null ? null : (m.usd ?? 0) + (r.usd ?? 0);
      m.log_index = Math.min(m.log_index, r.log_index);
    }
  }
  // Per followed wallet: only moves newer than its last alert, at most MAX_PER_HOUR an hour (newest
  // first). Skipped ones are dropped for good, so a bot wallet can't flood the bell.
  const groups = new Map<string, Move[]>();
  for (const m of merged.values()) {
    const g = `${m.member_id}|${m.wallet}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(m);
  }
  const rows: Move[] = [];
  for (const list of groups.values()) {
    const first = list[0]!;
    const [st] = await sql<{ last: Date | null; hour: number }[]>`
      select max(at) as last, count(*) filter (where created_at > now() - interval '1 hour')::int as hour
      from wallet_alerts where member_id = ${first.member_id} and wallet = ${first.wallet}`;
    const budget = Math.max(MAX_PER_HOUR - (st?.hour ?? 0), 0);
    const fresh = list
      .filter((m) => !st?.last || m.at > st.last)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, budget);
    rows.push(...fresh);
  }
  let alerts = 0;
  for (const r of rows) {
    const res = await sql`
      insert into wallet_alerts (id, member_id, wallet, kind, token, amount, usd, counterparty, tx, log_index, at)
      values (${`wa_${randomId(14)}`}, ${r.member_id}, ${r.wallet}, ${r.kind}, ${r.token}, ${r.amount.toString()}, ${r.usd}, ${r.other}, ${r.tx}, ${r.log_index}, ${r.at})
      on conflict on constraint wallet_alerts_once do nothing`;
    alerts += res.count;
  }
  return { wallets: w.n, alerts };
}
