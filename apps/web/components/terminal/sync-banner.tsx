'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from '@/lib/api';

/** Below this many blocks behind the head (~30 min of chain), the banner stays hidden. */
const LIVE_LAG = 18000;
const POLL_MS = 20_000;

interface Sample { lag: number; at: number }

function eta(blocks: number, perSec: number): string | null {
  if (!(perSec > 0)) return null;
  const min = Math.round(blocks / perSec / 60);
  if (min < 2) return 'a minute or two';
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `~${h}h${m ? ` ${m}m` : ''}`;
}

/**
 * While the indexer replays the chain (after a migration or a long outage), say so at the top of the
 * terminal: how far behind it is, how fast it is catching up, and a progress bar. Hidden once live.
 */
export function SyncBanner() {
  const [lag, setLag] = useState<number | null>(null);
  const first = useRef<Sample | null>(null);
  const last = useRef<Sample | null>(null);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`${API_URL}/health`, { cache: 'no-store' });
        const j = (await r.json()) as { lagBlocks?: number | null };
        if (stop || typeof j.lagBlocks !== 'number') return;
        const s = { lag: j.lagBlocks, at: Date.now() };
        if (!first.current) first.current = s;
        const prev = last.current;
        if (prev && s.at > prev.at) {
          // Blocks gained on the head per second, smoothed.
          const r1 = (prev.lag - s.lag) / ((s.at - prev.at) / 1000);
          setRate((old) => (old ? old * 0.6 + r1 * 0.4 : r1));
        }
        last.current = s;
        setLag(s.lag);
      } catch {
        /* the banner is a nicety: stay quiet on errors */
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  if (lag === null || lag < LIVE_LAG) return null;
  const start = first.current?.lag ?? lag;
  const pct = start > LIVE_LAG ? Math.max(0, Math.min(100, ((start - lag) / (start - LIVE_LAG)) * 100)) : 0;
  const left = eta(lag - LIVE_LAG, rate);

  return (
    <div className="sync-banner relative mx-2 mb-2 overflow-hidden rounded-xl border border-ink/15 bg-surface px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
        <span className="flex items-center gap-2 font-medium">
          <span className="sync-dot size-2 rounded-full" />
          The hive is syncing Robinhood Chain
        </span>
        <span className="text-muted tabular-nums">
          {lag.toLocaleString('en-US')} blocks behind{left ? ` · live in ${left}` : ''}
        </span>
        <span className="ml-auto text-[12px] text-muted">Scores and feeds fill in as it catches up</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/10">
        <div className='sync-fill h-full rounded-full' style={{ width: `${Math.max(pct, 2)}%` }} />
      </div>
    </div>
  );
}
