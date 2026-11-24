// $OVHIVE dev transparency on /burns: what the dev wallet bought, sold, burned and sent, and what the
// marketing wallets it funded did, sales included. All read live from the indexer (GET /ovhive/dev).
import { API_URL } from '@/lib/api';

interface Dev {
  dev: {
    wallet: string; holding: number;
    bought: { tokens: number; usd: number; trades: number };
    soldDirectly: { tokens: number; usd: number; trades: number };
    burned: number; burns: number; donated: number; sentToTeam: number;
  };
  team: { wallet: string; label: string; received: number; holding: number; soldTokens: number; soldUsd: number; boughtTokens: number; boughtUsd: number }[];
  teamNetSoldUsd: number;
  series: { at: string; balance: number }[];
  transfers: { at: string; direction: 'in' | 'out'; counterparty: string; label: string; amount: number; tx: string }[];
}

const EXPLORER = 'https://robinhoodchain.blockscout.com';
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
const m = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n0(n));
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const day = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

export async function getDev(): Promise<Dev | null> {
  try {
    const r = await fetch(`${API_URL}/ovhive/dev`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Dev) : null;
  } catch {
    return null;
  }
}

/** The dev wallet's $OVHIVE balance over time: up on buys, down on burns and transfers. */
function BalanceChart({ s }: { s: Dev['series'] }) {
  if (s.length < 2) return null;
  const W = 820, H = 150;
  const t0 = new Date(s[0]!.at).getTime(), t1 = new Date(s.at(-1)!.at).getTime();
  const max = Math.max(...s.map((p) => p.balance), 1);
  const X = (at: string) => 8 + ((new Date(at).getTime() - t0) / Math.max(1, t1 - t0)) * (W - 16);
  const Y = (b: number) => 8 + (1 - b / max) * (H - 24);
  let d = `M${X(s[0]!.at)},${Y(0)}`;
  for (const p of s) d += ` H${X(p.at).toFixed(1)} V${Y(p.balance).toFixed(1)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Dev wallet $OVHIVE balance over time">
      <defs><linearGradient id="dw-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f06ba8" stopOpacity=".28" /><stop offset="1" stopColor="#f06ba8" stopOpacity="0" /></linearGradient></defs>
      <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} stroke="currentColor" strokeOpacity=".12" />
      <path d={`${d} V${Y(0)} Z`} fill="url(#dw-fill)" />
      <path d={d} fill="none" stroke="#f06ba8" strokeWidth="1.8" />
      <text x="8" y={H - 2} fontSize="11" fill="currentColor" opacity=".5" fontFamily="var(--font-mono)">{day(s[0]!.at)}</text>
      <text x={W - 8} y={H - 2} fontSize="11" fill="currentColor" opacity=".5" textAnchor="end" fontFamily="var(--font-mono)">now: {n0(s.at(-1)!.balance)}</text>
    </svg>
  );
}

export function DevWallet({ d }: { d: Dev | null }) {
  if (!d) return null;
  const v = d.dev;
  const teamSold = d.team.reduce((s, t) => s + t.received - t.holding, 0);
  const stats: [string, string, string?][] = [
    ['Holds now', `${n0(v.holding)} $OVHIVE`],
    ['Bought on the curve', `${m(v.bought.tokens)} for ${usd(v.bought.usd)}`, `${v.bought.trades} buys`],
    ['Sold from the dev wallet', v.soldDirectly.trades ? `${m(v.soldDirectly.tokens)} for ${usd(v.soldDirectly.usd)}` : 'Nothing'],
    ['Burned', `${m(v.burned)}`, `${v.burns} burns, incl. ${m(v.donated)} donated by a holder`],
    ['Sent for marketing', `${m(v.sentToTeam)}`, `sold, ${usd(d.teamNetSoldUsd)} net`],
  ];
  return (
    <section id="dev" className="mt-4 rounded-2xl border border-ink/[0.07] bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Dev wallet, in full</h2>
        <a href={`${EXPLORER}/address/${v.wallet}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted hover:text-ink">{short(v.wallet)} ↗</a>
      </div>
      <p className="mt-1 text-sm text-muted">
        Everything the dev wallet did with $OVHIVE, read from Robinhood Chain, sales included. It holds {n0(v.holding)} today and burned {m(v.burned)}, more than it ever bought.
      </p>
      <BalanceChart s={d.series} />
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([k, val, sub]) => (
          <div key={k} className="rounded-xl bg-ink/[0.035] px-3.5 py-3">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="mt-0.5 font-mono text-base">{val}</dd>
            {sub && <dd className="mt-0.5 text-[11px] text-muted">{sub}</dd>}
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-sm font-semibold">Marketing wallets</h3>
      <p className="mt-1 text-xs text-muted">
        The dev sent {m(v.sentToTeam)} $OVHIVE to two marketing wallets. Both sold all of it, in small trades with some buybacks: {usd(d.team.reduce((s, t) => s + t.soldUsd, 0))} sold,{' '}
        {usd(d.team.reduce((s, t) => s + t.boughtUsd, 0))} bought back, {usd(d.teamNetSoldUsd)} net. {m(teamSold)} left those wallets; they hold {n0(d.team.reduce((s, t) => s + t.holding, 0))} now.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {d.team.map((t) => (
          <a key={t.wallet} href={`${EXPLORER}/address/${t.wallet}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-ink/[0.035] px-3.5 py-3 text-sm transition hover:bg-ink/[0.06]">
            <div className="flex justify-between"><span className="font-semibold">{t.label}</span><span className="font-mono text-xs text-muted">{short(t.wallet)} ↗</span></div>
            <div className="mt-1 font-mono text-xs text-muted">received {m(t.received)} · sold {usd(t.soldUsd)} · bought back {usd(t.boughtUsd)} · holds {n0(t.holding)}</div>
          </a>
        ))}
      </div>

      <details className="mt-5">
        <summary className="cursor-pointer text-sm font-semibold">Every dev wallet transfer ({d.transfers.length})</summary>
        <ul className="mt-2 max-h-[420px] overflow-y-auto pr-1">
          {d.transfers.map((t) => (
            <li key={`${t.tx}-${t.amount}-${t.direction}`}>
              <a href={`${EXPLORER}/tx/${t.tx}`} target="_blank" rel="noopener noreferrer" className="grid grid-cols-[120px_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 font-mono text-xs transition hover:bg-ink/[0.05]">
                <span className="text-muted">{day(t.at)}</span>
                <span className={t.direction === 'in' ? 'text-[#3ddc97]' : t.label === 'Burned' ? 'text-[#ffb547]' : 'text-[#ff5d6c]'}>
                  {t.direction === 'in' ? '+' : '−'}{n0(t.amount)} {t.direction === 'in' ? 'from' : 'to'} {t.label}
                </span>
                <span className="text-muted">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
