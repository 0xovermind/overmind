// Hive signals: every 5 minutes, re-read the hive board and record when the smart crowd's side on a
// token changes. Stricter than watchlist alerts (watch.ts): a signal needs a clear lean and enough
// voices, so the feed stays short and worth reading.
//
//   flip  the side moved to buying or selling from the other side or from split
//   new   a token shows up on the board already leaning hard one way, with a big crowd
//
// The price and market cap at the moment of the signal are kept, so the feed can show what the token
// did after it.
import type { Sql } from 'postgres';
import { randomId } from '@overmind/agents/crypto';
import { hiveBoard, type HiveScope } from './hive';

/** |score| at which a signal side counts. */
const SIGNAL_SCORE = 40;
/** Voices needed for a flip, and for a `new` signal (Pons launches are smaller: lower bars). */
const MIN_VOTERS: Record<HiveScope, number> = { all: 5, pons: 3 };
const NEW_MIN_VOTERS: Record<HiveScope, number> = { all: 8, pons: 5 };
/** A token flips at most once per this window (no ping-pong on a noisy crowd). */
const COOLDOWN = '2 hours';
/** Signals visible without Hive Pro after this delay. */
export const PUBLIC_DELAY = '30 minutes';

/**
 * Buying needs a bigger crowd and an older token than selling. Measured on Pons (Nov 21-23): buy signals
 * fired on 3-4 smart wallets, often on tokens under 6 hours old, and 19 of 22 were down a day later;
 * sell signals averaged 16 wallets and 16 of 21 were right. The one buy signal with 5+ wallets on a
 * token older than a day ran +125% in the next 6 hours.
 */
const BUY_MIN_VOTERS: Record<HiveScope, number> = { all: 6, pons: 5 };
const BUY_MIN_AGE_MS = 2 * 3600_000;

type Side = 'buying' | 'selling' | 'split';
const sideOf = (score: number | null, voters: number, scope: HiveScope, createdAt: Date): Side => {
  if (score == null || voters < MIN_VOTERS[scope]) return 'split';
  if (score <= -SIGNAL_SCORE) return 'selling';
  if (score >= SIGNAL_SCORE && voters >= BUY_MIN_VOTERS[scope] && Date.now() - createdAt.getTime() >= BUY_MIN_AGE_MS) return 'buying';
  return 'split';
};

export async function detectHiveSignals(sql: Sql, scope: HiveScope = 'all'): Promise<{ tokens: number; signals: number }> {
  const { tokens: rows } = await hiveBoard(sql, 200, scope);
  if (!rows.length) return { tokens: 0, signals: 0 };
  const prev = new Map(
    (await sql<{ token: string; side: Side; score: number | null }[]>`
      select token, side, score from hive_signal_state where scope = ${scope} and token = any(${rows.map((r) => r.token)}::text[])`).map((p) => [p.token, p]),
  );
  const recent = new Set(
    (await sql<{ token: string }[]>`select distinct token from hive_signals where scope = ${scope} and at > now() - ${COOLDOWN}::interval`).map((r) => r.token),
  );
  let signals = 0;
  for (const r of rows) {
    const side = sideOf(r.score, r.voters, scope, new Date(r.created_at));
    const p = prev.get(r.token);
    let kind: 'flip' | 'new' | null = null;
    if (p) {
      if (side !== 'split' && side !== p.side) kind = 'flip';
    } else if (side !== 'split' && r.voters >= NEW_MIN_VOTERS[scope]) {
      kind = 'new';
    }
    if (kind && !recent.has(r.token)) {
      await sql`
        insert into hive_signals (id, scope, token, kind, side, score, prev_side, prev_score, voters, price_usd, market_cap_usd)
        values (${`hs_${randomId(14)}`}, ${scope}, ${r.token}, ${kind}, ${side}, ${r.score}, ${p?.side ?? null}, ${p?.score ?? null},
          ${r.voters}, ${r.price_usd}, ${r.market_cap_usd})`;
      signals++;
    }
    await sql`
      insert into hive_signal_state (scope, token, side, score, voters, updated_at)
      values (${scope}, ${r.token}, ${side}, ${r.score}, ${r.voters}, now())
      on conflict (scope, token) do update set side = excluded.side, score = excluded.score, voters = excluded.voters, updated_at = now()`;
  }
  return { tokens: rows.length, signals };
}

export interface HiveSignal {
  id: string; token: string; kind: string; side: string; score: number; prev_side: string | null; prev_score: number | null;
  voters: number; at: string; price_usd: number | null; market_cap_usd: number | null;
  symbol: string; name: string; image_url: string | null; price_now: number | null; market_cap_now: number | null; score_now: number | null;
}

/** The signal feed, newest first. `delayed`: only signals older than PUBLIC_DELAY (no Hive Pro). */
export async function hiveSignals(sql: Sql, opts: { delayed: boolean; limit?: number; scope?: HiveScope }): Promise<HiveSignal[]> {
  const scope = opts.scope ?? 'all';
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const rows = await sql<(Omit<HiveSignal, 'at'> & { at: Date })[]>`
    select s.id, s.token, s.kind, s.side, s.score, s.prev_side, s.prev_score, s.voters, s.at,
      s.price_usd::float8 as price_usd, s.market_cap_usd::float8 as market_cap_usd,
      t.symbol, t.name, t.image_url, t.price_usd::float8 as price_now, t.market_cap_usd::float8 as market_cap_now,
      st.score as score_now
    from hive_signals s
    join tokens t on t.address = s.token
    left join hive_signal_state st on st.token = s.token and st.scope = s.scope
    where s.scope = ${scope} and s.at > now() - interval '7 days'
      ${opts.delayed ? sql`and s.at < now() - ${PUBLIC_DELAY}::interval` : sql``}
    order by s.at desc
    limit ${limit}`;
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
}

/** How many signals Hive Pro sees that the public feed doesn't yet. */
export async function pendingSignals(sql: Sql, scope: HiveScope = 'all'): Promise<number> {
  const [r] = await sql<{ n: number }[]>`select count(*)::int as n from hive_signals where scope = ${scope} and at >= now() - ${PUBLIC_DELAY}::interval`;
  return r?.n ?? 0;
}
