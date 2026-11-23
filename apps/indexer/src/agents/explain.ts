// "Explain this token": a plain-English read of a token, written by DeepSeek from Overmind's own data
// only (hive score and voters, risk checks, holders, curve, recent hive signals). The model gets the
// facts as JSON and is told to use nothing else, never to predict prices or say buy/sell.
//
//   GET /v1/hive/:address/explain          everyone: cached per token for CACHE_MS (one model call per
//                                          token per window, whoever asks), rate limited per IP.
//   GET /v1/hive/:address/explain?fresh=1  Hive Pro: a fresh read right now.
import { Hono } from 'hono';
import { tokenSummaries } from '../data';
import { hiveToken } from '../hive';
import { expensiveRead, fail, isAddr, limit, type Ctx } from './http';
import { proStatus } from './pro';

const CACHE_MS = 30 * 60_000;
const MODEL = 'deepseek-chat';
const API = 'https://api.deepseek.com/chat/completions';

const SYSTEM = `You are the analyst inside Overmind, a terminal for Robinhood Chain tokens.
Explain the token to a trader in plain English using ONLY the JSON facts you are given. Never use outside
knowledge about the token, never invent numbers, never predict prices, never tell anyone to buy, sell or hold.
Facts:
- hive.score runs -100 (the most profitable wallets are selling) to +100 (they are buying); hive.voters is how many
  smart wallets and member calls it is based on (under 5 is a thin read, say so).
- risk.level is Overmind's risk check; the percentages are shares of supply (top 10 holders, dev, snipers, bundles,
  insiders, fresh wallets).
- curve: Pons bonding curve progress; it graduates to Uniswap at 100%.
- signals: recent moments the smart crowd flipped side, with what the price did since.
Write 4-6 short bullet points ("- "), then one line starting "Bottom line:" that sums up the read neutrally.
If a fact is missing, say it is not available yet rather than guessing. Never write "null", "JSON" or field names. Under 130 words. No emojis, no hype.`;

type Cached = { at: number; text: string };
const cache = new Map<string, Cached>();

const pct = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);
const usdRound = (v: unknown) => (v == null ? null : Math.round(Number(v)));

async function facts(c: Parameters<typeof expensiveRead>[0], token: string) {
  const sql = c.var.sql;
  const [card] = (await tokenSummaries(sql, { addresses: [token] })) as Record<string, unknown>[];
  if (!card) throw fail(404, 'unknown_token', 'Overmind does not index this token.');
  const hive = await hiveToken(sql, token);
  const signals = await sql<{ side: string; voters: number; at: Date; price_usd: number | null }[]>`
    select side, voters, at, price_usd::float8 as price_usd from hive_signals
    where token = ${token} and at > now() - interval '3 days' order by at desc limit 4`;
  const price = card.price_usd == null ? null : Number(card.price_usd);
  return {
    token: { symbol: card.symbol, name: card.name, launchpad: card.launchpad, status: card.status, age_hours: card.created_at ? Math.round((Date.now() - new Date(card.created_at as string).getTime()) / 3600_000) : null },
    market: { market_cap_usd: usdRound(card.market_cap_usd), ath_market_cap_usd: usdRound(card.ath_market_cap_usd), volume_24h_usd: usdRound(card.volume_24h_usd), trades_24h: card.trades_24h, liquidity_usd: usdRound(card.liquidity_usd), holders: card.holders },
    curve: card.bonding_progress == null ? null : { progress_pct: pct(Number(card.bonding_progress) * 100) },
    hive: hive ? { score: hive.score, voters: hive.voters, smart_buyers: hive.smart_buyers, smart_sellers: hive.smart_sellers, bullish_calls: hive.bullish_calls, bearish_calls: hive.bearish_calls } : null,
    risk: {
      level: card.risk ?? null, verdict: card.verdict ?? null,
      top10_pct: pct(card.top10_pct), dev_pct: pct(card.dev_pct), snipers_pct: pct(card.snipers_pct), bundled_pct: pct(card.bundled_pct),
      insiders_pct: pct(card.insiders_pct), fresh_wallets_pct: pct(card.fresh_pct), copycat: card.copycat ?? null, serial_launcher: card.serial_launcher ?? null,
      buy_tax_pct: card.buy_tax_bps == null ? null : Number(card.buy_tax_bps) / 100, sell_tax_pct: card.sell_tax_bps == null ? null : Number(card.sell_tax_bps) / 100,
    },
    signals: signals.map((s) => ({
      side: s.side, voters: s.voters, hours_ago: Math.round((Date.now() - s.at.getTime()) / 3600_000),
      price_change_since_pct: s.price_usd && price ? Math.round((price / s.price_usd - 1) * 100) : null,
    })),
  };
}

async function ask(key: string, data: unknown): Promise<string> {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL, temperature: 0.3, max_tokens: 400,
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: JSON.stringify(data) }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw fail(503, 'ai_failed', `The AI analyst is unavailable right now (${r.status}).`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw fail(503, 'ai_failed', 'The AI analyst returned nothing.');
  return text;
}

export const explain = new Hono<Ctx>();

explain.get('/hive/:address/explain', async (c) => {
  const token = (c.req.param('address') ?? '').toLowerCase();
  if (!isAddr(token)) throw fail(422, 'invalid_address', 'Not a token address.');
  const key = c.env.DEEPSEEK_API_KEY;
  if (!key) throw fail(503, 'ai_off', 'The AI analyst is not switched on yet.');
  const fresh = c.req.query('fresh') === '1';
  if (fresh) {
    const s = await proStatus(c);
    if (!s.pro) throw fail(403, 'pro_required', `Hold ${s.threshold.toLocaleString('en-US')} $OVHIVE for a fresh read on demand.`);
    await limit(c, 'write');
  } else {
    await expensiveRead(c);
    const hit = cache.get(token);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return c.json({ token, text: hit.text, at: new Date(hit.at).toISOString(), cached: true, model: MODEL }, 200, { 'cache-control': 'public, max-age=60' });
    }
  }
  const text = await ask(key, await facts(c, token));
  const at = Date.now();
  cache.set(token, { at, text });
  if (cache.size > 2000) cache.clear();
  return c.json({ token, text, at: new Date(at).toISOString(), cached: false, model: MODEL }, 200, { 'cache-control': fresh ? 'private, no-store' : 'public, max-age=60' });
});
