// Protection and proof, all public reads except the alerts:
//
//   Exit Alarm (cron, exitAlarm): a member holds a token and its dev, one of its top-10 holders or a wallet the
//     dev funded sells it: one 'exit' alert in the bell (and a phone push), before the chart shows it.
//   GET /v1/radar                 Launch radar: every Pons launch gets a first-minute report (cron, launchReports):
//                                 snipers, same-block bundle, the dev's record, smart wallets in, a verdict.
//   GET /v1/hive/portfolio        Copy the hive: $100 into every hive buy signal, out on its sell signal.
//   GET /v1/season                Caller season: this week's callers ranked by how their calls moved.
import { Hono } from 'hono';
import type { Sql } from 'postgres';
import { fail, limit, publicCache, type Ctx } from './http';

export const radar = new Hono<Ctx>();

const DEAD = ['0x000000000000000000000000000000000000dead', '0x0000000000000000000000000000000000000000'];

// ---------------------------------------------------------------- Exit Alarm

/** A sale worth an alert: any dev sale, or a top holder / dev-funded wallet selling ≥0.3% of supply or ≥$150. */
const MIN_SHARE = 0.003;
const MIN_USD = 150;

export async function exitAlarm(sql: Sql): Promise<number> {
  const [st] = await sql<{ value: { at: string } }[]>`select value from indexer_state where key = 'exit_alarm_at'`;
  const since = st ? new Date(Math.max(new Date(st.value.at).getTime(), Date.now() - 15 * 60_000)) : new Date(Date.now() - 5 * 60_000);
  const until = new Date();
  const held = await sql<{ member_id: string; wallet: string; token: string }[]>`
    select m.id as member_id, b.wallet, b.token from members m join balances b on b.wallet = m.wallet
    where m.kind = 'human' and b.amount > 0`;
  let n = 0;
  const tokens = [...new Set(held.map((h) => h.token))];
  if (tokens.length) {
    const sells = await sql<{ token: string; trader: string; tx: string; log_index: number; amount: string; usd: number | null; time: Date; share: number; role: string }[]>`
      with t as (select address, deployer, total_supply from tokens where address = any(${tokens}::text[])),
      top as (
        select x.token, x.wallet from (
          select b.token, b.wallet, row_number() over (partition by b.token order by b.amount desc) as r
          from balances b where b.token = any(${tokens}::text[]) and b.amount > 0 and b.wallet <> all(${DEAD}::text[])
            and not exists (select 1 from pools p where p.id = b.wallet)
            and not exists (select 1 from tokens k where k.address = b.token and k.main_pool = b.wallet)
        ) x where x.r <= 10
      )
      select s.token, s.trader, s.tx, s.log_index, s.token_amount::text as amount, s.usd::float8 as usd, s.time,
        (s.token_amount / nullif(t.total_supply, 0))::float8 as share,
        case when s.trader = t.deployer then 'dev'
             when exists (select 1 from wallets w where w.address = s.trader and w.first_funder = t.deployer) then 'dev-funded wallet'
             else 'top holder' end as role
      from swaps s join t on t.address = s.token
      where s.side = 'sell' and s.time > ${since} and s.time <= ${until}
        and (s.trader = t.deployer
             or exists (select 1 from top where top.token = s.token and top.wallet = s.trader)
             or exists (select 1 from wallets w where w.address = s.trader and w.first_funder = t.deployer))`;
    for (const s of sells) {
      if (s.role !== 'dev' && s.share < MIN_SHARE && (s.usd ?? 0) < MIN_USD) continue;
      for (const h of held.filter((x) => x.token === s.token && x.wallet !== s.trader)) {
        n += (await sql`
          insert into wallet_alerts (id, member_id, wallet, kind, token, amount, usd, counterparty, tx, log_index, at)
          values (${`wa_ex_${h.member_id}_${s.tx.slice(2, 14)}_${s.log_index}`}, ${h.member_id}, ${s.trader}, 'exit', ${s.token},
            ${s.amount}, ${s.usd}, ${`${s.role}|${(s.share * 100).toFixed(2)}`}, ${s.tx}, ${s.log_index}, ${s.time})
          on conflict do nothing`).count;
      }
    }
  }
  await sql`insert into indexer_state (key, value) values ('exit_alarm_at', ${sql.json({ at: until.toISOString() })})
            on conflict (key) do update set value = excluded.value, updated_at = now()`;
  return n;
}

