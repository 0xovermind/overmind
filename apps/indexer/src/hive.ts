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
  created_at: Date;
}

/** The smart set is expensive (it reads every position and swap of the candidates): cached for a few minutes. */
export interface SmartWallet { wallet: string; realized: number; trades: number; tokens: number }
/** all: the whole chain. pons: Pons launches only (their own smart set, so small bonding-curve tokens get a read). */
export type HiveScope = 'all' | 'pons';
export const asScope = (v: unknown): HiveScope => (v === 'pons' ? 'pons' : 'all');
const smartCache = new Map<HiveScope, { at: number; rows: SmartWallet[] }>();

export async function smartWallets(sql: Sql, scope: HiveScope = 'all'): Promise<string[]> {
  return (await smartSet(sql, scope)).map((r) => r.wallet);
}

/**
 * The smart set with each wallet's realized profit (bought part only), trade count and token count.
 * Read from the smart_set table, which the cron rebuilds every few minutes (refreshSmartSets): the
 * computation reads every position and runs for a minute or more on a busy database, so readers never
 * run it themselves, except once when the table is still empty.
 */
export async function smartSet(sql: Sql, scope: HiveScope = 'all'): Promise<SmartWallet[]> {
  const hit = smartCache.get(scope);
  if (hit && Date.now() - hit.at < SMART_TTL_MS) return hit.rows;
  const stored = await sql<{ wallet: string; realized: number; trades: number; tokens: number }[]>`
    select wallet, realized, trades, tokens from smart_set where scope = ${scope} order by realized desc`;
  const out = stored.length ? stored.map((r) => ({ ...r })) : await storeSmartSet(sql, scope);
  smartCache.set(scope, { at: Date.now(), rows: out });
  return out;
}

/** Recompute both smart sets and store them (cron, every 10 minutes). */
export async function refreshSmartSets(sql: Sql): Promise<Record<HiveScope, number>> {
  const all = await storeSmartSet(sql, 'all');
  const pons = await storeSmartSet(sql, 'pons');
  smartCache.delete('all');
  smartCache.delete('pons');
  return { all: all.length, pons: pons.length };
}

async function storeSmartSet(sql: Sql, scope: HiveScope): Promise<SmartWallet[]> {
  const rows = await computeSmartSet(sql, scope);
  if (!rows.length) return rows;
  await sql.begin(async (tx) => {
    await tx`delete from smart_set where scope = ${scope}`;
    await tx`insert into smart_set ${tx(rows.map((r) => ({ scope, wallet: r.wallet, realized: r.realized, trades: r.trades, tokens: r.tokens })))}`;
  });
  return rows;
}

async function computeSmartSet(sql: Sql, scope: HiveScope): Promise<SmartWallet[]> {
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
        ${scope === 'pons' ? sql`and t.launchpad = 'pons'` : sql``}
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
  return rows.map((r) => ({ wallet: r.wallet, realized: Number(r.realized), trades: Number(r.trades), tokens: Number(r.tokens) }));
}

