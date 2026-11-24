// Overmind AI (DeepSeek, from Overmind's own data only; ../ai.ts):
//
//   GET  /v1/hive/:address/explain          plain-English read of a token. Everyone: cached per token for
//                                           CACHE_MS. ?fresh=1: Hive Pro, a fresh read right now.
//   POST /v1/hive/:address/ask              { question }: Hive Pro asks its own question about a token.
//   GET  /v1/hive/signals/:id/why           why a hive signal fired (the smart flows behind it). Signals still
//                                           inside the public delay are Hive Pro only, like the feed.
//   GET  /v1/ai/daily?scope=pons|all        today's Hive Daily as a ready-to-post tweet (cached 6h).
import { Hono } from 'hono';
import { AI_MODEL, AI_RULES, AiError, deepseek, tokenFacts } from '../ai';
import { hiveDaily, asScope, smartWallets } from '../hive';
import { PUBLIC_DELAY } from '../signals-hive';
import { expensiveRead, fail, isAddr, limit, PRIVATE, type C, type Ctx } from './http';
import { proStatus } from './pro';

const CACHE_MS = 30 * 60_000;
const DAILY_MS = 6 * 3600_000;

const EXPLAIN = `You are the analyst inside Overmind, a terminal for Robinhood Chain tokens. Explain the token to a trader.
${AI_RULES}
Write 4-6 short bullet points ("- "): the smart-wallet read, risk flags, holder concentration, curve or migration status,
recent signals. Then one line starting "Bottom line:" that sums it up neutrally. Under 130 words.`;

const ASK = `You are the analyst inside Overmind, a terminal for Robinhood Chain tokens. Answer the trader's question about
the token in under 90 words.
${AI_RULES}
The facts also hold the top holders (share of supply; dev, smart wallet and burn flags) and the latest trades. If the
facts can't answer the question, say exactly that and say what Overmind does show. Never answer questions unrelated
to the token.`;

const WHY = `You are the analyst inside Overmind. A "hive signal" fires when the side of the chain's most profitable
wallets on a token changes. Explain in 3 short bullet points ("- ") why this one fired: how many smart wallets were
buying versus selling in the 24 hours before it, how many dollars moved, and what the token did since. Then one line
starting "Bottom line:". Under 90 words.
${AI_RULES}`;

const DAILY = `You write the daily post for Overmind (@0xovermind) on X. From the Hive Daily facts (what the most profitable
Pons wallets net bought and sold in the last 24h), write one tweet under 260 characters: a short hook, the top 2-3
buying tokens and the top 1-2 selling tokens with their $ flows, then "Live: overmind.ink/daily". Use $TICKER
format. No hashtags, no emojis except at most one 🐝 at the end, no advice, no predictions.
${AI_RULES}`;

const cache = new Map<string, { at: number; text: string }>();
const remember = (k: string, text: string) => {
  cache.set(k, { at: Date.now(), text });
  if (cache.size > 3000) cache.clear();
};
const fresh = (k: string, ttl: number) => {
  const hit = cache.get(k);
  return hit && Date.now() - hit.at < ttl ? hit : null;
};

function keyOf(c: C): string {
  const key = c.env.DEEPSEEK_API_KEY;
  if (!key) throw fail(503, 'ai_off', 'The AI analyst is not switched on yet.');
  return key;
}

async function run<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof AiError) throw fail(503, 'ai_failed', 'The AI analyst is unavailable right now. Try again in a minute.');
    throw e;
  }
}

function tokenParam(c: C): string {
  const token = (c.req.param('address') ?? '').toLowerCase();
  if (!isAddr(token)) throw fail(422, 'invalid_address', 'Not a token address.');
  return token;
}

async function requirePro(c: C, what: string) {
  const s = await proStatus(c);
  if (!s.pro) throw fail(403, 'pro_required', `Hold ${s.threshold.toLocaleString('en-US')} $OVHIVE for ${what}.`);
}

export const explain = new Hono<Ctx>();

explain.get('/hive/:address/explain', async (c) => {
  const token = tokenParam(c);
  const key = keyOf(c);
  const wantFresh = c.req.query('fresh') === '1';
  if (wantFresh) {
    await requirePro(c, 'a fresh read on demand');
    await limit(c, 'write');
  } else {
    await expensiveRead(c);
    const hit = fresh(`x:${token}`, CACHE_MS);
    if (hit) return c.json({ token, text: hit.text, at: new Date(hit.at).toISOString(), cached: true, model: AI_MODEL }, 200, { 'cache-control': 'public, max-age=60' });
  }
  const facts = await tokenFacts(c.var.sql, token);
  if (!facts) throw fail(404, 'unknown_token', 'Overmind does not index this token.');
  const text = await run(() => deepseek(key, EXPLAIN, facts));
  remember(`x:${token}`, text);
  return c.json({ token, text, at: new Date().toISOString(), cached: false, model: AI_MODEL }, 200, { 'cache-control': wantFresh ? 'private, no-store' : 'public, max-age=60' });
});

