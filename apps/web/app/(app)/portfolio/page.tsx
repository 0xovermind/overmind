import type { Metadata } from 'next';
import Link from 'next/link';
import { appShare } from '@/lib/share';
import { getPortfolio, pct0, signedPct, signedUsd, since, type CopyPos } from '@/lib/radar';
import { TokenAvatar } from '@/components/terminal/bits';
import { ArenaTabs } from '@/components/terminal/arena-tabs';

export const metadata: Metadata = appShare(
  'Copy the hive',
  '/portfolio',
  'A paper portfolio that puts $100 into every hive buy signal and sells on the sell signal. Public results, no edits.',
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const tone = (n: number | null | undefined) => (n == null ? '' : n >= 0 ? 'text-[#3ddc97]' : 'text-[#ff5d6c]');

function Curve({ pts }: { pts: { at: string; realized: number }[] }) {
  const W = 700, H = 140;
  if (pts.length < 2) return <p className="py-10 text-center text-sm text-muted">The curve fills in as positions close on sell signals.</p>;
  const vals = [0, ...pts.map((p) => p.realized)];
  const max = Math.max(...vals), min = Math.min(...vals);
  const y = (v: number) => 8 + (1 - (v - min) / (max - min || 1)) * (H - 16);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = vals.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".12" strokeDasharray="4 4" />
      <path d={d} fill="none" stroke={last >= 0 ? '#3ddc97' : '#ff5d6c'} strokeWidth="2" />
    </svg>
  );
}

function Row({ p, open }: { p: CopyPos; open: boolean }) {
  return (
    <li className="row-in">
      <Link href={`/token/${p.token}`} className="grid grid-cols-[1fr_80px_80px_70px] items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-ink/[0.03]">
        <span className="flex min-w-0 items-center gap-2">
          <TokenAvatar t={{ address: p.token, symbol: p.symbol, launchpad: null, image_url: p.imageUrl }} size={24} />
          <span className="truncate font-semibold">${p.symbol}</span>
          <span className="truncate font-mono text-xs text-muted">{open ? `bought ${since(p.openAt)}` : `held ${since(p.openAt)} → ${since(p.closeAt!)}`}</span>
        </span>
        <span className={`text-right font-mono text-xs ${tone(p.ret)}`}>{signedPct(p.ret)}</span>
        <span className={`text-right font-mono text-xs ${tone(p.pnl)}`}>{signedUsd(p.pnl)}</span>
        <span className="text-right font-mono text-[11px] text-muted">{open ? 'open' : 'closed'}</span>
      </Link>
    </li>
  );
}

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const scope = (await searchParams).scope === 'all' ? 'all' : 'pons';
  const p = await getPortfolio(scope);
  const s = p?.summary;
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">
        <ArenaTabs active="/portfolio" />
        <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Copy the hive</div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">What if you followed every hive signal?</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              A paper portfolio: $100 into every token the hive flips to buying, sold when it flips to selling. Prices from Overmind&apos;s own index, last 30
              days, no edits, no cherry-picking. Fees and slippage not included. Not financial advice.
            </p>
          </div>
          <nav className="flex rounded-xl border border-ink/[0.08] p-1 font-mono text-xs">
            {(['pons', 'all'] as const).map((x) => (
              <Link key={x} href={`/portfolio?scope=${x}`} className={`rounded-lg px-3 py-1.5 ${x === scope ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}>
                {x === 'pons' ? 'Pons hive' : 'Whole chain'}
              </Link>
            ))}
          </nav>
        </header>
        {!p || !s ? (
          <p className="mt-10 rounded-2xl border border-ink/[0.07] bg-surface p-8 text-center text-sm text-muted">The portfolio is loading. Try again in a minute.</p>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ['Total P&L', signedUsd(s.total), tone(s.total)],
                ['Return', signedPct(s.returnPct), tone(s.returnPct)],
                ['Win rate (closed)', pct0(s.winRate), ''],
                ['Positions', `${s.open} open · ${s.closed} closed`, ''],
              ].map(([k, v, c]) => (
                <section key={k} className="arena-card rounded-2xl border border-ink/[0.07] bg-surface p-4">
                  <div className="text-xs text-muted">{k}</div>
                  <div className={`mt-1 text-2xl font-bold tabular-nums ${c}`}>{v}</div>
                </section>
              ))}
            </div>
            <section className="mt-3 rounded-2xl border border-ink/[0.07] bg-surface p-5">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold">Realized P&amp;L over time</span>
                <span className="font-mono text-xs text-muted">realized {signedUsd(s.realized)} · open positions {signedUsd(s.unrealized)} · ${s.invested.toLocaleString('en-US')} put in</span>
              </div>
              <div className="mt-3"><Curve pts={p.curve} /></div>
            </section>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <section className="overflow-hidden rounded-2xl border border-ink/[0.07] bg-surface">
                <h2 className="border-b border-ink/[0.06] px-4 py-3 font-semibold">Open positions</h2>
                <ul className="divide-y divide-ink/[0.05]">{p.open.length ? p.open.map((x) => <Row key={x.token + x.openAt} p={x} open />) : <li className="p-6 text-center text-sm text-muted">None right now.</li>}</ul>
              </section>
              <section className="overflow-hidden rounded-2xl border border-ink/[0.07] bg-surface">
                <h2 className="border-b border-ink/[0.06] px-4 py-3 font-semibold">Closed trades</h2>
                <ul className="divide-y divide-ink/[0.05]">{p.closed.length ? p.closed.map((x) => <Row key={x.token + x.openAt} p={x} open={false} />) : <li className="p-6 text-center text-sm text-muted">No sell signal has closed a position yet.</li>}</ul>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
