// Four reads nobody else has on Robinhood Chain (all public, no account needed):
//
//   GET /v1/arena?h=1|24|168&days=30      Arena: hive vs crowd vs AI. Every bullish/bearish call of the three is
//                                         stored with its price and scored against the price h hours later.
//   GET /v1/wallets/:address/dna          Wallet DNA: what kind of trader a wallet is, from its positions.
//   GET /v1/wallets/:address/dna/roast    One AI line about that wallet (DeepSeek, cached).
//   GET /v1/tokens/:address/coholders     ?wallet=: the wallets that bought the token within 30 minutes of
//                                         this wallet's first buy, and how many of them have left since.
//   GET /v1/tokens/:address/replay        The token's launch, trade by trade, for the replay player.
//
// The cron calls arenaSync (collect and score calls) and coexitAlerts (members' "your co-buyers are leaving").
import { Hono } from 'hono';
import type { Sql } from 'postgres';
import { AI_RULES, deepseek } from '../ai';
import { AGENT_ID } from '../ai-agent';
import { fail, isAddr, limit, publicCache, type C, type Ctx } from './http';

export const arena = new Hono<Ctx>();

const addrParam = (c: C, name = 'address') => {
  const a = (c.req.param(name) ?? '').toLowerCase();
  if (!isAddr(a)) throw fail(422, 'invalid_address', 'Expected an address (0x + 40 hex).');
  return a;
};

// ---------------------------------------------------------------- Arena

/** A move smaller than this either way is a push: neither right nor wrong. */
const PUSH = 0.02;
const HORIZONS = { 1: 'price_1h', 24: 'price_24h', 168: 'price_7d' } as const;
type Horizon = keyof typeof HORIZONS;
const CROWD_MIN_VOTES = 3;

/**
 * Collect new calls from the three sources and score the ones that came due. Hive: every hive signal (side
 * buying = bullish, selling = bearish). AI: every @overmind_ai call. Crowd: a token's 24h vote majority
 * (3+ votes, strict majority), recorded when it first forms or flips, at most once a day per side.
 */
export async function arenaSync(sql: Sql): Promise<{ added: number; scored: number }> {
  let added = 0;
  added += (await sql`
    insert into arena_calls (id, source, token, stance, price_usd, mcap_usd, weight, at)
    select 'h:' || s.id, 'hive', s.token, case when s.side = 'buying' then 'bullish' else 'bearish' end,
      s.price_usd::float8, s.market_cap_usd::float8, s.voters, s.at
    from hive_signals s
    where s.at > now() - interval '30 days' and s.side in ('buying', 'selling') and s.price_usd > 0
    on conflict (id) do nothing`).count;
  added += (await sql`
    insert into arena_calls (id, source, token, stance, price_usd, mcap_usd, weight, at)
    select 'a:' || c.id, 'ai', c.token, c.stance, coalesce(c.price_at_post_usd, t.price_usd)::float8,
      coalesce(c.mcap_at_post_usd, t.market_cap_usd)::float8, null, c.created_at
    from callouts c join tokens t on t.address = c.token
    where c.author_id = ${AGENT_ID} and c.deleted_at is null and c.created_at > now() - interval '30 days'
      and coalesce(c.price_at_post_usd, t.price_usd) > 0
    on conflict (id) do nothing`).count;
  added += (await sql`
    with tally as (
      select token, count(*) filter (where stance = 'bullish')::int as bull, count(*) filter (where stance = 'bearish')::int as bear
      from token_votes where updated_at > now() - interval '24 hours' group by token
    ), majority as (
      select token, case when bull > bear then 'bullish' else 'bearish' end as stance, bull + bear as votes
      from tally where bull + bear >= ${CROWD_MIN_VOTES} and bull <> bear
    )
    insert into arena_calls (id, source, token, stance, price_usd, mcap_usd, weight, at)
    select 'c:' || m.token || ':' || extract(epoch from now())::bigint, 'crowd', m.token, m.stance,
      t.price_usd::float8, t.market_cap_usd::float8, m.votes, now()
    from majority m join tokens t on t.address = m.token
    where t.price_usd > 0 and not exists (
      select 1 from arena_calls a where a.source = 'crowd' and a.token = m.token and a.at > now() - interval '24 hours'
        and a.stance = m.stance
    ) and coalesce((select a.stance from arena_calls a where a.source = 'crowd' and a.token = m.token order by a.at desc limit 1), '') <> m.stance
    on conflict (id) do nothing`).count;
  // Score: the last 1m close at or before the horizon (no trade since = the price didn't move).
  let scored = 0;
  for (const [h, col] of [[1, 'price_1h'], [24, 'price_24h'], [168, 'price_7d']] as const) {
    scored += (await sql.unsafe(`
      update arena_calls a set ${col} = coalesce((
        select c.close::float8 from candles c
        where c.token = a.token and c.interval = '1m' and c.bucket <= a.at + interval '${h} hours'
        order by c.bucket desc limit 1), a.price_usd)
      where a.${col} is null and a.at <= now() - interval '${h} hours' and a.at > now() - interval '40 days'`)).count;
  }
  return { added, scored };
}

