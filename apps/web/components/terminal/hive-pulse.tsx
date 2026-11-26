'use client';

import Link from 'next/link';
import { useHive, hiveVerdict, type HiveRow } from '@/lib/hive';
import { TokenAvatar } from './bits';

/** The hive's score as a small chip, for any token the hive has a view on. */
export function HiveChip({ token }: { token: string }) {
  const { byToken } = useHive();
  const r = byToken.get(token.toLowerCase());
  if (!r) return null;
  const tone = r.score >= 20 ? 'up' : r.score <= -20 ? 'down' : '';
  return (
    <span className={`hive-chip ${tone}`} title={`Hive: ${hiveVerdict(r.score)} (${r.voters} voices)`}>
      <i />
      {r.score > 0 ? `+${r.score}` : r.score}
    </span>
  );
}

function PulseCard({ r, i }: { r: HiveRow; i: number }) {
  const w = Math.min(50, Math.abs(r.score) / 2);
  return (
    <Link
      href={`/token/${r.token}`}
      className="pulse-card flex w-[220px] shrink-0 flex-col gap-2 rounded-xl border border-ink/[0.08] bg-surface px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-ink/30"
      style={{ animationDelay: `${i * 0.04}s` }}
    >
      <span className="flex items-center gap-2">
        <TokenAvatar t={{ address: r.token, symbol: r.symbol, launchpad: null, image_url: r.image_url }} size={22} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">${r.symbol}</span>
        <span className={`font-mono text-sm ${r.score >= 20 ? 'text-risk-low' : r.score <= -20 ? 'text-risk-high' : ''}`}>
          {r.score > 0 ? `+${r.score}` : r.score}
        </span>
      </span>
      <span className="relative block h-1 w-full bg-ink/[0.07]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-ink/25" />
        <span
          className="pulse-fill absolute inset-y-0 bg-ink"
          style={r.score >= 0 ? { left: '50%', width: `${w}%`, transformOrigin: 'left' } : { right: '50%', width: `${w}%`, transformOrigin: 'right' }}
        />
      </span>
      <span className="text-[11px] text-muted">
        {hiveVerdict(r.score)} · {r.voters} {r.voters === 1 ? 'voice' : 'voices'}
      </span>
    </Link>
  );
}

/**
 * A strip across the top of the trenches: what the hive is doing right now. It follows the Markets
 * "Plain pools" toggle: tokens launched as a bare Uniswap pool (no launchpad, usually no logo or
 * socials anywhere) stay out unless the user asks for them. Spam and copycats never reach the board.
 */
export function HivePulse({ showPlain = false }: { showPlain?: boolean }) {
  const { rows: all } = useHive();
  const rows = showPlain ? all : all.filter((r) => (r.launchpad ?? 'uniswap-v4') !== 'uniswap-v4');
  return (
    <section className="flex items-stretch gap-3 px-2 pb-2">
      <div className="flex w-[150px] shrink-0 flex-col justify-center rounded-xl bg-ink px-3 py-2.5 text-bg">
        <span className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] opacity-70">
          <span className="hive-orb size-3 rounded-full" /> Hive pulse
        </span>
        <span className="mt-1 text-sm leading-tight">What the best wallets and callers are doing</span>
      </div>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
        {rows.length ? (
          rows.slice(0, 24).map((r, i) => <PulseCard key={r.token} r={r} i={i} />)
        ) : (
          <span className="flex items-center px-3 text-sm text-muted">The hive is warming up…</span>
        )}
      </div>
    </section>
  );
}