const rowsFor = async (sql: Sql, token: string | null, minVoters: number, limit: number, scope: HiveScope = 'all') => {
  const smart = await smartWallets(sql, scope);
  return sql<HiveRow[]>`
  -- A wallet is in only when it both holds more of the token and put more dollars in than it took out
  -- (real accumulation). Anything else with a trade is out: taking money off the table (net USD < 0,
  -- even while still holding some) or cutting the position (net tokens <= 0, even at a loss, where the
  -- dollars alone would make an exit look like a buy).
  with flow as (
    select s.token, s.trader,
      sum(case when s.side = 'buy' then coalesce(s.usd, 0) else -coalesce(s.usd, 0) end) as net_usd,
      sum(case when s.side = 'buy' then s.token_amount else -s.token_amount end) as net_tok
    from swaps s
    where s.time > now() - ${FLOW_WINDOW}::interval
      and s.trader = any(${smart}::text[])
      ${token ? sql`and s.token = ${token}` : sql``}
    group by s.token, s.trader
  ),
  f as (
    select token,
      count(*) filter (where net_tok > 0 and net_usd > 0)::int as buyers,
      count(*) filter (where net_usd < 0 or net_tok < 0)::int as sellers
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
    t.symbol, t.name, t.image_url, t.status, t.created_at,
    t.market_cap_usd::float8 as market_cap_usd, t.price_usd::float8 as price_usd
  from j
  join tokens t on t.address = j.token
  left join signals sg on sg.token = j.token
  where (smart_buyers + smart_sellers + bullish_calls + bearish_calls) >= ${minVoters}
    ${!token && scope === 'pons' ? sql`and t.launchpad = 'pons'` : sql``}
    ${token ? sql`` : sql`
      and t.created_at < now() - ${MIN_AGE}::interval
      and coalesce(sg.risk_level, '') <> 'high'
      and not coalesce((sg.data->>'copycat')::bool, false)
      and not coalesce((sg.data->>'spam')::bool, false)`}
  order by (smart_buyers + smart_sellers + bullish_calls + bearish_calls) desc, j.token
  limit ${limit}`;
};