interface ArenaRow { id: string; source: 'hive' | 'crowd' | 'ai'; token: string; stance: string; price_usd: number; mcap_usd: number | null; weight: number | null; at: Date; after: number | null; symbol: string | null; image_url: string | null }

const moveOf = (r: { stance: string; price_usd: number; after: number | null }) => {
  if (r.after == null || !(r.price_usd > 0)) return null;
  const m = r.after / r.price_usd - 1;
  return r.stance === 'bullish' ? m : -m;
};
const outcome = (m: number | null) => (m == null ? 'open' : m > PUSH ? 'win' : m < -PUSH ? 'loss' : 'push');

arena.get('/arena', async (c) => {
  await limit(c, 'read');
  const h = (Number(c.req.query('h')) in HORIZONS ? Number(c.req.query('h')) : 24) as Horizon;
  const days = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 30);
  const col = HORIZONS[h];
  const rows = await c.var.sql.unsafe<ArenaRow[]>(`
    select a.id, a.source, a.token, a.stance, a.price_usd, a.mcap_usd, a.weight, a.at, a.${col} as after, t.symbol, t.image_url
    from arena_calls a left join tokens t on t.address = a.token
    where a.at > now() - interval '${days} days'
    order by a.at desc`);
  const sources = (['hive', 'crowd', 'ai'] as const).map((source) => {
    const mine = rows.filter((r) => r.source === source);
    const moves = mine.map(moveOf).filter((m): m is number => m != null);
    const wins = moves.filter((m) => m > PUSH).length;
    const losses = moves.filter((m) => m < -PUSH).length;
    // Average edge, each call capped at ±100% so one moonshot or rug doesn't decide the board.
    const edge = moves.length ? moves.reduce((s, m) => s + Math.max(-1, Math.min(1, m)), 0) / moves.length : null;
    // Streak: consecutive decided calls (newest first) with the same outcome.
    let streak = 0;
    let kind: 'win' | 'loss' | null = null;
    for (const r of mine) {
      const o = outcome(moveOf(r));
      if (o !== 'win' && o !== 'loss') continue;
      if (!kind) kind = o;
      if (o !== kind) break;
      streak++;
    }
    return {
      source, calls: mine.length, scored: moves.length, wins, losses, pushes: moves.length - wins - losses,
      winRate: wins + losses ? wins / (wins + losses) : null, edge, open: mine.length - moves.length,
      streak: kind ? { kind, n: streak } : null,
    };
  });
  const ranked = sources.filter((s) => s.wins + s.losses >= 3).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  // Daily scoreboard (last 7 days): each source's win rate per UTC day of the call.
  const daily: { day: string; hive: number | null; crowd: number | null; ai: number | null }[] = [];
  for (let d = 6; d >= 0; d--) {
    const day = new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
    const rate = (source: string) => {
      const ms = rows.filter((r) => r.source === source && r.at.toISOString().slice(0, 10) === day).map(moveOf).filter((m): m is number => m != null);
      const w = ms.filter((m) => m > PUSH).length;
      const l = ms.filter((m) => m < -PUSH).length;
      return w + l ? w / (w + l) : null;
    };
    daily.push({ day, hive: rate('hive'), crowd: rate('crowd'), ai: rate('ai') });
  }
  // Clashes: a token where two sources took opposite sides within 6 hours: who was right.
  const clashes: unknown[] = [];
  const seen = new Set<string>();
  for (const a of rows) {
    if (clashes.length >= 12) break;
    for (const b of rows) {
      if (b.source === a.source || b.token !== a.token || b.stance === a.stance) continue;
      if (Math.abs(a.at.getTime() - b.at.getTime()) > 6 * 3600_000) continue;
      const key = [a.id, b.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const ma = moveOf(a);
      clashes.push({
        token: { address: a.token, symbol: a.symbol, imageUrl: a.image_url },
        at: a.at > b.at ? a.at : b.at,
        sides: [a, b].map((x) => ({ source: x.source, stance: x.stance, at: x.at, outcome: outcome(moveOf(x)) })),
        winner: ma == null ? null : Math.abs(ma) <= PUSH ? 'push' : ma > 0 ? a.source : b.source,
      });
    }
  }
  const recent = rows.slice(0, 60).map((r) => {
    const m = moveOf(r);
    return {
      id: r.id, source: r.source, stance: r.stance, at: r.at, weight: r.weight,
      token: { address: r.token, symbol: r.symbol, imageUrl: r.image_url },
      priceAt: r.price_usd, mcapAt: r.mcap_usd, priceAfter: r.after, move: m, outcome: outcome(m),
    };
  });
  return c.json({ horizon: h, days, push: PUSH, sources, leader: ranked[0]?.source ?? null, daily, clashes, recent }, 200, publicCache(60));
});

