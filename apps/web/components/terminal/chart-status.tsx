// Chart status helpers kept apart from chart.tsx, so pages can show them without loading the chart
// library (lightweight-charts), which loads lazily.
import type { Hydration } from '@/lib/feed/protocol';

const SOURCE_TEXT = { chain: 'from chain', index: 'from the Overmind index', mixed: 'from chain and index' } as const;

const span = (secs: number) => {
  const h = secs / 3600;
  if (h >= 23.5) return `${Math.round(h / 24)}d`;
  if (h >= 1) return `${Math.round(h)}h`;
  return `${Math.max(1, Math.round(secs / 60))}m`;
};

/** "Fetching history from chain · last 6h loaded" / "Partial history from chain · last 24h". */
export function hydrationLabel(h: Hydration): { title: string; detail: string | null } {
  const from = SOURCE_TEXT[h.source ?? 'chain'];
  const covered = h.covered && h.covered.to > h.covered.from ? `last ${span(h.covered.to - h.covered.from)}` : null;
  if (h.state === 'partial') return { title: `Partial history ${from}`, detail: covered ? `${covered} so far` : null };
  return { title: `Fetching history ${from}`, detail: covered ? `${covered} loaded` : null };
}

export const isHydrating = (h?: Hydration | null) => h?.state === 'hydrating' || h?.state === 'partial';

/** "Fetching history from chain · last 30m loaded": the server is still backfilling this token. */
export function HydratingPill({ hydration, className = '' }: { hydration: Hydration; className?: string }) {
  const { title, detail } = hydrationLabel(hydration);
  return (
    <span
      role="status"
      className={`pointer-events-none absolute right-3 top-1 z-10 flex items-center gap-1.5 rounded-full bg-surface-2/90 px-2.5 py-1 text-[11px] text-ink/85 ring-1 ring-brand/25 ${className}`}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand/60" />
        <span className="relative inline-flex size-2 rounded-full bg-brand" />
      </span>
      {title}
      {detail && <span className="font-mono text-muted">· {detail}</span>}
    </span>
  );
}
