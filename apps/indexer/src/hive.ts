import type { Sql } from 'postgres';

/**
 * Overmind Consensus ("the hive"): what the crowd that has been right is doing with a token right now.
 *
 * Two kinds of voices, one vote each:
 * - Smart wallets: up to SMART_SET wallets with the highest realized PnL across indexed trades, after
 *   removing the wallets whose profit is not a read of the market:
 *     - bots with huge trade counts (> BOT_TRADES),
 *     - spray snipers that touch more than MAX_TOKENS different tokens,
 *     - launch snipers and insiders: more than MAX_EARLY_SHARE of their buys land in the first
 *       EARLY_WINDOW after a token launched.
 *   A smart wallet that net-bought a token in the window votes in, one that net-sold votes out.
 * - Members (humans and agents): an open bullish or bearish call in the last CALL_WINDOW.
 *
 * score = 100 x (in - out) / voters, from -100 (the hive is selling) to +100 (the hive is buying).
 *
 * The public board only lists tokens worth showing: not high risk, not spam, not a copycat ticker, and
 * at least MIN_AGE old (the first minutes of a launch are snipers, not a view). A single token's reading
 * (the token page) is always computed, whatever its risk, so the page can still show it.
 *
 * It is a read of public on-chain behaviour and calls, not advice.
 */
const SMART_SET = 300;
const BOT_TRADES = 2000;
const MAX_TOKENS = 25;
const MAX_EARLY_SHARE = 0.5;
const EARLY_WINDOW = '2 minutes';
const FLOW_WINDOW = '24 hours';
const CALL_WINDOW = '72 hours';
const MIN_AGE = '30 minutes';
const SMART_TTL_MS = 5 * 60_000;

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

/** The smart set is expensive (it reads every position and swap of the candidates): cached for a few minutes. */
let smartCache: { at: number; wallets: string[] } | null = null;

export async function smartWallets(sql: Sql): Promise<string[]> {
  if (smartCache && Date.now() - smartCache.at < SMART_TTL_MS) return smartCache.wallets;
  const rows = await sql<{ wallet: string }[]>`
    with cand as (
      select wallet, sum(realized_usd) as realized, count(distinct token) as tokens
      from positions
      group by wallet
      having sum(realized_usd) > 0 and sum(buys + sells) >= 3 and sum(buys + sells) <= ${BOT_TRADES}
        and count(distinct token) <= ${MAX_TOKENS}
    ),
    early as (
      select s.trader,
        count(*) filter (where s.side = 'buy')::float8 as buys,
        count(*) filter (where s.side = 'buy' and s.time < t.created_at + ${EARLY_WINDOW}::interval)::float8 as early
      from swaps s
      join cand c on c.wallet = s.trader
      join tokens t on t.address = s.token
      group by s.trader
    )
    select c.wallet
    from cand c
    left join early e on e.trader = c.wallet
    where coalesce(e.early / nullif(e.buys, 0), 0) <= ${MAX_EARLY_SHARE}
    order by c.realized desc
    limit ${SMART_SET}`;
  smartCache = { at: Date.now(), wallets: rows.map((r) => r.wallet) };
  return smartCache.wallets;
}

const rowsFor = async (sql: Sql, token: string | null, minVoters: number, limit: number) => {
  const smart = await smartWallets(sql);
  return sql<HiveRow[]>`
  with flow as (
    select s.token, s.trader,
      sum(case when s.side = 'buy' then coalesce(s.usd, 0) else -coalesce(s.usd, 0) end) as net
    from swaps s
    where s.time > now() - ${FLOW_WINDOW}::interval
      and s.trader = any(${smart}::text[])
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
  from j
  join tokens t on t.address = j.token
  left join signals sg on sg.token = j.token
  where (smart_buyers + smart_sellers + bullish_calls + bearish_calls) >= ${minVoters}
    ${token ? sql`` : sql`
      and t.created_at < now() - ${MIN_AGE}::interval
      and coalesce(sg.risk_level, '') <> 'high'
      and not coalesce((sg.data->>'copycat')::bool, false)
      and not coalesce((sg.data->>'spam')::bool, false)`}
  order by (smart_buyers + smart_sellers + bullish_calls + bearish_calls) desc, j.token
  limit ${limit}`;
};

/** The hive board: tokens the smart crowd is most active in, with their consensus score. */
export async function hiveBoard(sql: Sql, limit = 30) {
  const rows = await rowsFor(sql, null, 2, limit);
  return { window: FLOW_WINDOW, smart_wallets: (await smartWallets(sql)).length, tokens: rows };
}

/** One token's consensus (null when nobody in the hive has a view yet). */
export async function hiveToken(sql: Sql, token: string) {
  const [row] = await rowsFor(sql, token, 1, 1);
  return row ?? null;
}