// ---------------------------------------------------------------- Wallet DNA

interface DnaStats {
  tokens: number; buys: number; sells: number; closed: number; wins: number; realized: number; volume: number;
  median_hold_s: number | null; snipes: number; holding: number; first_at: Date | null; last_at: Date | null;
}

const ARCHETYPES = {
  fresh: { name: 'Fresh Wallet', line: 'Barely traded yet. The story is still unwritten.' },
  bot: { name: 'The Machine', line: 'Trades around the clock at a pace no human keeps. Almost certainly a bot.' },
  sniper: { name: 'The Sniper', line: 'In within the first minute of launch, again and again.' },
  sharpshooter: { name: 'The Sharpshooter', line: 'Picks few fights and wins most of them.' },
  diamond: { name: 'Diamond Hands', line: 'Buys and sits. Days, not minutes.' },
  paper: { name: 'Paper Hands', line: 'Out at the first red candle, usually at a loss.' },
  scalper: { name: 'The Scalper', line: 'In and out within the hour. Lives on small moves.' },
  whale: { name: 'The Whale', line: 'Big size. When this wallet moves, charts notice.' },
  degen: { name: 'The Degen', line: 'Many tokens, many trades, no fixed rules.' },
} as const;
type Archetype = keyof typeof ARCHETYPES;

function archetypeOf(s: DnaStats, tradesPerDay: number): Archetype {
  const trades = s.buys + s.sells;
  const winRate = s.closed ? s.wins / s.closed : 0;
  const hold = s.median_hold_s;
  if (trades < 3) return 'fresh';
  if (tradesPerDay >= 150) return 'bot';
  if (s.tokens >= 5 && s.snipes / s.tokens >= 0.35) return 'sniper';
  if (s.closed >= 5 && winRate >= 0.6 && s.realized > 0) return 'sharpshooter';
  if ((hold != null && hold >= 3 * 86400) || (s.tokens >= 3 && s.holding / s.tokens >= 0.7 && s.closed <= s.tokens / 3)) return 'diamond';
  if (hold != null && hold < 15 * 60 && winRate < 0.45) return 'paper';
  if (hold != null && hold < 3600) return 'scalper';
  if (s.volume >= 100_000) return 'whale';
  return 'degen';
}