// ---------------------------------------------------------------- Launch radar

interface Report {
  buyers60: number; boughtShare60: number; boughtUsd60: number;
  bundleWallets: number; bundleShare: number;
  devBoughtShare: number; devLaunches: number; devLaunches7d: number; devRugs: number; devMigrated: number;
  smartIn: number; holders: number; mcap: number | null; risk: string | null; verdictNote: string | null;
  flags: string[]; good: string[];
}

function verdictOf(r: Report): { score: number; flags: string[]; good: string[] } {
  let score = 60;
  const flags: string[] = [];
  const good: string[] = [];
  if (r.bundleShare >= 0.2) { score -= 25; flags.push(`${Math.round(r.bundleShare * 100)}% of supply bought in the launch block`); }
  else if (r.bundleShare >= 0.08) { score -= 10; flags.push(`${Math.round(r.bundleShare * 100)}% bought in the launch block`); }
  if (r.boughtShare60 >= 0.4) { score -= 15; flags.push(`Snipers took ${Math.round(r.boughtShare60 * 100)}% in the first minute`); }
  if (r.devBoughtShare >= 0.05) { score -= 15; flags.push(`Dev bought ${Math.round(r.devBoughtShare * 100)}% at launch`); }
  if (r.devRugs > 0) { score -= 20; flags.push(`Dev has ${r.devRugs} rugged launch${r.devRugs > 1 ? 'es' : ''}`); }
  if (r.devLaunches7d >= 10) { score -= 15; flags.push(`Dev launched ${r.devLaunches7d} tokens this week`); }
  if (r.risk === 'high') { score -= 15; flags.push(r.verdictNote ?? 'High risk in Overmind\'s safety check'); }
  if (r.smartIn > 0) { score += 20; good.push(`${r.smartIn} smart wallet${r.smartIn > 1 ? 's' : ''} bought in`); }
  if (r.buyers60 >= 15) { score += 10; good.push(`${r.buyers60} buyers in the first minute`); }
  if (r.devMigrated > 0) { score += 10; good.push(`Dev has ${r.devMigrated} graduated token${r.devMigrated > 1 ? 's' : ''}`); }
  if (r.bundleShare < 0.02 && r.boughtShare60 < 0.2) good.push('No heavy bundle or sniping');
  return { score: Math.max(0, Math.min(100, score)), flags, good };
}

/** Pons launches 60 s to 30 min old without a report get one (at most 30 per run). */
export async function launchReports(sql: Sql): Promise<number> {
  const due = await sql<{ address: string; deployer: string; created_at: Date; created_block: string; supply: string }[]>`
    select t.address, t.deployer, t.created_at, t.created_block::text, t.total_supply::text as supply from tokens t
    where t.launchpad = 'pons' and t.created_at < now() - interval '60 seconds' and t.created_at > now() - interval '30 minutes'
      and not exists (select 1 from launch_reports r where r.token = t.address)
    order by t.created_at limit 30`;
  let n = 0;
  for (const t of due) {
    const [m] = await sql<{ buyers: number; share: number | null; usd: number | null; bw: number; bshare: number | null; dev: number | null; smart: number }[]>`
      with first as (select trader, token_amount, usd, block from swaps
        where token = ${t.address} and side = 'buy' and time <= ${t.created_at}::timestamptz + interval '60 seconds')
      select count(distinct trader)::int as buyers,
        (sum(token_amount) / ${t.supply}::numeric)::float8 as share, sum(usd)::float8 as usd,
        count(distinct trader) filter (where block <= ${t.created_block}::bigint + 1)::int as bw,
        (sum(token_amount) filter (where block <= ${t.created_block}::bigint + 1) / ${t.supply}::numeric)::float8 as bshare,
        (sum(token_amount) filter (where trader = ${t.deployer}) / ${t.supply}::numeric)::float8 as dev,
        (select count(distinct f.trader) from first f join smart_set s on s.wallet = f.trader)::int as smart
      from first`;
    const [dev] = await sql<{ launches: number; launches_7d: number; rugs: number; migrated: number }[]>`
      select launches, launches_7d, rugs, migrated from deployer_stats where deployer = ${t.deployer}`;
    const [tok] = await sql<{ holders: number; mcap: number | null }[]>`select holders, market_cap_usd::float8 as mcap from tokens where address = ${t.address}`;
    const [sig] = await sql<{ risk_level: string | null; verdict: string | null }[]>`select risk_level, verdict from signals where token = ${t.address}`;
    const base: Report = {
      buyers60: m?.buyers ?? 0, boughtShare60: m?.share ?? 0, boughtUsd60: m?.usd ?? 0,
      bundleWallets: m?.bw ?? 0, bundleShare: m?.bshare ?? 0, devBoughtShare: m?.dev ?? 0,
      devLaunches: dev?.launches ?? 1, devLaunches7d: dev?.launches_7d ?? 1, devRugs: dev?.rugs ?? 0, devMigrated: dev?.migrated ?? 0,
      smartIn: m?.smart ?? 0, holders: tok?.holders ?? 0, mcap: tok?.mcap ?? null,
      risk: sig?.risk_level ?? null, verdictNote: sig?.verdict ?? null, flags: [], good: [],
    };
    const v = verdictOf(base);
    n += (await sql`insert into launch_reports (token, report, score) values (${t.address}, ${sql.json({ ...base, flags: v.flags, good: v.good } as never)}, ${v.score})
                    on conflict (token) do nothing`).count;
  }
  return n;
}

