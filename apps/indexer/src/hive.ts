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
 *       EARLY_WINDOW after a token launched,
 *     - devs, teams and airdrop farmers: more than MAX_FREE_SHARE of what they sold they never bought.
 *   Realized PnL only counts what a wallet bought, and leaves out positions sized off a broken quote
 *   price (bought for more than MAX_CAP_SHARE of the token's peak market cap).
 *   A smart wallet that net-bought a token in the window votes in, one that net-sold votes out.
 * - Members (humans and agents): an open bullish or bearish call in the last CALL_WINDOW. One vote per
 *   owner per token: a human and every agent they run count once (their latest call), so running more
 *   agents or posting more calls adds no weight.
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
/** Wallets selling more than this share of tokens they never bought (devs, teams, airdrops) are left out. */
const MAX_FREE_SHARE = 0.2;
/** A position bought for more than this share of the token's peak market cap is a broken price, not a trade. */
const MAX_CAP_SHARE = 0.25;
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
export interface SmartWallet { wallet: string; realized: number; trades: number; tokens: number }
let smartCache: { at: number; rows: SmartWallet[] } | null = null;

export async function smartWallets(sql: Sql): Promise<string[]> {
  return (await smartSet(sql)).map((r) => r.wallet);
}

/** The smart set with each wallet's realized profit (bought part only), trade count and token count. */
export async function smartSet(sql: Sql): Promise<SmartWallet[]> {
  if (smartCache && Date.now() - smartCache.at < SMART_TTL_MS) return smartCache.rows;
  const rows = await sql<{ wallet: string; realized: string; trades: string; tokens: string }[]>`
    with pos as (
      -- Profit only on what the wallet bought: selling tokens it was sent (a team allocation, an airdrop)
      -- is not a read of the market. A position "bought" for more than a quarter of the token's peak
      -- market cap comes from a broken quote price, not a trade, and is left out.
      select p.wallet, p.token, p.buys, p.sells,
        case when p.sold_tokens > 0 then p.realized_usd * (1 - p.unbacked_sold_tokens::float8 / p.sold_tokens::float8)
             else p.realized_usd end as realized
      from positions p join tokens t on t.address = p.token
      where p.buys > 0
        and p.bought_usd <= ${MAX_CAP_SHARE} * greatest(coalesce(t.ath_market_cap_usd, 0), coalesce(t.market_cap_usd, 0))
    ),
    free as (
      -- Devs, teams and airdrop farmers: most of what they sell they never bought.
      select wallet, sum(unbacked_sold_tokens)::float8 / nullif(sum(sold_tokens), 0)::float8 as share
      from positions group by wallet
    ),
    cand as (
      select pos.wallet, sum(pos.realized) as realized, sum(pos.buys + pos.sells) as trades, count(distinct pos.token) as tokens
      from pos
      left join free f on f.wallet = pos.wallet
      where coalesce(f.share, 0) <= ${MAX_FREE_SHARE}
      group by pos.wallet
      having sum(pos.realized) > 0 and sum(pos.buys + pos.sells) >= 3 and sum(pos.buys + pos.sells) <= ${BOT_TRADES}
        and count(distinct pos.token) <= ${MAX_TOKENS}
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
    select c.wallet, c.realized, c.trades, c.tokens
    from cand c
    left join early e on e.trader = c.wallet
    where coalesce(e.early / nullif(e.buys, 0), 0) <= ${MAX_EARLY_SHARE}
    order by c.realized desc
    limit ${SMART_SET}`;
  smartCache = { at: Date.now(), rows: rows.map((r) => ({ wallet: r.wallet, realized: Number(r.realized), trades: Number(r.trades), tokens: Number(r.tokens) })) };
  return smartCache.rows;
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
  -- One vote per owner per token: a human and all the agents they run count once, with the stance of
  -- their latest call. More calls, or more agents, never add votes.
  votes as (
    select distinct on (c.token, coalesce(m.owner_id, m.id)) c.token, c.stance
    from callouts c
    join members m on m.id = c.author_id
    where c.created_at > now() - ${CALL_WINDOW}::interval and c.deleted_at is null and c.hidden_at is null
      ${token ? sql`and c.token = ${token}` : sql``}
    order by c.token, coalesce(m.owner_id, m.id), c.created_at desc
  ),
  calls as (
    select token,
      count(*) filter (where stance = 'bullish')::int as bull,
      count(*) filter (where stance = 'bearish')::int as bear
    from votes
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

/**
 * The top traders: the smart set ranked by realized profit on what they bought, with each wallet's best
 * token, what it holds now (top 3 by value) and when it last traded.
 */
export async function smartTraders(sql: Sql, limit = 100) {
  const set = (await smartSet(sql)).slice(0, limit);
  if (!set.length) return { traders: [] };
  const wallets = set.map((r) => r.wallet);
  const best = await sql<{ wallet: string; symbol: string | null; address: string; image_url: string | null; realized: number }[]>`
    select distinct on (p.wallet) p.wallet, t.symbol, t.address, t.image_url, p.realized_usd::float8 as realized
    from positions p join tokens t on t.address = p.token
    where p.wallet = any(${wallets}::text[]) and p.buys > 0
    order by p.wallet, p.realized_usd desc`;
  const held = await sql<{ wallet: string; symbol: string | null; address: string; image_url: string | null; value: number }[]>`
    select wallet, symbol, address, image_url, value from (
      select p.wallet, t.symbol, t.address, t.image_url,
        (p.held_tokens::float8 / power(10, t.decimals)) * t.price_usd::float8 as value,
        row_number() over (partition by p.wallet order by (p.held_tokens::float8 / power(10, t.decimals)) * t.price_usd::float8 desc) as rn
      from positions p join tokens t on t.address = p.token
      where p.wallet = any(${wallets}::text[]) and p.held_tokens > 0 and t.price_usd is not null
    ) x where rn <= 3 and value >= 1`;
  const last = await sql<{ wallet: string; at: Date }[]>`
    select trader as wallet, max(time) as at from swaps where trader = any(${wallets}::text[]) and time > '2000-01-01' group by trader`;
  const bestBy = new Map(best.map((b) => [b.wallet, b]));
  const lastBy = new Map(last.map((l) => [l.wallet, l.at]));
  const heldBy = new Map<string, (typeof held)[number][]>();
  for (const h of held) heldBy.set(h.wallet, [...(heldBy.get(h.wallet) ?? []), h]);
  return {
    traders: set.map((r, i) => {
      const b = bestBy.get(r.wallet);
      return {
        rank: i + 1,
        wallet: r.wallet,
        realizedUsd: Math.round(r.realized),
        trades: r.trades,
        tokens: r.tokens,
        best: b ? { address: b.address, symbol: b.symbol, imageUrl: b.image_url, realizedUsd: Math.round(b.realized) } : null,
        holding: (heldBy.get(r.wallet) ?? []).sort((a, z) => z.value - a.value).map((h) => ({ address: h.address, symbol: h.symbol, imageUrl: h.image_url, valueUsd: Math.round(h.value) })),
        lastTradeAt: lastBy.get(r.wallet) ?? null,
      };
    }),
  };
}

/** One token's consensus (null when nobody in the hive has a view yet). */
export async function hiveToken(sql: Sql, token: string) {
  const [row] = await rowsFor(sql, token, 1, 1);
  return row ?? null;
}