/**
 * Per-token trade aggregates of a wallet, from its swaps (its latest 20,000) and its live balance. Realized is
 * what it sold for minus the cost of the share it sold (tokens it sold without buying here are left out).
 */
async function walletTokens(sql: Sql, wallet: string) {
  return sql<{ token: string; symbol: string; created_at: Date; buys: number; sells: number; bought_usd: number; sold_usd: number; bought: number; sold: number; held: number; first: Date | null; last: Date }[]>`
    with sw as (select token, side, token_amount, usd, time from swaps where trader = ${wallet} order by time desc limit 20000)
    select sw.token, t.symbol, t.created_at,
      count(*) filter (where side = 'buy')::int as buys, count(*) filter (where side = 'sell')::int as sells,
      coalesce(sum(usd) filter (where side = 'buy'), 0)::float8 as bought_usd, coalesce(sum(usd) filter (where side = 'sell'), 0)::float8 as sold_usd,
      coalesce(sum(token_amount) filter (where side = 'buy'), 0)::float8 as bought, coalesce(sum(token_amount) filter (where side = 'sell'), 0)::float8 as sold,
      coalesce((select b.amount::float8 from balances b where b.token = sw.token and b.wallet = ${wallet}), greatest(coalesce(sum(token_amount) filter (where side = 'buy'), 0) - coalesce(sum(token_amount) filter (where side = 'sell'), 0), 0)::float8) as held,
      min(time) filter (where time > '2020-01-01') as first, max(time) as last
    from sw join tokens t on t.address = sw.token group by sw.token, t.symbol, t.created_at`;
}

async function dnaOf(sql: Sql, wallet: string) {
  const rows = await walletTokens(sql, wallet);
  if (!rows.length) return null;
  const per = rows.map((r) => {
    const realized = r.bought > 0 && r.sells > 0 ? r.sold_usd - r.bought_usd * Math.min(1, r.sold / r.bought) : null;
    const exited = r.bought > 0 && r.held * 20 < r.bought;
    return { ...r, realized, exited };
  });
  const closedRows = per.filter((r) => r.realized != null);
  const holds = per.filter((r) => r.exited && r.sells > 0 && r.first).map((r) => (r.last.getTime() - r.first!.getTime()) / 1000).sort((x, y) => x - y);
  const firsts = per.map((r) => r.first).filter((d): d is Date => !!d);
  const s: DnaStats = {
    tokens: per.length,
    buys: per.reduce((n, r) => n + r.buys, 0),
    sells: per.reduce((n, r) => n + r.sells, 0),
    closed: closedRows.length,
    wins: closedRows.filter((r) => r.realized! > 0).length,
    realized: closedRows.reduce((n, r) => n + r.realized!, 0),
    volume: per.reduce((n, r) => n + r.bought_usd + r.sold_usd, 0),
    median_hold_s: holds.length ? holds[Math.floor(holds.length / 2)]! : null,
    snipes: per.filter((r) => r.first && r.first.getTime() - r.created_at.getTime() < 60_000).length,
    holding: per.filter((r) => r.held > 0 && !r.exited).length,
    first_at: firsts.length ? new Date(Math.min(...firsts.map((d) => d.getTime()))) : null,
    last_at: new Date(Math.max(...per.map((r) => r.last.getTime()))),
  };
  const [act] = await sql<{ days: number; trades: number; hour: number | null }[]>`
    with recent as (select time from swaps where trader = ${wallet} order by time desc limit 5000)
    select count(distinct date_trunc('day', time))::int as days, count(*)::int as trades,
      mode() within group (order by extract(hour from time at time zone 'UTC'))::int as hour
    from recent`;
  const tradesPerDay = act && act.days ? act.trades / act.days : 0;
  const byRealized = [...closedRows].sort((x, y) => y.realized! - x.realized!);
  const pick = (r: (typeof per)[number] | undefined) => (r ? { token: r.token, symbol: r.symbol, realized: r.realized! } : undefined);
  const best = [pick(byRealized[0])].filter(Boolean) as { token: string; symbol: string; realized: number }[];
  const worst = [pick(byRealized.at(-1))].filter(Boolean) as { token: string; symbol: string; realized: number }[];
  const [smart] = await sql<{ n: number }[]>`select count(*)::int as n from smart_set where wallet = ${wallet}`;
  const kind = archetypeOf(s, tradesPerDay);
  const winRate = s.closed ? s.wins / s.closed : null;
  const traits: string[] = [];
  if ((smart?.n ?? 0) > 0) traits.push('In the hive');
  if (s.tokens >= 3 && s.snipes / s.tokens >= 0.2) traits.push('Early bird');
  if (act?.hour != null && (act.hour >= 0 && act.hour < 5)) traits.push('Night owl');
  if (s.volume >= 50_000) traits.push('Big size');
  if (winRate != null && s.closed >= 5 && winRate >= 0.55) traits.push('Sharp exits');
  if (s.tokens >= 50) traits.push('Collector');
  if (s.realized < -1000) traits.push('Battle scars');
  if (tradesPerDay >= 40 && kind !== 'bot') traits.push('Hyperactive');
  return {
    wallet,
    archetype: { id: kind, ...ARCHETYPES[kind] },
    traits: traits.slice(0, 4),
    stats: {
      tokens: s.tokens, trades: s.buys + s.sells, buys: s.buys, sells: s.sells, closed: s.closed, wins: s.wins, winRate,
      realizedUsd: s.realized, volumeUsd: s.volume,
      medianHoldS: s.median_hold_s, snipeRate: s.tokens ? s.snipes / s.tokens : 0, holding: s.holding,
      tradesPerDay, activeDays: act?.days ?? 0, favoriteHourUtc: act?.hour ?? null,
      firstAt: s.first_at, lastAt: s.last_at, inHive: (smart?.n ?? 0) > 0,
    },
    best: best[0] && best[0].realized > 0 ? best[0] : null,
    worst: worst[0] && worst[0].realized < 0 ? worst[0] : null,
  };
}

