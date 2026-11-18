// Hive alerts: re-read the hive on every starred token and alert its watchers when the reading flips.
//
// A token's side comes from its hive score: buying at +FLIP or above, selling at -FLIP or below, split in
// between (or with too few voters to mean anything). An alert fires when a token lands on buying or
// selling from a different side; drifting back to split is recorded but stays quiet, so a token that
// wobbles around zero doesn't spam anyone.
import type { Sql } from 'postgres';
import { randomId } from '@overmind/agents/crypto';
import { hiveToken } from './hive';

/** |score| at which the hive counts as buying or selling. */
export const FLIP = 20;
/** Fewer voters than this is too thin to call a side. */
const MIN_VOTERS = 3;
/** Tokens re-read per run (the most watched first). */
const MAX_TOKENS = 300;

export type Side = 'buying' | 'selling' | 'split';

export const sideOf = (score: number | null | undefined, voters: number): Side =>
  score == null || voters < MIN_VOTERS ? 'split' : score >= FLIP ? 'buying' : score <= -FLIP ? 'selling' : 'split';

/** Read one token's hive now and store it as the baseline (used when a token is first starred). */
export async function baseline(sql: Sql, token: string) {
  const row = await hiveToken(sql, token);
  const side = sideOf(row?.score, row?.voters ?? 0);
  await sql`
    insert into hive_watch_state (token, side, score, voters)
    values (${token}, ${side}, ${row?.score ?? null}, ${row?.voters ?? 0})
    on conflict (token) do nothing`;
}

/** One pass over the watched tokens. Returns how many alerts went out. */
export async function checkWatched(sql: Sql): Promise<{ tokens: number; flips: number; alerts: number }> {
  const tokens = await sql<{ token: string }[]>`
    select token from watchlist group by token order by count(*) desc limit ${MAX_TOKENS}`;
  let flips = 0;
  let alerts = 0;
  for (const { token } of tokens) {
    const row = await hiveToken(sql, token);
    const score = row?.score ?? null;
    const voters = row?.voters ?? 0;
    const side = sideOf(score, voters);
    const [prev] = await sql<{ side: Side; score: number | null }[]>`select side, score from hive_watch_state where token = ${token}`;
    await sql`
      insert into hive_watch_state (token, side, score, voters, updated_at)
      values (${token}, ${side}, ${score}, ${voters}, now())
      on conflict (token) do update set side = excluded.side, score = excluded.score, voters = excluded.voters, updated_at = now()`;
    if (!prev || prev.side === side || side === 'split') continue;
    flips++;
    const watchers = await sql<{ member_id: string }[]>`select member_id from watchlist where token = ${token}`;
    for (const w of watchers) {
      await sql`
        insert into hive_alerts (id, member_id, token, side, score, prev_side, prev_score)
        values (${`al_${randomId(14)}`}, ${w.member_id}, ${token}, ${side}, ${score}, ${prev.side}, ${prev.score})`;
      alerts++;
    }
  }
  return { tokens: tokens.length, flips, alerts };
}
