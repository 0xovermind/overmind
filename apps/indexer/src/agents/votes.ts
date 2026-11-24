// Crowd vote (/v1/tokens/:address/votes): one click, bullish or bearish, no account needed. A visitor is
// a salted IP hash, a signed-in member their member id; one vote per token each, changeable. Counted over
// the last WINDOW. Shown beside the hive score and kept out of it: anonymous votes are cheap to farm, the
// hive score only counts smart wallets and member calls.
import { Hono } from 'hono';
import { fail, isAddr, limit, PRIVATE, type C, type Ctx } from './http';

const WINDOW = '24 hours';

export const votes = new Hono<Ctx>();

const voterOf = (c: C) => (c.var.viewer.member ? `m:${c.var.viewer.member.id}` : `ip:${c.var.ipHash}`);

function tokenParam(c: C): string {
  const a = (c.req.param('address') ?? '').toLowerCase();
  if (!isAddr(a)) throw fail(422, 'invalid_address', 'Expected a token address (0x + 40 hex).');
  return a;
}

async function tally(c: C, token: string) {
  const [t] = await c.var.sql<{ bullish: number; bearish: number }[]>`
    select count(*) filter (where stance = 'bullish')::int as bullish, count(*) filter (where stance = 'bearish')::int as bearish
    from token_votes where token = ${token} and updated_at > now() - ${WINDOW}::interval`;
  const [mine] = await c.var.sql<{ stance: string }[]>`
    select stance from token_votes where token = ${token} and voter = ${voterOf(c)} and updated_at > now() - ${WINDOW}::interval`;
  const bullish = t?.bullish ?? 0;
  const bearish = t?.bearish ?? 0;
  return { token, bullish, bearish, total: bullish + bearish, mine: mine?.stance ?? null, window: WINDOW };
}

votes.get('/tokens/:address/votes', async (c) => c.json(await tally(c, tokenParam(c)), 200, PRIVATE));

/** Body: { stance: 'bullish' | 'bearish' }. Voting the same side again keeps it; the other side switches. */
votes.post('/tokens/:address/votes', async (c) => {
  await limit(c, 'write');
  const token = tokenParam(c);
  const stance = (c.var.body as { stance?: unknown } | undefined)?.stance;
  if (stance !== 'bullish' && stance !== 'bearish') throw fail(422, 'invalid_stance', 'stance must be bullish or bearish.');
  const [known] = await c.var.sql`select 1 from tokens where address = ${token}`;
  if (!known) throw fail(404, 'unknown_token', 'Overmind does not index this token.');
  await c.var.sql`
    insert into token_votes (token, voter, stance) values (${token}, ${voterOf(c)}, ${stance})
    on conflict (token, voter) do update set stance = excluded.stance, updated_at = now()`;
  return c.json(await tally(c, token), 200, PRIVATE);
});