arena.get('/wallets/:address/dna', async (c) => {
  await limit(c, 'read');
  const d = await dnaOf(c.var.sql, addrParam(c));
  if (!d) throw fail(404, 'no_trades', 'This wallet has no trades Overmind has seen.');
  return c.json(d, 200, publicCache(300));
});

const roastCache = new Map<string, { at: number; text: string }>();
const ROAST_MS = 6 * 3600_000;
const ROAST = `You write one short, witty line (under 160 characters) about a crypto trader's style, from their on-chain
stats, for a shareable "Wallet DNA" card. Playful, never mean about the person, never financial advice, no predictions,
no emojis, no hashtags. Refer to the stats, not to the person's character.
${AI_RULES}`;

arena.get('/wallets/:address/dna/roast', async (c) => {
  await limit(c, 'read');
  const wallet = addrParam(c);
  const hit = roastCache.get(wallet);
  if (hit && Date.now() - hit.at < ROAST_MS) return c.json({ text: hit.text }, 200, publicCache(600));
  const key = c.env.DEEPSEEK_API_KEY;
  if (!key) throw fail(503, 'ai_off', 'Overmind AI is not configured.');
  const d = await dnaOf(c.var.sql, wallet);
  if (!d) throw fail(404, 'no_trades', 'This wallet has no trades Overmind has seen.');
  const text = (await deepseek(key, ROAST, { archetype: d.archetype.name, traits: d.traits, stats: d.stats, best: d.best, worst: d.worst }, { maxTokens: 90, temperature: 0.8 }))
    .trim().replace(/^"|"$/g, '').slice(0, 200);
  if (roastCache.size > 500) roastCache.clear();
  roastCache.set(wallet, { at: Date.now(), text });
  return c.json({ text }, 200, publicCache(600));
});

// ---------------------------------------------------------------- Co-holders

const WITH_WINDOW = '30 minutes';

interface CoRow { trader: string; bought_usd: number; bought: number; sold: number; held: number; sold_recent_usd: number | null; last_sell: Date | null }

