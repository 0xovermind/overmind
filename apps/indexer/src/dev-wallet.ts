// $OVHIVE dev transparency (GET /ovhive/dev): everything the dev wallet did with $OVHIVE, read live from the
// index, plus the team wallets the dev sent tokens to and what they did with them, sales included. Nothing
// is typed in by hand: buys, sales, burns and transfers all come from swaps and transfers.
import type { Sql } from 'postgres';

export const OVHIVE = '0x53d38ba0c217cd4d1f74a36503731023fcd7f358';
export const DEV = '0xbd88c8aad2928a4a116530fa98f2e7d7d3ea56f9';
/** Marketing wallets the dev moved $OVHIVE to (both sold everything they received; the response shows it). */
export const TEAM: { wallet: string; label: string }[] = [
  { wallet: '0xf9c8a0a76e2aa075544695c538a23c09fb48635b', label: 'Marketing wallet 1' },
  { wallet: '0x0ffade51a13b43739e6035beb6efbef15baa875d', label: 'Marketing wallet 2 (Fomo)' },
];
const DEAD = ['0x000000000000000000000000000000000000dead', '0x0000000000000000000000000000000000000000'];
const CURVE = '0x4ab8320c6792e9605b15772d8952f5b3d67a9875';
const DONOR = '0xd4a0c4a9497eee4921ffdf956dafb8e3a190e7bf';
const UNIT = 1e18;

interface Tr { time: Date; from: string; to: string; amount: number; tx: string }

function labelOf(addr: string) {
  if (DEAD.includes(addr)) return 'Burned';
  if (addr === CURVE) return 'Pons curve';
  if (addr === DONOR) return 'Holder donation';
  return TEAM.find((t) => t.wallet === addr)?.label ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Tokens and dollars a wallet sold and bought back, from the swaps in the transactions that moved its tokens. */
async function tradesOf(sql: Sql, wallet: string) {
  const rows = await sql<{ dir: 'out' | 'in'; tokens: number; usd: number | null }[]>`
    with t as (
      select tx, case when "from" = ${wallet} then 'out' else 'in' end as dir
      from transfers where token = ${OVHIVE} and ${wallet} in ("from", "to") and "from" <> ${DEV} and "to" <> ${DEV}
      group by tx, 2
    )
    select t.dir, (sum(s.token_amount) / ${UNIT})::float8 as tokens, sum(s.usd)::float8 as usd
    from t join swaps s on s.tx = t.tx and s.token = ${OVHIVE}
    group by t.dir`;
  const sold = rows.find((r) => r.dir === 'out');
  const bought = rows.find((r) => r.dir === 'in');
  return { soldTokens: sold?.tokens ?? 0, soldUsd: sold?.usd ?? 0, boughtTokens: bought?.tokens ?? 0, boughtUsd: bought?.usd ?? 0 };
}

export async function devWallet(sql: Sql) {
  const trs = (await sql<{ time: Date; from: string; to: string; amount: string; tx: string }[]>`
    select time, "from", "to", amount::text, tx from transfers
    where token = ${OVHIVE} and ${DEV} in ("from", "to") order by time, log_index`).map((r) => ({ ...r, amount: Number(BigInt(r.amount) / 10n ** 12n) / 1e6 })) as Tr[];
  const [swaps] = await sql<{ buys: number; bought: number | null; spent: number | null; sells: number; sold: number | null; got: number | null }[]>`
    select count(*) filter (where side = 'buy')::int as buys, (sum(token_amount) filter (where side = 'buy') / ${UNIT})::float8 as bought,
      sum(usd) filter (where side = 'buy')::float8 as spent, count(*) filter (where side = 'sell')::int as sells,
      (sum(token_amount) filter (where side = 'sell') / ${UNIT})::float8 as sold, sum(usd) filter (where side = 'sell')::float8 as got
    from swaps where token = ${OVHIVE} and trader = ${DEV}`;
  const [bal] = await sql<{ amount: string | null }[]>`select amount::text from balances where token = ${OVHIVE} and wallet = ${DEV}`;
  let running = 0;
  const series = trs.map((t) => {
    running += t.to === DEV ? t.amount : -t.amount;
    return { at: t.time, balance: Math.max(0, running) };
  });
  const sum = (f: (t: Tr) => boolean) => trs.filter(f).reduce((s, t) => s + t.amount, 0);
  const burned = sum((t) => t.from === DEV && DEAD.includes(t.to));
  const donated = sum((t) => t.to === DEV && t.from === DONOR);
  const toTeam = TEAM.map((m) => ({ ...m, received: sum((t) => t.from === DEV && t.to === m.wallet) }));
  const team = await Promise.all(toTeam.map(async (m) => {
    const [b] = await sql<{ amount: string | null }[]>`select amount::text from balances where token = ${OVHIVE} and wallet = ${m.wallet}`;
    return { ...m, holding: b?.amount ? Number(BigInt(b.amount) / 10n ** 12n) / 1e6 : 0, ...(await tradesOf(sql, m.wallet)) };
  }));
  const soldNet = team.reduce((s, m) => s + (m.soldUsd - m.boughtUsd), 0);
  return {
    token: OVHIVE,
    dev: {
      wallet: DEV,
      holding: bal?.amount ? Number(BigInt(bal.amount) / 10n ** 12n) / 1e6 : 0,
      bought: { tokens: swaps?.bought ?? 0, usd: swaps?.spent ?? 0, trades: swaps?.buys ?? 0 },
      soldDirectly: { tokens: swaps?.sold ?? 0, usd: swaps?.got ?? 0, trades: swaps?.sells ?? 0 },
      burned, burns: trs.filter((t) => t.from === DEV && DEAD.includes(t.to)).length, donated,
      sentToTeam: toTeam.reduce((s, m) => s + m.received, 0),
    },
    team,
    teamNetSoldUsd: soldNet,
    series,
    transfers: trs.slice().reverse().map((t) => ({
      at: t.time, direction: t.to === DEV ? 'in' : 'out', counterparty: t.to === DEV ? t.from : t.to,
      label: labelOf(t.to === DEV ? t.from : t.to), amount: t.amount, tx: t.tx,
    })),
  };
}