radar.get('/radar', async (c) => {
  await limit(c, 'read');
  const lim = Math.min(Number(c.req.query('limit')) || 60, 150);
  const rows = await c.var.sql<{ token: string; report: Report; score: number; created_at: Date; symbol: string; name: string; image_url: string | null; launched: Date; mcap_now: number | null; holders_now: number; status: string }[]>`
    select r.token, r.report, r.score, r.created_at, t.symbol, t.name, t.image_url, t.created_at as launched,
      t.market_cap_usd::float8 as mcap_now, t.holders as holders_now, t.status
    from launch_reports r join tokens t on t.address = r.token
    order by t.created_at desc limit ${lim}`;
  return c.json({
    launches: rows.map((r) => ({
      token: { address: r.token, symbol: r.symbol, name: r.name, imageUrl: r.image_url, status: r.status },
      launchedAt: r.launched, score: r.score, verdict: r.score >= 65 ? 'clean' : r.score >= 40 ? 'mixed' : 'risky',
      report: r.report, now: { mcap: r.mcap_now, holders: r.holders_now },
    })),
  }, 200, publicCache(20));
});

// ---------------------------------------------------------------- Copy the hive

const STAKE = 100;

radar.get('/hive/portfolio', async (c) => {
  await limit(c, 'read');
  const scope = c.req.query('scope') === 'all' ? 'all' : 'pons';
  const days = Math.min(Math.max(Number(c.req.query('days')) || 30, 1), 30);
  const sigs = await c.var.sql<{ token: string; side: string; price: number | null; at: Date; symbol: string; image_url: string | null; price_now: number | null }[]>`
    select s.token, s.side, s.price_usd::float8 as price, s.at, t.symbol, t.image_url, t.price_usd::float8 as price_now
    from hive_signals s join tokens t on t.address = s.token
    where s.scope = ${scope} and s.at > now() - ${`${days} days`}::interval and s.price_usd > 0
    order by s.at`;
  type Pos = { token: string; symbol: string; imageUrl: string | null; openAt: Date; entry: number; closeAt: Date | null; exit: number | null; pnl: number | null; ret: number | null };
  const open = new Map<string, Pos>();
  const closed: Pos[] = [];
  const curve: { at: Date; realized: number }[] = [];
  let realized = 0;
  for (const s of sigs) {
    const p = open.get(s.token);
    if (s.side === 'buying' && !p) {
      open.set(s.token, { token: s.token, symbol: s.symbol, imageUrl: s.image_url, openAt: s.at, entry: s.price!, closeAt: null, exit: null, pnl: null, ret: null });
    } else if (s.side === 'selling' && p) {
      const ret = s.price! / p.entry - 1;
      Object.assign(p, { closeAt: s.at, exit: s.price, ret, pnl: STAKE * ret });
      realized += STAKE * ret;
      closed.push(p);
      open.delete(s.token);
      curve.push({ at: s.at, realized });
    }
  }
  const nowPrice = new Map(sigs.map((s) => [s.token, s.price_now]));
  const holding = [...open.values()].map((p) => {
    const px = nowPrice.get(p.token) ?? p.entry;
    const ret = px / p.entry - 1;
    return { ...p, exit: px, ret, pnl: STAKE * ret };
  });
  const unrealized = holding.reduce((s, p) => s + (p.pnl ?? 0), 0);
  const wins = closed.filter((p) => (p.ret ?? 0) > 0).length;
  const invested = (closed.length + holding.length) * STAKE;
  return c.json({
    scope, days, stake: STAKE,
    summary: {
      trades: closed.length + holding.length, closed: closed.length, open: holding.length, wins,
      winRate: closed.length ? wins / closed.length : null, invested, realized, unrealized,
      total: realized + unrealized, returnPct: invested ? (realized + unrealized) / invested : null,
      best: [...closed, ...holding].sort((a, b) => (b.ret ?? 0) - (a.ret ?? 0))[0] ?? null,
      worst: [...closed, ...holding].sort((a, b) => (a.ret ?? 0) - (b.ret ?? 0))[0] ?? null,
    },
    curve, open: holding.slice(-30).reverse(), closed: closed.slice(-40).reverse(),
  }, 200, publicCache(120));
});

