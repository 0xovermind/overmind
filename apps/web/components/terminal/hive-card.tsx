'use client';

import { useEffect, useRef, useState } from 'react';

/** Count from the last shown value to the new one (score animation). */
function useCount(target: number) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(a + (target - a) * e));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
import { API_URL } from '@/lib/api';
import { HiveHistory } from './hive-history';
import { AiExplain } from './ai-explain';
import { CrowdVote } from './crowd-vote';

interface Consensus {
  smart_buyers: number;
  smart_sellers: number;
  bullish_calls: number;
  bearish_calls: number;
  voters: number;
  score: number;
}

/** Below this many smart wallets and calls in 24h, one trade would swing the score to ±100: no reading. */
const MIN_VOTERS = 3;

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

  // Too few voices for a reading: one smart wallet selling is not 'the hive is selling'.
  const thin = !!c && c.voters < MIN_VOTERS;
  const score = c && !thin ? c.score : 0;
  const shown = useCount(score);
  const w = Math.min(50, Math.abs(score) / 2);
  return (
    <section className={`hive-live rounded-xl border border-ink/[0.06] bg-surface p-4 ${score >= 20 ? 'is-up' : score <= -20 ? 'is-down' : ''}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Hive consensus</h3>
        <span className={`font-mono text-2xl ${thin ? 'text-muted' : ''}`}>{c && !thin ? (shown > 0 ? `+${shown}` : shown) : '—'}</span>
      </div>
      <div className="relative mt-3 h-1.5 w-full bg-ink/[0.06]">
        <span className="absolute inset-y-0 left-1/2 w-px bg-ink/20" />
        {c && !thin && (
          <span
            className={`hive-bar absolute inset-y-0 transition-all duration-700 ${score >= 0 ? 'up' : 'down'}`}
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
          {thin ? (
            <>
              <p className="mt-2 text-sm text-muted">Not enough smart money yet</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {c.smart_buyers + c.smart_sellers === 0 ? 'No smart wallet traded it' : `Only ${c.smart_buyers + c.smart_sellers} smart ${c.smart_buyers + c.smart_sellers === 1 ? 'wallet' : 'wallets'} traded it`} in the last 24 hours. A reading needs {MIN_VOTERS} smart wallets or calls.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm">{verdict(score)}</p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted">
            <div><dt>Smart wallets in</dt><dd className="font-mono text-ink">{c.smart_buyers}</dd></div>
            <div><dt>Smart wallets out</dt><dd className="font-mono text-ink">{c.smart_sellers}</dd></div>
            <div><dt>Bullish calls</dt><dd className="font-mono text-ink">{c.bullish_calls}</dd></div>
            <div><dt>Bearish calls</dt><dd className="font-mono text-ink">{c.bearish_calls}</dd></div>
          </dl>
        </>
      )}
      <CrowdVote token={token} />
      <HiveHistory token={token} />
      <AiExplain token={token} />
    </section>
  );
}