/** The wallets that bought `token` within WITH_WINDOW of `wallet`'s first buy, with where each stands now (live balance vs bought). */
async function coholders(sql: Sql, token: string, wallet: string) {
  const [me] = await sql<{ first: Date | null }[]>`
    select min(time) as first from swaps where token = ${token} and trader = ${wallet} and side = 'buy' and time > '2020-01-01'`;
  if (!me?.first) return null;
  const rows = await sql<CoRow[]>`
    with co as (
      select trader, sum(usd)::float8 as bought_usd from swaps
      where token = ${token} and side = 'buy' and trader <> ${wallet}
        and time between ${me.first}::timestamptz - ${WITH_WINDOW}::interval and ${me.first}::timestamptz + ${WITH_WINDOW}::interval
      group by trader order by sum(usd) desc nulls last limit 300
    ), agg as (
      select s.trader,
        coalesce(sum(s.token_amount) filter (where s.side = 'buy'), 0)::float8 as bought,
        coalesce(sum(s.token_amount) filter (where s.side = 'sell'), 0)::float8 as sold,
        sum(s.usd) filter (where s.side = 'sell' and s.time > now() - interval '24 hours')::float8 as sold_recent_usd,
        max(s.time) filter (where s.side = 'sell') as last_sell
      from swaps s where s.token = ${token} and s.trader in (select trader from co) group by s.trader
    )
    select co.trader, co.bought_usd, agg.bought, agg.sold, coalesce(b.amount::float8, greatest(agg.bought - agg.sold, 0)) as held, agg.sold_recent_usd, agg.last_sell
    from co join agg on agg.trader = co.trader
    left join balances b on b.token = ${token} and b.wallet = co.trader`;
  const status = (r: CoRow) => {
    if (r.bought <= 0) return 'holding';
    if (r.held * 10 < r.bought) return 'exited';
    if (r.held * 10 < r.bought * 7) return 'trimmed';
    return 'holding';
  };
  const list = rows
    .map((r) => ({ wallet: r.trader, boughtUsd: r.bought_usd, status: status(r), soldLast24hUsd: r.sold_recent_usd, lastSell: r.last_sell }))
    .sort((x, y) => (y.boughtUsd ?? 0) - (x.boughtUsd ?? 0));
  const count = (st: string) => list.filter((x) => x.status === st).length;
  const left24h = list.filter((x) => x.status !== 'holding' && x.soldLast24hUsd);
  return {
    token, wallet, firstBuy: me.first, window: WITH_WINDOW,
    total: list.length, holding: count('holding'), trimmed: count('trimmed'), exited: count('exited'),
    left24h: left24h.length, soldLast24hUsd: left24h.reduce((n, x) => n + (x.soldLast24hUsd ?? 0), 0),
    wallets: list.slice(0, 40),
  };
}

arena.get('/tokens/:address/coholders', async (c) => {
  await limit(c, 'read');
  const token = addrParam(c);
  const wallet = (c.req.query('wallet') ?? '').toLowerCase();
  if (!isAddr(wallet)) throw fail(422, 'invalid_wallet', 'Pass ?wallet=0x…');
  const r = await coholders(c.var.sql, token, wallet);
  if (!r) throw fail(404, 'no_position', 'This wallet never bought this token.');
  return c.json(r, 200, publicCache(60));
});

/**
 * "Your co-buyers are leaving": for each human member's open positions, when at least 3 of the wallets that bought
 * with them (and a quarter of them) sold out or trimmed in the last hour, one alert in the bell. At most one per
 * token every 6 hours.
 */