/** The hive board: tokens the smart crowd is most active in, with their consensus score. */
export async function hiveBoard(sql: Sql, limit = 30, scope: HiveScope = 'all') {
  const rows = await rowsFor(sql, null, 2, limit, scope);
  return { window: FLOW_WINDOW, scope, smart_wallets: (await smartWallets(sql, scope)).length, tokens: rows };
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
export interface DailyRow {
  token: string; symbol: string; name: string; image_url: string | null; market_cap_usd: number | null;
  buyers: number; sellers: number; net_usd: number; score: number;
}

/**
 * Hive Daily: what the smart set did over the last 24 hours, as net USD per token. Only tokens the
 * public board would show (not high risk, spam or a copycat ticker, at least MIN_AGE old) with a
 * market cap of at least $30K and three or more smart wallets trading them.
 */
export async function hiveDaily(sql: Sql, limit = 5, scope: HiveScope = 'all'): Promise<{ at: string; scope: HiveScope; smart_wallets: number; buying: DailyRow[]; selling: DailyRow[] }> {
  const smart = await smartWallets(sql, scope);
  // Pons launches are small (most sit on the bonding curve): lower bars there.
  const minMcap = scope === 'pons' ? 3000 : 30000;
  const minVoices = scope === 'pons' ? 2 : 3;
  const rows = await sql<DailyRow[]>`
    -- In and out as in rowsFor. Net USD counts buyers' dollars in and sellers' dollars out; a wallet that
    -- cut its position at a loss counts as a seller but adds no dollars either way.
    with flow as (
      select s.token, s.trader,
        sum(case when s.side = 'buy' then coalesce(s.usd, 0) else -coalesce(s.usd, 0) end) as net_usd,
        sum(case when s.side = 'buy' then s.token_amount else -s.token_amount end) as net_tok
      from swaps s
      where s.time > now() - ${FLOW_WINDOW}::interval and s.trader = any(${smart}::text[])
      group by s.token, s.trader
    ),
    agg as (
      select token,
        count(*) filter (where net_tok > 0 and net_usd > 0)::int as buyers,
        count(*) filter (where net_usd < 0 or net_tok < 0)::int as sellers,
        sum(case when net_tok > 0 and net_usd > 0 then net_usd when net_usd < 0 then net_usd else 0 end)::float8 as net_usd
      from flow group by token
    )
    select a.token, t.symbol, t.name, t.image_url, t.market_cap_usd::float8 as market_cap_usd, a.buyers, a.sellers, a.net_usd,
      round(100.0 * (a.buyers - a.sellers) / nullif(a.buyers + a.sellers, 0))::int as score
    from agg a
    join tokens t on t.address = a.token
    left join signals sg on sg.token = a.token
    where a.buyers + a.sellers >= ${minVoices}
      and coalesce(t.market_cap_usd, 0) >= ${minMcap}
      ${scope === 'pons' ? sql`and t.launchpad = 'pons'` : sql``}
      and t.created_at < now() - ${MIN_AGE}::interval
      and coalesce(sg.risk_level, '') <> 'high'
      and not coalesce((sg.data->>'copycat')::bool, false)
      and not coalesce((sg.data->>'spam')::bool, false)`;
  const n = Math.min(Math.max(limit, 1), 10);
  return {
    at: new Date().toISOString(),
    scope,
    smart_wallets: smart.length,
    buying: rows.filter((r) => r.net_usd > 0).sort((a, b) => b.net_usd - a.net_usd).slice(0, n),
    selling: rows.filter((r) => r.net_usd < 0).sort((a, b) => a.net_usd - b.net_usd).slice(0, n),
  };
}

export interface HivePoint { t: string; score: number | null; buyers: number; sellers: number; price_usd: number | null }

/**
 * A token's hive reading through time, rebuilt from swaps: at each point, how many of today's smart
 * wallets were net buyers vs net sellers of the token over the FLOW_WINDOW before it. Calls are left
 * out (their history isn't kept), so this is the smart-money side of the score. `price_usd` is the last
 * traded price at that point, for an overlay.
 */
export async function hiveHistory(sql: Sql, token: string, days: number): Promise<HivePoint[]> {
  const d = Math.min(Math.max(Math.round(days), 1), 30);
  const step = d <= 1 ? '30 minutes' : d <= 7 ? '2 hours' : '6 hours';
  const smart = await smartWallets(sql, await scopeOf(sql, token));
  const rows = await sql<{ t: Date; buyers: number; sellers: number; price_usd: number | null }[]>`
    with b as (
      select generate_series(date_trunc('hour', now()) - ${d} * interval '1 day', now(), ${step}::interval) as t
    ),
    sw as (
      select s.time, s.trader,
        case when s.side = 'buy' then coalesce(s.usd, 0) else -coalesce(s.usd, 0) end as v,
        case when s.side = 'buy' then s.token_amount else -s.token_amount end as vt
      from swaps s
      where s.token = ${token}
        and s.time > now() - ${d} * interval '1 day' - ${FLOW_WINDOW}::interval
        and s.trader = any(${smart}::text[])
    ),
    flow as (
      select b.t, sw.trader, sum(sw.v) as net_usd, sum(sw.vt) as net_tok
      from b join sw on sw.time > b.t - ${FLOW_WINDOW}::interval and sw.time <= b.t
      group by b.t, sw.trader
    ),
    agg as (
      select t, count(*) filter (where net_tok > 0 and net_usd > 0)::int as buyers,
        count(*) filter (where net_usd < 0 or net_tok < 0)::int as sellers
      from flow group by t
    )
    select b.t, coalesce(a.buyers, 0)::int as buyers, coalesce(a.sellers, 0)::int as sellers,
      (select s.price_usd::float8 from swaps s
        where s.token = ${token} and s.time <= b.t and s.price_usd is not null
        order by s.time desc limit 1) as price_usd
    from b left join agg a on a.t = b.t
    order by b.t`;
  return rows.map((r) => {
    const n = r.buyers + r.sellers;
    return { t: r.t.toISOString(), buyers: r.buyers, sellers: r.sellers, price_usd: r.price_usd, score: n ? Math.round((100 * (r.buyers - r.sellers)) / n) : null };
  });
}

/** A Pons launch is read by the Pons smart set; everything else by the chain-wide one. */
async function scopeOf(sql: Sql, token: string): Promise<HiveScope> {
  const [t] = await sql<{ launchpad: string | null }[]>`select launchpad from tokens where address = ${token}`;
  return t?.launchpad === 'pons' ? 'pons' : 'all';
}

export async function hiveToken(sql: Sql, token: string) {
  const [row] = await rowsFor(sql, token, 1, 1, await scopeOf(sql, token));
  return row ?? null;
}
