import type { Metadata } from 'next';
import Link from 'next/link';
import { appShare } from '@/lib/share';
import { getRadar, pct0, since, type RadarLaunch } from '@/lib/radar';
import { TokenAvatar } from '@/components/terminal/bits';
import { usd } from '@/lib/format';
import { AutoRefresh } from '@/components/terminal/auto-refresh';

export const metadata: Metadata = appShare(
  'Launch radar',
  '/radar',
  'Every Pons launch on Robinhood Chain, read in its first minute: snipers, bundles, the dev’s record and smart wallets.',
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const TONE = {
  clean: { label: 'Clean start', color: '#3ddc97' },
  mixed: { label: 'Mixed', color: '#ffb547' },
  risky: { label: 'Risky', color: '#ff5d6c' },
} as const;

function Card({ l, i }: { l: RadarLaunch; i: number }) {
  const tone = TONE[l.verdict];
  const r = l.report;
  return (
    <Link
      href={`/token/${l.token.address}`}
      className="arena-card group flex flex-col rounded-2xl border border-ink/[0.07] bg-surface p-4 transition hover:border-ink/[0.15]"
      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
    >
      <div className="flex items-center gap-3">
        <TokenAvatar t={{ address: l.token.address, symbol: l.token.symbol, launchpad: 'pons', image_url: l.token.imageUrl }} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">${l.token.symbol}</div>
          <div className="truncate text-xs text-muted">{l.token.name} · {since(l.launchedAt)}</div>
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl font-bold tabular-nums" style={{ color: tone.color }}>{l.score}</div>
          <div className="text-[11px] font-semibold" style={{ color: tone.color }}>{tone.label}</div>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
        <div className="arena-bar h-full rounded-full" style={{ width: `${l.score}%`, background: tone.color }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
        <div><dt className="text-muted">1st-min buyers</dt><dd>{r.buyers60}</dd></div>
        <div><dt className="text-muted">Sniped</dt><dd>{pct0(r.boughtShare60)}</dd></div>
        <div><dt className="text-muted">Launch block</dt><dd>{pct0(r.bundleShare)}</dd></div>
        <div><dt className="text-muted">Smart in</dt><dd className={r.smartIn ? 'text-[#3ddc97]' : ''}>{r.smartIn}</dd></div>
        <div><dt className="text-muted">Dev launches 7d</dt><dd>{r.devLaunches7d}</dd></div>
        <div><dt className="text-muted">Mcap now</dt><dd>{usd(l.now.mcap)}</dd></div>
      </dl>
      <ul className="mt-3 space-y-1 text-xs">
        {r.good.slice(0, 2).map((g) => <li key={g} className="text-[#3ddc97]">+ {g}</li>)}
        {r.flags.slice(0, 3).map((f) => <li key={f} className="text-[#ff5d6c]">− {f}</li>)}
        {!r.good.length && !r.flags.length && <li className="text-muted">Nothing notable in the first minute.</li>}
      </ul>
    </Link>
  );
}

export default async function RadarPage() {
  const d = await getRadar();
  const launches = d?.launches ?? [];
  const counts = { clean: 0, mixed: 0, risky: 0 };
  for (const l of launches) counts[l.verdict]++;
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6">
        <AutoRefresh seconds={30} />
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Launch radar</div>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Every Pons launch, read in its first minute</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              60 seconds after a token launches, Overmind checks who bought it: snipers, wallets in the launch block, the dev&apos;s own buy and record, and whether any
              of the chain&apos;s most profitable wallets got in. Updated every 30 seconds.
            </p>
          </div>
          <div className="flex gap-2 font-mono text-xs">
            {(Object.keys(TONE) as (keyof typeof TONE)[]).map((k) => (
              <span key={k} className="rounded-full border px-3 py-1" style={{ borderColor: `${TONE[k].color}55`, color: TONE[k].color }}>
                {TONE[k].label} {counts[k]}
              </span>
            ))}
          </div>
        </header>
        {launches.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-ink/[0.07] bg-surface p-8 text-center text-sm text-muted">The radar is warming up. The first reports land a minute after the next launches.</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {launches.map((l, i) => <Card key={l.token.address} l={l} i={i} />)}
          </div>
        )}
        <p className="mt-6 text-xs text-muted">The score reads the first minute only and is not financial advice. Launches change fast after it.</p>
      </div>
    </main>
  );
}
