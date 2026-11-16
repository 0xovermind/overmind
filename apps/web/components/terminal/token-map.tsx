'use client';

import { useEffect, useRef, useState } from 'react';
import './token-map.css';

/**
 * The Token Map: every transfer of a token since launch as a live graph (canvas + d3-force).
 * Engine: public/token-map/token-map.js (ported from Coreum, MIT). Data: /api/token-map.
 */
type Flow = {
  symbol: string;
  complete: boolean;
  holders: number | null;
  linked: number;
  linkedShare: number;
  snipers: number;
  sniperShare: number;
  top10: number;
  totalEvents: number;
  nodes: unknown[];
};
type Widget = { destroy: () => void; play: () => void; exportPng: () => void };
declare global {
  interface Window {
    d3?: unknown;
    TokenMap?: { mount: (el: HTMLElement, flow: unknown, opts: Record<string, unknown>) => Widget };
  }
}

const loaded = new Map<string, Promise<void>>();
function script(src: string) {
  if (!loaded.has(src))
    loaded.set(
      src,
      new Promise<void>((ok, fail) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => ok();
        s.onerror = () => {
          loaded.delete(src);
          fail(new Error('could not load ' + src));
        };
        document.head.appendChild(s);
      }),
    );
  return loaded.get(src)!;
}

const STEPS: [number, string][] = [
  [0, 'Reading the contract'],
  [1.2, 'Loading transfers'],
  [5, 'Mapping holders'],
  [9, 'Tracing the dev'],
  [13, 'Finding linked wallets and snipers'],
  [17, 'Drawing the map'],
];
const pct = (v: number) => (v === 0 ? '0%' : v < 0.01 ? '<0.01%' : v < 10 ? v.toFixed(2) + '%' : v.toFixed(1) + '%');

export function TokenMapTab({ address }: { address: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [err, setErr] = useState('');
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    let widget: Widget | null = null;
    let dead = false;
    const t0 = Date.now();
    const tick = setInterval(() => setSecs((Date.now() - t0) / 1000), 250);
    (async () => {
      try {
        const [r] = await Promise.all([
          fetch(`/api/token-map?address=${address}`),
          script('/token-map/d3.min.js').then(() => script('/token-map/token-map.js')),
        ]);
        const j = (await r.json()) as Flow & { error?: string };
        if (!r.ok) throw new Error(j.error ?? 'the map could not be built');
        if (dead || !box.current || !window.TokenMap) return;
        setFlow(j);
        widget = window.TokenMap.mount(box.current, j, {
          title: '$' + j.symbol,
          subtitle: `${j.nodes.length - 1} addresses · ${j.totalEvents.toLocaleString('en-US')} transfers${j.complete ? '' : ' · launch + recent activity'}`,
          explorerUrl: (a: string) => `https://robinhoodchain.blockscout.com/address/${a}`,
          exportName: `overmind-map-${j.symbol}`,
        });
        setTimeout(() => widget?.play(), 1200);
      } catch (e) {
        if (!dead) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        clearInterval(tick);
      }
    })();
    return () => {
      dead = true;
      clearInterval(tick);
      widget?.destroy();
    };
  }, [address]);

  const stats: [string, string][] = flow
    ? [
        [flow.holders == null ? '—' : flow.holders.toLocaleString('en-US'), 'holders'],
        [pct(flow.top10), 'top 10 hold'],
        [flow.linked ? `${flow.linked} · ${pct(flow.linkedShare)}` : '0', 'linked wallets · hold'],
        [flow.snipers ? `${flow.snipers} · ${pct(flow.sniperShare)}` : '0', 'snipers · still hold'],
        [flow.totalEvents.toLocaleString('en-US'), flow.complete ? 'transfers since launch' : 'transfers mapped'],
      ]
    : [];

  return (
    <div className="flex flex-col gap-3 p-3">
      {flow && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {stats.map(([v, k], i) => (
            <div key={k} className="map-stat rounded-xl border border-ink/[0.08] bg-surface p-3" style={{ animationDelay: `${i * 0.06}s` }}>
              <div className="font-mono text-lg leading-none">{v}</div>
              <div className="mt-1.5 text-[11px] text-muted">{k}</div>
            </div>
          ))}
        </div>
      )}
      <div className="relative overflow-hidden rounded-xl border border-ink/[0.1] bg-[#0b0b0c]" style={{ height: 'max(560px, 66vh)' }}>
        <div ref={box} style={{ position: 'absolute', inset: 0, height: '100%' }} />
        {!flow && (
          <div className="absolute inset-0 grid place-items-center text-[#e5e4e0]">
            {err ? (
              <p className="max-w-[420px] text-center text-sm opacity-70">{err}</p>
            ) : (
              <div className="w-[min(420px,86%)]">
                <div className="font-mono text-[11px] tracking-[0.24em] opacity-50">OVERMIND IS READING THE TOKEN</div>
                <div className="mt-3 text-[36px] leading-none">{STEPS.filter(([t]) => secs >= t).pop()![1]}</div>
                <div className="mt-6 h-[2px] bg-[#ffffff1a]">
                  <div
                    className="h-full transition-[width] duration-300 ease-out"
                    style={{ width: `${Math.min(92, (secs / 20) * 100)}%`, background: 'linear-gradient(90deg, rgb(250,203,14), rgb(240,107,168), rgb(120,186,230))' }}
                  />
                </div>
                <p className="mt-4 text-xs opacity-45">Fresh launches take about 10 seconds, busy tokens up to 40. Then it is cached.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