explain.post('/hive/:address/ask', async (c) => {
  const token = tokenParam(c);
  const key = keyOf(c);
  await requirePro(c, 'Ask the hive');
  await limit(c, 'write');
  const q = (c.var.body as { question?: unknown } | undefined)?.question;
  const question = typeof q === 'string' ? q.trim().slice(0, 240) : '';
  if (question.length < 3) throw fail(422, 'invalid_question', 'Ask a question about this token.');
  const sql = c.var.sql;
  const facts = await tokenFacts(sql, token);
  if (!facts) throw fail(404, 'unknown_token', 'Overmind does not index this token.');
  const holders = await sql<{ wallet: string; pct: number | null; deployer: boolean }[]>`
    select b.wallet, (b.amount / nullif(t.total_supply, 0) * 100)::float8 as pct, b.wallet = lower(coalesce(t.deployer, '')) as deployer
    from balances b join tokens t on t.address = b.token
    where b.token = ${token} and b.amount > 0 order by b.amount desc limit 10`;
  const smart = new Set(await smartWallets(sql, facts.token.launchpad === 'pons' ? 'pons' : 'all'));
  const trades = await sql<{ side: string; usd: number | null; trader: string; time: Date }[]>`
    select side, usd::float8 as usd, trader, time from swaps where token = ${token} order by time desc limit 15`;
  const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
  const data = {
    ...facts,
    top_holders: holders.map((h) => ({ wallet: short(h.wallet), share_pct: h.pct == null ? null : Math.round(h.pct * 10) / 10, dev: h.deployer,
      smart_wallet: smart.has(h.wallet), burn: /^0x0{36}dead$|^0x0{40}$/.test(h.wallet) })),
    latest_trades: trades.map((t) => ({ side: t.side, usd: t.usd == null ? null : Math.round(t.usd), wallet: short(t.trader), smart_wallet: smart.has(t.trader),
      minutes_ago: Math.round((Date.now() - t.time.getTime()) / 60_000) })),
    question,
  };
  const text = await run(() => deepseek(key, ASK, data, { maxTokens: 300 }));
  return c.json({ token, question, text, at: new Date().toISOString(), model: AI_MODEL }, 200, PRIVATE);
});

explain.get('/hive/signals/:id/why', async (c) => {
  const key = keyOf(c);
  const id = c.req.param('id') ?? '';
  const sql = c.var.sql;
  const [s] = await sql<{ id: string; scope: string; token: string; side: string; score: number; prev_side: string | null; prev_score: number | null; voters: number; at: Date; price_usd: number | null; delayed: boolean }[]>`
    select id, scope, token, side, score, prev_side, prev_score, voters, at, price_usd::float8 as price_usd,
      at < now() - ${PUBLIC_DELAY}::interval as delayed
    from hive_signals where id = ${id}`;
  if (!s) throw fail(404, 'not_found', 'No such signal.');
  if (!s.delayed) await requirePro(c, 'real-time signals');
  else await expensiveRead(c);
  const hit = fresh(`w:${id}`, 365 * 86400_000);
  if (hit) return c.json({ id, text: hit.text, cached: true, model: AI_MODEL }, 200, { 'cache-control': 'public, max-age=300' });
  const smart = await smartWallets(sql, s.scope === 'pons' ? 'pons' : 'all');
  const [flow] = await sql<{ buyers: number; sellers: number; usd_in: number | null; usd_out: number | null }[]>`
    with f as (
      select trader,
        sum(case when side = 'buy' then coalesce(usd, 0) else 0 end) as bought,
        sum(case when side = 'sell' then coalesce(usd, 0) else 0 end) as sold,
        sum(case when side = 'buy' then token_amount else -token_amount end) as net_tok
      from swaps
      where token = ${s.token} and trader = any(${smart}::text[]) and time > ${s.at}::timestamptz - interval '24 hours' and time <= ${s.at}
      group by trader
    )
    select count(*) filter (where net_tok > 0 and bought > sold)::int as buyers,
      count(*) filter (where sold > bought or net_tok < 0)::int as sellers,
      sum(bought)::float8 as usd_in, sum(sold)::float8 as usd_out from f`;
  const facts = await tokenFacts(sql, s.token);
  const data = {
    signal: { side: s.side, from_side: s.prev_side, score: s.score, previous_score: s.prev_score, voters: s.voters, hours_ago: Math.round((Date.now() - s.at.getTime()) / 3600_000),
      price_change_since_pct: s.price_usd && facts?.market.price_usd ? Math.round((facts.market.price_usd / s.price_usd - 1) * 100) : null },
    smart_flow_24h_before: { buying_wallets: flow?.buyers ?? 0, selling_wallets: flow?.sellers ?? 0, usd_bought: Math.round(flow?.usd_in ?? 0), usd_sold: Math.round(flow?.usd_out ?? 0) },
    token: facts?.token, risk: facts?.risk,
  };
  const text = await run(() => deepseek(key, WHY, data, { maxTokens: 250 }));
  remember(`w:${id}`, text);
  return c.json({ id, text, cached: false, model: AI_MODEL }, 200, { 'cache-control': 'public, max-age=300' });
});

explain.get('/ai/daily', async (c) => {
  const key = keyOf(c);
  const scope = asScope(c.req.query('scope') ?? 'pons');
  await expensiveRead(c);
  const hit = fresh(`d:${scope}`, DAILY_MS);
  if (hit) return c.json({ scope, text: hit.text, at: new Date(hit.at).toISOString(), cached: true, model: AI_MODEL }, 200, { 'cache-control': 'public, max-age=300' });
  const d = await hiveDaily(c.var.sql, 5, scope);
  const slim = (r: { symbol: string; net_usd: number; buyers: number; sellers: number; market_cap_usd: number | null }) =>
    ({ ticker: r.symbol, net_usd: Math.round(r.net_usd), wallets_in: r.buyers, wallets_out: r.sellers, market_cap_usd: r.market_cap_usd == null ? null : Math.round(r.market_cap_usd) });
  const data = { scope, smart_wallets: d.smart_wallets, buying: d.buying.map(slim), selling: d.selling.map(slim) };
  const text = await run(() => deepseek(key, DAILY, data, { maxTokens: 200, temperature: 0.5 }));
  remember(`d:${scope}`, text);
  return c.json({ scope, text, at: new Date().toISOString(), cached: false, model: AI_MODEL }, 200, { 'cache-control': 'public, max-age=300' });
});