// ---------------------------------------------------------------- Caller season

/** Monday 00:00 UTC of the week holding `d`. */
const weekStart = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
};

async function standings(sql: Sql, from: Date, to: Date) {
  const rows = await sql<{ author_id: string; handle: string; display_name: string | null; avatar_url: string | null; kind: string; stance: string; entry: number | null; now: number | null; token: string; symbol: string }[]>`
    select c.author_id, m.handle, m.display_name, m.avatar_url, m.kind, c.stance, coalesce(c.entry_price_usd, c.price_at_post_usd)::float8 as entry,
      t.price_usd::float8 as now, c.token, t.symbol
    from callouts c join members m on m.id = c.author_id join tokens t on t.address = c.token
    where c.created_at >= ${from} and c.created_at < ${to} and c.deleted_at is null and c.hidden_at is null`;
  const by = new Map<string, { id: string; handle: string; name: string | null; avatar: string | null; kind: string; calls: number; hits: number; sum: number; best: { symbol: string; move: number } | null }>();
  for (const r of rows) {
    if (!(r.entry && r.entry > 0) || r.now == null) continue;
    const raw = r.now / r.entry - 1;
    const move = Math.max(-1, Math.min(3, r.stance === 'bullish' ? raw : -raw));
    const a = by.get(r.author_id) ?? { id: r.author_id, handle: r.handle, name: r.display_name, avatar: r.avatar_url, kind: r.kind, calls: 0, hits: 0, sum: 0, best: null };
    a.calls++;
    a.sum += move;
    if (move > 0.02) a.hits++;
    if (!a.best || move > a.best.move) a.best = { symbol: r.symbol, move };
    by.set(r.author_id, a);
  }
  return [...by.values()]
    .map((a) => ({ member: { id: a.id, handle: a.handle, name: a.name, avatarUrl: a.avatar, kind: a.kind }, calls: a.calls, hitRate: a.hits / a.calls, avgMove: a.sum / a.calls, best: a.best, ranked: a.calls >= 2 }))
    .sort((x, y) => Number(y.ranked) - Number(x.ranked) || y.avgMove - x.avgMove);
}

radar.get('/season', async (c) => {
  await limit(c, 'read');
  const start = weekStart(new Date());
  const end = new Date(start.getTime() + 7 * 86400_000);
  const prev = new Date(start.getTime() - 7 * 86400_000);
  const [now, last] = await Promise.all([standings(c.var.sql, start, end), standings(c.var.sql, prev, start)]);
  return c.json({
    week: { start, end }, minCalls: 2,
    standings: now.slice(0, 50),
    lastWeek: { start: prev, winners: last.filter((s) => s.ranked).slice(0, 3) },
  }, 200, publicCache(60));
});

export { fail };
