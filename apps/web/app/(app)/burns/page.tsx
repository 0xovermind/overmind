import type { Metadata } from 'next';
import { API_URL } from '@/lib/api';
import { appShare } from '@/lib/share';
import { OVHIVE_BUY_URL } from '@/lib/pro';
import { OVHIVE_CA, OVHIVE_TRADE_URL } from '@/lib/ovhive';
import { usd } from '@/lib/format';

export const metadata: Metadata = appShare('$OVHIVE burns', '/burns', 'Every $OVHIVE burn, read from Robinhood Chain: how much has been sent to the dead address so far.');
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

interface Burn { tx: string; block: number; time: string | null; from: string; to: 'dead' | 'zero'; amount: number }
interface Burns { token: string; supply: number; total: number; share: number; count: number; updatedAt: string; burns: Burn[] }

const EXPLORER = 'https://robinhoodchain.blockscout.com';
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : '—';

interface Card { bonding_progress: number | null; status: string; market_cap_usd: number | null; holders: number | null }
/** Pons ETH curves graduate at 4.2 ETH in the curve (indexer curves.ts reads each curve's threshold). */
const GRAD_ETH = 4.2;

async function getCard(): Promise<Card | null> {
  try {
    const r = await fetch(`${API_URL}/tokens/${OVHIVE_CA}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Card) : null;
  } catch {
    return null;
  }
}

/** $OVHIVE's way off the Pons curve: live curve fill, what's left, and what happens next. */
function RoadToUniswap({ c }: { c: Card | null }) {
  const migrated = c?.status === 'migrated';
  const p = migrated ? 1 : Math.min(Math.max(c?.bonding_progress ?? 0, 0), 1);
  const filled = p * GRAD_ETH;
  const steps = [
    { label: 'Pons curve', note: migrated ? 'filled' : `${(p * 100).toFixed(0)}% filled`, done: migrated, now: !migrated },
    { label: 'Uniswap', note: 'liquidity moves on graduation', done: migrated, now: false },
    { label: 'DEX Screener', note: 'profile, logo, socials', done: false, now: migrated },
  ];
  return (
    <section className="mt-4 rounded-2xl border border-ink/[0.07] bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">Road to Uniswap</p>
        {c?.market_cap_usd != null && (
          <p className="font-mono text-xs text-muted">mcap {usd(c.market_cap_usd)}</p>
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="burn-total font-mono text-4xl font-semibold tracking-tight">{(p * 100).toFixed(1)}%</span>
        <span className="text-base">{migrated ? 'graduated to Uniswap' : 'of the Pons curve filled'}</span>
      </div>
      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-ink/[0.06]">
        <div className="sync-fill h-full rounded-full" style={{ width: `${Math.max(p * 100, 0.6)}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-xs text-muted">
        <span>{filled.toFixed(2)} of {GRAD_ETH.toFixed(2)} ETH</span>
        {!migrated && <span>≈ {(GRAD_ETH - filled).toFixed(2)} ETH to graduate</span>}
      </div>
      <ol className="mt-5 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className={`rounded-xl border px-3 py-2.5 ${s.now ? 'pro-banner border-transparent' : 'border-ink/[0.07]'}`}>
            <p className="font-mono text-[11px] text-muted">{s.done ? '✓ done' : s.now ? '● now' : `step ${i + 1}`}</p>
            <p className="text-sm font-semibold">{s.label}</p>
            <p className="text-xs text-muted">{s.note}</p>
          </li>
        ))}
      </ol>
      {!migrated && (
        <div className="mt-4">
          <a href={OVHIVE_TRADE_URL} target="_blank" rel="noopener noreferrer" className="pro-buy rounded-md px-3 py-1.5 text-xs font-semibold">Fill the curve on Pons</a>
        </div>
      )}
    </section>
  );
}

interface HolderSeries { points: { t: string; holders: number }[]; now: number; change24h: number }

async function getHolders(): Promise<HolderSeries | null> {
  try {
    const r = await fetch(`${API_URL}/tokens/${OVHIVE_CA}/holders/history`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as HolderSeries) : null;
  } catch {
    return null;
  }
}

