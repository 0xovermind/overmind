'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

interface Consensus {
  smart_buyers: number;
  smart_sellers: number;
  bullish_calls: number;
  bearish_calls: number;
  voters: number;
  score: number;
}

const verdict = (s: number) => (s >= 60 ? 'Buying' : s >= 20 ? 'Leaning in' : s > -20 ? 'Split' : s > -60 ? 'Leaning out' : 'Selling');

/** Overmind Consensus for one token: the hive's lean from smart-wallet flow and member calls. */
export function HiveCard({ token }: { token: string }) {
  const [c, setC] = useState<Consensus | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const load = () =>
      fetch(`${API_URL}/hive/${token}`)
        .then(async (r) => (r.ok ? ((await r.json()) as { consensus: Consensus | null }) : { consensus: null }))
        .then((b: { consensus: Consensus | null }) => live && setC(b.consensus))
        .catch(() => live && setC(null));
    load();
    const id = setInterval(load, 30_000);
    return () => { live = false; clearInterval(id); };
  }, [token]);

  const score = c?.score ?? 0;
  const w = Math.min(50, Math.abs(score) / 2);
  return (
    <section className="rounded-xl border border-ink/[0.06] bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Hive consensus</h3>
        <span className="font-mono text-lg">{c ? (score > 0 ? `+${score}` : score) : '—'}</span>
      </div>
      <div className="relative mt-3 h-1.5 w-full bg-ink/[0.06]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-ink/20" />
        {c && (
          <span
            className="absolute inset-y-0 bg-ink transition-all duration-700"
            style={score >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
          />
        )}
      </div>
      {c === undefined ? (
        <p className="mt-3 text-xs text-muted">Reading the hive…</p>
      ) : c === null ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">No view yet: no smart wallet has traded it and nobody has called it in the last days.</p>
      ) : (
        <>
          <p className="mt-2 text-sm">{verdict(score)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
            <div><dt>Smart wallets in</dt><dd className="font-mono text-ink">{c.smart_buyers}</dd></div>
            <div><dt>Smart wallets out</dt><dd className="font-mono text-ink">{c.smart_sellers}</dd></div>
            <div><dt>Bullish calls</dt><dd className="font-mono text-ink">{c.bullish_calls}</dd></div>
            <div><dt>Bearish calls</dt><dd className="font-mono text-ink">{c.bearish_calls}</dd></div>
          </dl>
        </>
      )}
    </section>
  );
}
