'use client';

// Launch replay: a token's first trades played back like a match, one trade per step (slow launches don't
// sit empty for hours); the clock shows real time since launch.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowCounterClockwise, Pause, Play } from '@phosphor-icons/react';
import type { Replay, ReplayEvent } from '@/lib/arena';
import { usd } from '@/lib/format';

const W = 900;
const H = 340;
const PAD = { l: 8, r: 8, t: 20, b: 26 };
/** One full playback at 1x: about 12 trades a second, 8 to 50 seconds. */
const baseSeconds = (n: number) => Math.min(50, Math.max(8, n / 12));
const SPEEDS = [0.5, 1, 2, 4] as const;

const clock = (s: number) => {
  if (s < 3600) return `T+${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  if (s < 86400) return `T+${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
  return `T+${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const TAG: Record<string, { label: string; color: string }> = {
  dev: { label: 'dev', color: '#f06ba8' },
  smart: { label: 'smart', color: '#facb0e' },
  sniper: { label: 'sniper', color: '#78bae6' },
};

export function ReplayPlayer({ r }: { r: Replay }) {
  const events = r.events;
  const total = Math.max(1, events.at(-1)?.t ?? 1);
  const [p, setP] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const step = (now: number) => {
      const dt = last.current == null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setP((x) => {
        const n = Math.min(1, x + (dt * speed) / baseSeconds(events.length));
        if (n >= 1) setPlaying(false);
        return n;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = null;
    };
  }, [playing, speed, events.length]);

  // Start on its own once, a beat after the page is in.
  useEffect(() => {
    const t = setTimeout(() => setPlaying(true), 600);
    return () => clearTimeout(t);
  }, []);

  const N = events.length;
  const shown = Math.min(N, Math.ceil(p * N));
  const now = shown ? events[shown - 1]!.t : 0;
  const xOf = (i: number) => PAD.l + (N > 1 ? i / (N - 1) : 0) * (W - PAD.l - PAD.r);
  const idxOf = (t: number) => Math.max(0, events.findIndex((e) => e.t >= t));
  const mcaps = events.map((e) => e.mcap).filter((m): m is number => m != null && m > 0);
  const maxM = Math.max(1, ...mcaps);
  const minM = Math.min(maxM, ...mcaps);
  const logMin = Math.log(Math.max(1, minM * 0.8));
  const logMax = Math.log(maxM * 1.1);
  const yOf = (m: number) => PAD.t + (1 - (Math.log(Math.max(m, 1)) - logMin) / Math.max(0.0001, logMax - logMin)) * (H - PAD.t - PAD.b);

  const seen = events.slice(0, shown);
  const pts = seen.map((e, i) => ({ e, i })).filter(({ e }) => e.mcap != null);
  const path = pts.map(({ e, i }, k) => `${k ? 'L' : 'M'}${xOf(i).toFixed(1)},${yOf(e.mcap!).toFixed(1)}`).join(' ');
  const lastM = [...seen].reverse().find((e) => e.mcap != null)?.mcap ?? null;
  const peakSoFar = seen.reduce((m, e) => Math.max(m, e.mcap ?? 0), 0);
  const traders = new Set(seen.map((e) => e.trader)).size;
  const buyUsd = seen.filter((e) => e.side === 'buy').reduce((s, e) => s + (e.usd ?? 0), 0);
  const sellUsd = seen.filter((e) => e.side === 'sell').reduce((s, e) => s + (e.usd ?? 0), 0);
  const maxUsd = Math.max(1, ...events.map((e) => e.usd ?? 0));
  const tape = seen.slice(-12).reverse();
  const m = r.moments;
  const moments = [
    m.firstSmartBuy && { t: m.firstSmartBuy.t, label: 'First smart wallet buys', color: '#facb0e' },
    m.devFirstSell && { t: m.devFirstSell.t, label: `Dev sells first${m.devFirstSell.usd ? ` (${usd(m.devFirstSell.usd)})` : ''}`, color: '#f06ba8' },
    m.peak && { t: m.peak.t, label: `Peak ${usd(m.peak.mcap)} mcap`, color: '#3ddc97' },
  ].filter(Boolean) as { t: number; label: string; color: string }[];
  const reached = moments.filter((x) => x.t <= now);

  const restart = () => {
    setP(0);
    setPlaying(true);
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
      <section className="overflow-hidden rounded-2xl border border-ink/[0.07] bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-ink/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={() => (p >= 1 ? restart() : setPlaying((x) => !x))}
            className="flex size-9 items-center justify-center rounded-full bg-ink text-bg transition active:scale-[0.94]"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
          </button>
          <button type="button" onClick={restart} className="flex size-9 items-center justify-center rounded-full border border-ink/[0.1] text-muted transition hover:text-ink active:scale-[0.94]" aria-label="Restart">
            <ArrowCounterClockwise size={16} />
          </button>
          <div className="font-mono text-xl font-bold tabular-nums">{clock(now)}</div>
          <div className="ml-auto flex rounded-lg border border-ink/[0.08] p-0.5 font-mono text-xs">
            {SPEEDS.map((s) => (
              <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded-md px-2.5 py-1 transition ${s === speed ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}>
                {s}x
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Market cap since launch">
            <defs>
              <linearGradient id="rp-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#3ddc97" stopOpacity="0.25" />
                <stop offset="1" stopColor="#3ddc97" stopOpacity="0" />
              </linearGradient>
            </defs>
            {moments.map((x) => (
              <line key={x.label} x1={xOf(idxOf(x.t))} x2={xOf(idxOf(x.t))} y1={PAD.t} y2={H - PAD.b} stroke={x.color} strokeOpacity={x.t <= now ? 0.6 : 0.12} strokeDasharray="3 4" />
            ))}
            {path && (
              <>
                <path d={`${path} L${xOf(pts.at(-1)!.i).toFixed(1)},${H - PAD.b} L${xOf(pts[0]!.i).toFixed(1)},${H - PAD.b} Z`} fill="url(#rp-fill)" />
                <path d={path} fill="none" stroke="#3ddc97" strokeWidth={2} strokeLinejoin="round" />
              </>
            )}
            {seen.map((e: ReplayEvent, i) =>
              e.mcap == null ? null : (
                <g key={i} className="bubble-in" style={{ transformOrigin: `${xOf(i)}px ${yOf(e.mcap)}px` }}>
                  <circle
                    cx={xOf(i)}
                    cy={yOf(e.mcap)}
                    r={2.5 + 9 * Math.sqrt((e.usd ?? 0) / maxUsd)}
                    fill={e.side === 'buy' ? '#3ddc97' : '#ff5d6c'}
                    fillOpacity={0.35}
                    stroke={e.tags.includes('dev') ? '#f06ba8' : e.tags.includes('smart') ? '#facb0e' : e.side === 'buy' ? '#3ddc97' : '#ff5d6c'}
                    strokeWidth={e.tags.includes('dev') || e.tags.includes('smart') ? 2.5 : 1}
                  />
                </g>
              ),
            )}
            <text x={PAD.l} y={H - 8} fontSize={11} fill="currentColor" opacity={0.45} fontFamily="ui-monospace, monospace">launch</text>
            <text x={W - PAD.r} y={H - 8} fontSize={11} fill="currentColor" opacity={0.45} textAnchor="end" fontFamily="ui-monospace, monospace">
              trade #{N} · {clock(total)}
            </text>
          </svg>
          <div className="pointer-events-none absolute left-4 top-3 flex flex-col gap-1.5">
            {reached.slice(-2).map((x) => (
              <span key={x.label} className="row-in w-fit rounded-full px-3 py-1 text-xs font-semibold text-bg" style={{ background: x.color }}>
                {x.label}
              </span>
            ))}
          </div>
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(p * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setP(Number(e.target.value) / 1000);
          }}
          className="block w-full accent-[#3ddc97]"
          aria-label="Scrub through the launch"
        />
        <div className="grid grid-cols-2 gap-px bg-ink/[0.05] sm:grid-cols-4">
          {[
            ['Mcap', lastM == null ? '—' : usd(lastM)],
            ['Peak so far', peakSoFar ? usd(peakSoFar) : '—'],
            ['Traders', String(traders)],
            ['Bought · sold', `${usd(buyUsd)} · ${usd(sellUsd)}`],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{k}</div>
              <div className="mt-0.5 font-semibold tabular-nums">{v}</div>
            </div>
          ))}
        </div>
      </section>
      <aside className="flex flex-col gap-3">
        <section className="rounded-2xl border border-ink/[0.07] bg-surface">
          <h2 className="border-b border-ink/[0.06] px-4 py-3 text-sm font-semibold">Live tape</h2>
          <ul className="divide-y divide-ink/[0.05]">
            {tape.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">Waiting for the first trade…</li>}
            {tape.map((e) => (
              <li key={`${e.tx}-${e.t}-${e.trader}`} className="row-in flex items-center gap-2 px-4 py-2 text-xs">
                <span className={`w-8 font-mono font-semibold ${e.side === 'buy' ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}`}>{e.side}</span>
                <span className="font-mono tabular-nums">{e.usd == null ? '—' : usd(e.usd)}</span>
                <Link href={`/dna/${e.trader}`} className="font-mono text-muted hover:text-ink">{short(e.trader)}</Link>
                <span className="ml-auto flex gap-1">
                  {e.tags.map((t) => (
                    <span key={t} className="rounded px-1.5 py-0.5 font-mono text-[10px]" style={{ color: TAG[t]?.color, background: `${TAG[t]?.color}1a` }}>
                      {TAG[t]?.label ?? t}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-ink/[0.07] bg-surface p-4 text-xs text-muted">
          <h2 className="text-sm font-semibold text-ink">Key moments</h2>
          <ul className="mt-2 space-y-1.5">
            {moments.length === 0 && <li>Nothing notable in the first trades.</li>}
            {moments.map((x) => (
              <li key={x.label} className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: x.color }} />
                <span className={x.t <= now ? 'text-ink' : ''}>{x.label}</span>
                <span className="ml-auto font-mono">{clock(x.t)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3">
            {m.traders} wallets in the first {events.length} trades, {m.snipers} of them within the first minute.
            {r.truncated ? ' Replay covers the first 600 trades.' : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.values(TAG).map((t) => (
              <span key={t.label} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full border-2" style={{ borderColor: t.color }} /> {t.label}
              </span>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
