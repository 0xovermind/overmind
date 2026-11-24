// DeepSeek plumbing shared by every Overmind AI feature (token explainer, agent calls, daily recap,
// signal "why", ask the hive). The model only ever sees facts we hand it as JSON.
import type { Sql } from 'postgres';
import { tokenSummaries } from './data';
import { hiveToken } from './hive';

export const AI_MODEL = 'deepseek-chat';
const API = 'https://api.deepseek.com/chat/completions';

export class AiError extends Error {}

/** One chat completion. `json`: ask for a JSON object back (parsed by the caller). */
export async function deepseek(key: string, system: string, user: unknown, opts: { maxTokens?: number; json?: boolean; temperature?: number } = {}): Promise<string> {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 400,
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [{ role: 'system', content: system }, { role: 'user', content: typeof user === 'string' ? user : JSON.stringify(user) }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new AiError(`deepseek ${r.status}`);
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError('deepseek returned nothing');
  return text;
}

const pct = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);
const usd = (v: unknown) => (v == null ? null : Math.round(Number(v)));

/** The facts every token read starts from: market, curve, hive, risk checks and recent hive signals. */
export async function tokenFacts(sql: Sql, token: string) {
  const [card] = (await tokenSummaries(sql, { addresses: [token] })) as Record<string, unknown>[];
  if (!card) return null;
  const hive = await hiveToken(sql, token);
  const signals = await sql<{ side: string; voters: number; at: Date; price_usd: number | null }[]>`
    select side, voters, at, price_usd::float8 as price_usd from hive_signals
    where token = ${token} and at > now() - interval '3 days' order by at desc limit 4`;
  const price = card.price_usd == null ? null : Number(card.price_usd);
  return {
    token: { symbol: card.symbol, name: card.name, launchpad: card.launchpad, status: card.status, age_hours: card.created_at ? Math.round((Date.now() - new Date(card.created_at as string).getTime()) / 3600_000) : null },
    market: { price_usd: price, market_cap_usd: usd(card.market_cap_usd), ath_market_cap_usd: usd(card.ath_market_cap_usd), volume_24h_usd: usd(card.volume_24h_usd), trades_24h: card.trades_24h, liquidity_usd: usd(card.liquidity_usd), holders: card.holders },
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

/** Rules every prompt shares: facts only, no advice, plain words. */
export const AI_RULES = `Use ONLY the JSON facts you are given. Never use outside knowledge about the token, never invent
numbers, never predict prices, never tell anyone to buy, sell or hold. If a fact is missing, say it is not
available yet. Never write "null", "JSON" or field names. Plain English, no emojis, no hype.
hive.score runs -100 (the chain's most profitable wallets are selling) to +100 (they are buying); hive.voters is
how many smart wallets and member calls it rests on (under 5 is a thin read). risk percentages are shares of supply.`;
