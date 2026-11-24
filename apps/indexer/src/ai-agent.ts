// @overmind_ai: an Overmind agent that posts one call every few hours on the Pons token the smart crowd
// leans on hardest. The stance comes straight from the hive score (never from the model); DeepSeek only
// writes the reasoning, from Overmind's facts. Its calls go through the same feed and leaderboard as
// anyone's, so its hit rate is public.
import type { Sql } from 'postgres';
import { randomId } from '@overmind/agents/crypto';
import { AI_RULES, deepseek, tokenFacts } from './ai';
import { hiveBoard } from './hive';

export const AGENT_ID = 'm_overmind_ai';
const HANDLE = 'overmind_ai';
/** Placeholder wallet (members need one): the agent never trades. */
const AGENT_WALLET = '0x000000000000000000000000000000000000a1a1';
const MIN_VOTERS = 5;
const MIN_SCORE = 40;

const CALL = `You are @overmind_ai, the analyst agent of Overmind on Robinhood Chain. Write the text of one call on a token.
The stance is already decided from the hive score and is given to you: explain it, don't change it.
${AI_RULES}
Return a JSON object {"body": "..."}. body: under 260 characters, start with "$TICKER", give the hive score and how many
smart wallets are in vs out, one risk fact (risk level or top-10 share), and end with "Not financial advice."`;

async function ensureAgent(sql: Sql) {
  await sql`
    insert into members (id, kind, origin, handle, wallet, display_name, bio)
    values (${AGENT_ID}, 'agent', 'self', ${HANDLE}, ${AGENT_WALLET}, 'Overmind AI',
      'Calls written by AI (DeepSeek) from Overmind data. The stance always follows the hive score. Not financial advice.')
    on conflict (id) do nothing`;
}

/** Post one call if a Pons token has a clear, well-supported hive read the agent hasn't called in 24h. */
export async function agentCall(sql: Sql, key: string | undefined): Promise<string | null> {
  if (!key) return null;
  await ensureAgent(sql);
  const { tokens } = await hiveBoard(sql, 60, 'pons');
  const recent = new Set(
    (await sql<{ token: string }[]>`select token from callouts where author_id = ${AGENT_ID} and created_at > now() - interval '24 hours'`).map((r) => r.token),
  );
  const pick = tokens
    .filter((t) => t.voters >= MIN_VOTERS && Math.abs(t.score) >= MIN_SCORE && !recent.has(t.token))
    .sort((a, b) => b.voters - a.voters || Math.abs(b.score) - Math.abs(a.score))[0];
  if (!pick) return null;
  const facts = await tokenFacts(sql, pick.token);
  if (!facts) return null;
  const stance = pick.score > 0 ? 'bullish' : 'bearish';
  const raw = await deepseek(key, CALL, { stance, ...facts }, { json: true, maxTokens: 220 });
  let body = '';
  try {
    body = String((JSON.parse(raw) as { body?: unknown }).body ?? '').trim();
  } catch {
    return null;
  }
  if (body.length < 20) return null;
  if (body.length > 480) body = `${body.slice(0, 470)}…`;
  if (!/not financial advice/i.test(body)) body = `${body} Not financial advice.`;
  const [t] = await sql<{ price_usd: string | null; market_cap_usd: string | null }[]>`select price_usd, market_cap_usd from tokens where address = ${pick.token}`;
  const id = `c_${randomId(14)}`;
  await sql`
    insert into callouts (id, author_id, token, stance, body, price_at_post_usd, mcap_at_post_usd)
    values (${id}, ${AGENT_ID}, ${pick.token}, ${stance}, ${body}, ${t?.price_usd ?? null}, ${t?.market_cap_usd ?? null})`;
  return `${pick.symbol} ${stance}`;
}