export async function coexitAlerts(sql: Sql): Promise<number> {
  const open = await sql<{ member_id: string; wallet: string; token: string }[]>`
    select m.id as member_id, b.wallet, b.token from members m join balances b on b.wallet = m.wallet
    where m.kind = 'human' and b.amount > 0 and b.updated_at > now() - interval '30 days'
      and not exists (select 1 from wallet_alerts a where a.member_id = m.id and a.kind = 'coexit' and a.token = b.token and a.created_at > now() - interval '6 hours')
    limit 200`;
  let n = 0;
  for (const o of open) {
    const r = await coholders(sql, o.token, o.wallet);
    if (!r || r.total < 4) continue;
    const hour = Date.now() - 3600_000;
    const leaving = r.wallets.filter((w) => w.status !== 'holding' && w.lastSell && new Date(w.lastSell).getTime() > hour);
    if (leaving.length < 3 || leaving.length < r.total / 4) continue;
    const usd = leaving.reduce((s, w) => s + (w.soldLast24hUsd ?? 0), 0);
    const bucket = Math.floor(Date.now() / 3600_000);
    n += (await sql`
      insert into wallet_alerts (id, member_id, wallet, kind, token, amount, usd, counterparty, tx, log_index, at)
      values (${`wa_cx_${o.member_id}_${o.token.slice(2, 10)}_${bucket}`}, ${o.member_id}, ${o.wallet}, 'coexit', ${o.token},
        ${leaving.length}, ${usd}, ${String(r.total)}, ${`coexit:${o.token}:${bucket}`}, 0, now())
      on conflict do nothing`).count;
  }
  return n;
}

// ---------------------------------------------------------------- Launch replay

arena.get('/tokens/:address/replay', async (c) => {
  await limit(c, 'read');
  const token = addrParam(c);
  const sql = c.var.sql;
  const [t] = await sql<{ symbol: string; name: string; decimals: number; supply: string; deployer: string; created_at: Date; image_url: string | null; launchpad: string | null }[]>`
    select symbol, name, decimals, total_supply::text as supply, deployer, created_at, image_url, launchpad from tokens where address = ${token}`;
  if (!t) throw fail(404, 'unknown_token', 'Overmind does not index this token.');
  const swaps = await sql<{ time: Date; trader: string; side: string; amount: string; usd: number | null; price: number | null; tx: string }[]>`
    select time, trader, side, token_amount::text as amount, usd::float8 as usd, price_usd::float8 as price, tx
    from swaps where token = ${token} order by time, log_index limit 600`;
  const smart = new Set((await sql<{ wallet: string }[]>`
    select distinct wallet from smart_set where wallet = any(${[...new Set(swaps.map((s) => s.trader))]}::text[])`).map((r) => r.wallet));
  const scale = 10 ** Math.min(t.decimals, 18);
  const supply = Number(BigInt(t.supply) / 10n ** BigInt(Math.max(t.decimals - 6, 0))) / 10 ** Math.min(t.decimals, 6);
  const start = t.created_at.getTime();
  const firstSeen = new Map<string, number>();
  const events = swaps.map((s) => {
    const at = (s.time.getTime() - start) / 1000;
    if (!firstSeen.has(s.trader)) firstSeen.set(s.trader, at);
    const tags: string[] = [];
    if (s.trader === t.deployer) tags.push('dev');
    if (smart.has(s.trader)) tags.push('smart');
    if ((firstSeen.get(s.trader) ?? at) < 60) tags.push('sniper');
    return {
      t: Math.max(0, at), trader: s.trader, side: s.side, amount: Number(s.amount) / scale, usd: s.usd,
      mcap: s.price != null ? s.price * supply : null, tags, tx: s.tx,
    };
  });
  const firstSmart = events.find((e) => e.tags.includes('smart') && e.side === 'buy');
  const devSell = events.find((e) => e.tags.includes('dev') && e.side === 'sell');
  const peak = events.reduce<{ mcap: number; t: number } | null>((p, e) => (e.mcap != null && (!p || e.mcap > p.mcap) ? { mcap: e.mcap, t: e.t } : p), null);
  return c.json({
    token: { address: token, symbol: t.symbol, name: t.name, imageUrl: t.image_url, deployer: t.deployer, createdAt: t.created_at, launchpad: t.launchpad },
    events, truncated: swaps.length === 600,
    moments: {
      firstSmartBuy: firstSmart ? { t: firstSmart.t, wallet: firstSmart.trader } : null,
      devFirstSell: devSell ? { t: devSell.t, usd: devSell.usd } : null,
      peak, traders: firstSeen.size, snipers: [...firstSeen.values()].filter((v) => v < 60).length,
    },
  }, 200, publicCache(120));
});
