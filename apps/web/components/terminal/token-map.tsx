'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsOut, Graph, X } from '@phosphor-icons/react';
import './token-map.css';

/**
 * The Token Map: every transfer of a token since launch as a live graph (canvas + d3-force).
 * Engine: public/token-map/token-map.js (ported from Coreum, MIT). Data: /api/token-map.
 * The tab shows a summary; the map itself opens full screen, where there is room to explore it.
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

const scripts = new Map<string, Promise<void>>();
function script(src: string) {
  if (!scripts.has(src))
    scripts.set(
      src,
      new Promise<void>((ok, fail) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => ok();
        s.onerror = () => {
          scripts.delete(src);
          fail(new Error('could not load ' + src));
        };
        document.head.appendChild(s);
      }),
    );
  return scripts.get(src)!;
}
const engine = () => script('/token-map/d3.min.js').then(() => script('/token-map/token-map.js'));

/** One request per token per page: the page warms it up, the tab and the full-screen view reuse it. */
const flows = new Map<string, Promise<Flow>>();
export function warmTokenMap(address: string): Promise<Flow> {
  const key = address.toLowerCase();
  if (!flows.has(key)) {
    const p = fetch(`/api/token-map?address=${key}`).then(async (r) => {
      const j = (await r.json()) as Flow & { error?: string };
      if (!r.ok) throw new Error(j.error ?? 'the map could not be built');
      return j;
    });
    p.catch(() => flows.delete(key));
    flows.set(key, p);
  }
  return flows.get(key)!;
}

const STEPS: [number, string][] = [
  [0, 'Reading the contract'],
  [1.5, 'Loading transfers'],
  [4, 'Mapping holders'],
  [7, 'Tracing the dev'],
  [10, 'Finding linked wallets and snipers'],
  [14, 'Drawing the map'],
];
const pct = (v: number) => (v === 0 ? '0%' : v < 0.01 ? '<0.01%' : v < 10 ? v.toFixed(2) + '%' : v.toFixed(1) + '%');

function useFlow(address: string) {
  const [flow, setFlow] = useState<Flow | null>(null);
  const [err, setErr] = useState('');
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    let dead = false;
    const t0 = Date.now();
    const tick = setInterval(() => setSecs((Date.now() - t0) / 1000), 250);
    warmTokenMap(address)
      .then((f) => !dead && setFlow(f))
      .catch((e: unknown) => !dead && setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => clearInterval(tick));
    return () => {
      dead = true;
      clearInterval(tick);
    };
  }, [address]);
  return { flow, err, secs };
}

/** While the server reads the chain: orbiting rings and the current step. */
function Loading({ secs, err }: { secs: number; err: string }) {
  if (err) return <p className="max-w-[420px] text-center text-sm text-muted">{err}</p>;
  const step = STEPS.filter(([t]) => secs >= t).pop()![1];
  return (
    <div className="flex flex-col items-center text-center">
      <span className="map-orbit relative block size-24" aria-hidden>
        <span className="map-orb absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        <span className="absolute inset-0 rounded-full border border-ink/15" />
        <span className="map-sat absolute inset-0">
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
        </span>
      </span>
      <div className="mt-6 text-xl font-medium">{step}…</div>
      <div className="mt-4 h-[3px] w-56 overflow-hidden rounded-full bg-ink/[0.08]">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(94, (secs / 16) * 100)}%`, background: 'linear-gradient(90deg, rgb(250,203,14), rgb(240,107,168), rgb(120,186,230))' }}
        />
      </div>
      <p className="mt-3 text-xs text-muted">The first time takes a few seconds, then it is cached.</p>
    </div>
  );
}

function Stats({ flow }: { flow: Flow }) {
  const stats: [string, string][] = [
    [flow.holders == null ? '—' : flow.holders.toLocaleString('en-US'), 'holders'],
    [pct(flow.top10), 'top 10 hold'],
    [flow.linked ? `${flow.linked} · ${pct(flow.linkedShare)}` : '0', 'linked wallets · hold'],
    [flow.snipers ? `${flow.snipers} · ${pct(flow.sniperShare)}` : '0', 'snipers · still hold'],
    [flow.totalEvents.toLocaleString('en-US'), flow.complete ? 'transfers since launch' : 'transfers mapped'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {stats.map(([v, k], i) => (
        <div key={k} className="map-stat rounded-xl border border-ink/[0.08] bg-surface p-3" style={{ animationDelay: `${i * 0.06}s` }}>
          <div className="font-mono text-lg leading-none">{v}</div>
          <div className="mt-1.5 text-[11px] text-muted">{k}</div>
        </div>
      ))}
    </div>
  );
}

/** The full-screen map. Esc or the close button returns to the token page. */
function FullMap({ address, onClose }: { address: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const { flow, err, secs } = useFlow(address);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    if (!flow) return;
    let widget: Widget | null = null;
    let dead = false;
    engine().then(() => {
      if (dead || !box.current || !window.TokenMap) return;
      widget = window.TokenMap.mount(box.current, flow, {
        title: '$' + flow.symbol,
        subtitle: `${flow.nodes.length - 1} addresses · ${flow.totalEvents.toLocaleString('en-US')} transfers${flow.complete ? '' : ' · launch + recent activity'}`,
        explorerUrl: (a: string) => `https://robinhoodchain.blockscout.com/address/${a}`,
        exportName: `overmind-map-${flow.symbol}`,
      });
      setTimeout(() => widget?.play(), 900);
    });
    return () => {
      dead = true;
      widget?.destroy();
    };
  }, [flow]);

  return createPortal(
    <div className="map-full fixed inset-0 z-[60] flex flex-col bg-[#07070a]">
      <div className="flex items-center gap-3 border-b border-ink/[0.08] bg-surface px-4 py-2.5">
        <Graph size={18} />
        <span className="text-sm font-semibold">Token map{flow ? ` · $${flow.symbol}` : ''}</span>
        <span className="hidden text-xs text-muted sm:inline">Drag to move · scroll to zoom · click a wallet to focus</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-sm transition hover:bg-ink hover:text-bg"
        >
          <X size={14} /> Close <span className="hidden font-mono text-[11px] opacity-60 sm:inline">Esc</span>
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={box} style={{ position: 'absolute', inset: 0, height: '100%' }} />
        {!flow && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loading secs={secs} err={err} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** The tab: the map's numbers and a button that opens it full screen. */
export function TokenMapTab({ address }: { address: string }) {
  const { flow, err, secs } = useFlow(address);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="map-cta relative flex min-h-[220px] items-center justify-center overflow-hidden rounded-xl border border-ink/[0.08] bg-surface">
        <div aria-hidden className="map-cta-bg pointer-events-none absolute inset-0" />
        {flow ? (
          <div className="relative flex flex-col items-center gap-4 text-center">
            <div className="text-2xl font-semibold tracking-[-0.03em]">Every transfer of ${flow.symbol}, as a live graph</div>
            <p className="max-w-[46ch] text-sm text-muted">
              Who got it first, where the dev sent it, which wallets are linked and which snipers still hold.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex items-center gap-2 rounded-[10px] bg-ink px-5 py-2.5 text-sm font-semibold text-bg transition hover:bg-ink/85 active:scale-[0.98]"
            >
              <ArrowsOut size={16} /> Open the map
            </button>
          </div>
        ) : (
          <Loading secs={secs} err={err} />
        )}
      </div>
      {flow && <Stats flow={flow} />}
      {open && <FullMap address={address} onClose={close} />}
    </div>
  );
}
