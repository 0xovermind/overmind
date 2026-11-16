import type { Sql } from 'postgres';

/**
 * Overmind Consensus ("the hive"): what the crowd that has been right is doing with a token right now.
 *
 * Two kinds of voices, one vote each:
 * - Smart wallets: the SMART_SET wallets with the highest realized PnL across indexed trades (bots with
 *   huge trade counts left out). A smart wallet that net-bought a token in the window votes bullish, one
 *   that net-sold votes bearish.
 * - Members (humans and agents): an open bullish or bearish call in the last CALL_WINDOW.
 *
 * score = 100 x (bullish - bearish) / voters, from -100 (the hive is selling) to +100 (the hive is buying).
 * It is a read of public on-chain behaviour and calls, not advice.
 */
const SMART_SET = 300;
const BOT_TRADES = 2000;
const FLOW_WINDOW = '24 hours';
const CALL_WINDOW = '72 hours';

export interface HiveRow {
  token: string;
  symbol: string;
  name: string;
  image_url: string | null;
  status: string;
  market_cap_usd: number | null;
  price_usd: number | null;
  smart_buyers: number;
  smart_sellers: number;
  bullish_calls: number;
  bearish_calls: number;
  voters: number;
  score: number;
}

const rowsFor = async (sql: Sql, token: string | null, minVoters: number, limit: number) => sql<HiveRow[]>`
  with smart as (
    select wallet from positions
    group by wallet
    having sum(realized_usd) > 0 and sum(buys + sells) >= 3 and sum(buys + sells) <= ${BOT_TRADES}
    order by sum(realized_usd) desc
    limit ${SMART_SET}
  ),
  flow as (
    select s.token, s.trader,
      sum(case when s.side = 'buy' then coalesce(s.usd, 0) else -coalesce(s.usd, 0) end) as net
    from swaps s join smart w on w.wallet = s.trader
    where s.time > now() - ${FLOW_WINDOW}::interval
      ${token ? sql`and s.token = ${token}` : sql``}
    group by s.token, s.trader
  ),
  f as (
    select token, count(*) filter (where net > 0)::int as buyers, count(*) filter (where net < 0)::int as sellers
    from flow group by token
  ),
  calls as (
    select token,
      count(*) filter (where stance = 'bullish')::int as bull,
      count(*) filter (where stance = 'bearish')::int as bear
    from callouts
    where created_at > now() - ${CALL_WINDOW}::interval and deleted_at is null and hidden_at is null
      ${token ? sql`and token = ${token}` : sql``}
    group by token
  ),
  j as (
    select coalesce(f.token, calls.token) as token,
      coalesce(f.buyers, 0) as smart_buyers, coalesce(f.sellers, 0) as smart_sellers,
      coalesce(calls.bull, 0) as bullish_calls, coalesce(calls.bear, 0) as bearish_calls
    from f full join calls on calls.token = f.token
  )
  select j.*, (smart_buyers + smart_sellers + bullish_calls + bearish_calls)::int as voters,
    round(100.0 * ((smart_buyers + bullish_calls) - (smart_sellers + bearish_calls))
      / nullif(smart_buyers + smart_sellers + bullish_calls + bearish_calls, 0))::int as score,
    t.symbol, t.name, t.image_url, t.status,
    t.market_cap_usd::float8 as market_cap_usd, t.price_usd::float8 as price_usd
  from j join tokens t on t.address = j.token
  where (smart_buyers + smart_sellers + bullish_calls + bearish_calls) >= ${minVoters}
  order by (smart_buyers + smart_sellers + bullish_calls + bearish_calls) desc, j.token
  limit ${limit}`;

/** The hive board: tokens the smart crowd is most active in, with their consensus score. */
export async function hiveBoard(sql: Sql, limit = 30) {
  const rows = await rowsFor(sql, null, 1, limit);
  const [meta] = await sql<{ smart: number }[]>`
    select count(*)::int as smart from (
      select wallet from positions group by wallet
      having sum(realized_usd) > 0 and sum(buys + sells) >= 3 and sum(buys + sells) <= ${BOT_TRADES}
      limit ${SMART_SET}
    ) s`;
  return { window: FLOW_WINDOW, smart_wallets: meta?.smart ?? 0, tokens: rows };
}

/** One token's consensus (null when nobody in the hive has a view yet). */
export async function hiveToken(sql: Sql, token: string) {
  const [row] = await rowsFor(sql, token, 1, 1);
  return row ?? null;
}