/** Holder count since launch, hourly (server-rendered SVG area chart). */
function HolderGrowth({ h }: { h: HolderSeries | null }) {
  if (!h || h.points.length < 2) return null;
  const W = 800;
  const H = 120;
  const max = Math.max(...h.points.map((p) => p.holders), 1);
  const xs = (i: number) => (i / (h.points.length - 1)) * W;
  const ys = (v: number) => H - 6 - (v / max) * (H - 12);
  const line = h.points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.holders).toFixed(1)}`).join(' ');
  const first = h.points[0]!;
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <section className="mt-4 rounded-2xl border border-ink/[0.07] bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted">Holders</p>
        <p className="font-mono text-xs text-muted">since launch · hourly</p>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
        <span className="burn-total font-mono text-4xl font-semibold tracking-tight">{h.now}</span>
        <span className={`font-mono text-sm ${h.change24h > 0 ? 'text-[#3ddc97]' : 'text-muted'}`}>
          {h.change24h > 0 ? '+' : ''}{h.change24h} in 24h
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-4 h-28 w-full" aria-label="Holder count over time">
        <defs>
          <linearGradient id="hg-line" x1="0" x2="1"><stop offset="0" stopColor="rgb(250,203,14)" /><stop offset=".5" stopColor="rgb(240,107,168)" /><stop offset="1" stopColor="rgb(120,186,230)" /></linearGradient>
          <linearGradient id="hg-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgb(240,107,168)" stopOpacity=".25" /><stop offset="1" stopColor="rgb(240,107,168)" stopOpacity="0" /></linearGradient>
        </defs>
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#hg-fill)" />
        <path d={line} fill="none" stroke="url(#hg-line)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-muted">
        <span>{day(first.t)} · {first.holders}</span>
        <span>now · {h.now}</span>
      </div>
    </section>
  );
}

async function getBurns(): Promise<Burns | null> {
  try {
    const r = await fetch(`${API_URL}/ovhive/burns`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Burns) : null;
  } catch {
    return null;
  }
}

export default async function BurnsPage() {
  const [d, card, holders] = await Promise.all([getBurns(), getCard(), getHolders()]);
  const pct = d ? d.share * 100 : 0;
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-3 pb-16 pt-6 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">$OVHIVE · burns · read from Robinhood Chain</p>

        <section className="mt-3 rounded-2xl border border-ink/[0.07] bg-surface p-6">
          <p className="text-sm text-muted">Total burned</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="burn-total font-mono text-5xl font-semibold tracking-tight">{d ? n0(d.total) : '—'}</span>
            <span className="text-lg">$OVHIVE</span>
          </div>
          <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className="sync-fill h-full rounded-full" style={{ width: `${Math.max(pct, 0.6)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-xs text-muted">
            <span>{pct.toFixed(2)}% of {d ? n0(d.supply) : '1,000,000,000'} supply gone for good</span>
            <span>{d?.count ?? 0} burn{d?.count === 1 ? '' : 's'}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={`${EXPLORER}/token/${d?.token ?? ''}`} target="_blank" rel="noopener noreferrer" className="rounded-md bg-ink/[0.08] px-3 py-1.5 text-xs hover:bg-ink/[0.14]">Token on Blockscout</a>
            <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="pro-buy rounded-md px-3 py-1.5 text-xs font-semibold">Get $OVHIVE</a>
          </div>
        </section>

        <RoadToUniswap c={card} />
        <HolderGrowth h={holders} />

        <section className="mt-4 rounded-2xl border border-ink/[0.07] bg-surface p-2">
          {!d ? (
            <p className="px-3 py-10 text-center text-sm text-muted">Reading the chain… refresh in a few seconds.</p>
          ) : d.burns.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted">No burns yet.</p>
          ) : (
            <ul>
              {d.burns.map((b) => (
                <li key={`${b.tx}-${b.amount}`}>
                  <a href={`${EXPLORER}/tx/${b.tx}`} target="_blank" rel="noopener noreferrer" className="signal-row grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-3 py-3 sm:grid-cols-[170px_1fr_auto]">
                    <span className="hidden font-mono text-xs text-muted sm:block">{when(b.time)}</span>
                    <span className="min-w-0">
                      <span className="font-mono text-base">🔥 {n0(b.amount)}</span>
                      <span className="ml-2 font-mono text-xs text-muted">{((b.amount / (d.supply || 1)) * 100).toFixed(3)}%</span>
                      <span className="mt-0.5 block truncate font-mono text-[11px] text-muted sm:hidden">{when(b.time)}</span>
                    </span>
                    <span className="text-right font-mono text-[11px] text-muted">from {short(b.from)} → {b.to === 'dead' ? '0x…dEaD' : '0x0'}<span className="ml-1.5 opacity-60">↗</span></span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="mt-3 text-center text-[11px] text-muted">Every transfer of $OVHIVE to the dead or zero address. Updated every few minutes.</p>
      </div>
    </div>
  );
}
