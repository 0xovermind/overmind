'use client';

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type { IChartApi } from 'lightweight-charts';
import { INDICATORS, TWO_POINT, type DrawPoint, type Drawing, type Drawings, type IndicatorId, type Tool } from './drawings';

/** Width of the drawing-tool column on the left of the chart (the chart itself starts after it). */
export const STRIP_W = 40;

const I = ({ d, children }: { d?: string; children?: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d ? <path d={d} /> : children}
  </svg>
);
const ICONS: Record<string, ReactNode> = {
  cursor: <I d="M5 3l6 17 2.4-6.6L20 11z" />,
  trend: <I><path d="M5 19L19 5" /><circle cx="5" cy="19" r="1.8" /><circle cx="19" cy="5" r="1.8" /></I>,
  ray: <I><path d="M5 19L21 3" /><circle cx="5" cy="19" r="1.8" /><circle cx="11" cy="13" r="1.8" /></I>,
  hline: <I><path d="M3 12h18" strokeDasharray="3 2.5" /><circle cx="12" cy="12" r="1.8" /></I>,
  rect: <I><rect x="4" y="6" width="16" height="12" rx="1.5" /></I>,
  fib: <I d="M4 5h16M4 9.5h16M4 13.5h16M4 19h16" />,
  measure: <I><path d="M4 20V4M4 20h16" /><path d="M8 16l4-5 3 3 5-6" /></I>,
  magnet: <I d="M6 3v8a6 6 0 0 0 12 0V3M6 7h4M14 7h4" />,
  eye: <I><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></I>,
  eyeOff: <I d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1" />,
  erase: <I d="M7 21h10M5.5 14.5l7-7a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H8l-2.5-2.5a1 1 0 0 1 0-1z" />,
  trash: <I d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
};
const TOOLS: { id: Tool; name: string; key: string }[] = [
  { id: 'cursor', name: 'Cursor', key: 'Esc' },
  { id: 'trend', name: 'Trend line', key: 'T' },
  { id: 'ray', name: 'Ray', key: 'R' },
  { id: 'hline', name: 'Horizontal level', key: 'H' },
  { id: 'rect', name: 'Rectangle (zone)', key: 'B' },
  { id: 'fib', name: 'Fib retracement', key: 'F' },
  { id: 'measure', name: 'Measure: % and bars between two points', key: 'M' },
];

function Btn({ on, title, onClick, children, warn }: { on?: boolean; title: string; onClick: () => void; children: ReactNode; warn?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid size-7 shrink-0 place-items-center rounded-lg transition ${on ? 'bg-ink/[0.12] text-ink' : warn ? 'text-muted hover:bg-risk-high/15 hover:text-risk-high' : 'text-muted hover:bg-ink/[0.07] hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

/** The drawing tools, in a column on the left of the chart like TradingView's. */
function Strip(p: {
  tool: Tool; onTool: (t: Tool) => void; magnet: boolean; onMagnet: (v: boolean) => void;
  hidden: boolean; onHidden: (v: boolean) => void; count: number; onClear: () => void;
}) {
  // keyboard shortcuts, while the pointer is not in a text field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input,textarea,[contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') return p.onTool('cursor');
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) p.onTool(t.id);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [p]);
  return (
    <div className="absolute inset-y-0 left-0 z-20 flex flex-col items-center gap-0.5 overflow-y-auto border-r border-ink/[0.06] py-1.5 [scrollbar-width:none]" style={{ width: STRIP_W }}>
      {TOOLS.map((t) => (
        <Btn key={t.id} on={p.tool === t.id} title={`${t.name} (${t.key})`} onClick={() => p.onTool(t.id)}>
          {ICONS[t.id]}
        </Btn>
      ))}
      <span className="my-0.5 h-px w-5 shrink-0 bg-ink/[0.08]" />
      <Btn on={p.magnet} title={p.magnet ? 'Magnet on: points snap to candle open, high, low, close' : 'Magnet off'} onClick={() => p.onMagnet(!p.magnet)}>{ICONS.magnet}</Btn>
      <Btn on={p.hidden} title={p.hidden ? 'Show drawings' : 'Hide drawings'} onClick={() => p.onHidden(!p.hidden)}>{p.hidden ? ICONS.eyeOff : ICONS.eye}</Btn>
      <Btn on={p.tool === 'erase'} title="Eraser: click a drawing to delete it" onClick={() => p.onTool(p.tool === 'erase' ? 'cursor' : 'erase')}>{ICONS.erase}</Btn>
      {p.count > 0 && (
        <Btn warn title={`Delete all drawings (${p.count})`} onClick={() => { if (confirm(`Delete all ${p.count} drawings on this token?`)) p.onClear(); }}>
          {ICONS.trash}
        </Btn>
      )}
    </div>
  );
}

/**
 * Catches the pointer while a drawing tool is active: press-drag-release, or click then click, draws a
 * two-point shape; a click places a horizontal level; the eraser deletes what it touches.
 */
function Overlay(p: {
  tool: Tool;
  chart: MutableRefObject<IChartApi | null>;
  api: MutableRefObject<Drawings | null>;
  magnet: boolean;
  barAt: (t: number) => { open: number; high: number; low: number; close: number } | undefined;
  step: number;
  onAdd: (d: Drawing) => void;
  onErase: (id: string) => void;
  onDone: () => void;
}) {
  const draft = useRef<Drawing | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);
  const [box, setBox] = useState({ right: 64, bottom: 28 });
  useEffect(() => {
    const c = p.chart.current;
    if (c) setBox({ right: c.priceScale('right').width(), bottom: c.timeScale().height() });
    return () => p.api.current?.setDraft(null);
  }, [p.chart, p.api]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        draft.current = null;
        p.api.current?.setDraft(null);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [p.api]);

  const at = (e: React.PointerEvent): DrawPoint | null => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const api = p.api.current;
    const pt = api?.point(x, y);
    if (!api || !pt) return null;
    if (!p.magnet) return pt;
    // magnet: snap to the nearest open / high / low / close of the candle under the pointer
    const t = Math.floor(pt.t / p.step) * p.step;
    const bar = p.barAt(t);
    if (!bar) return pt;
    let best: number | null = null, dist = 16;
    for (const v of [bar.open, bar.high, bar.low, bar.close]) {
      const vy = api.y(v);
      if (vy != null && Math.abs(vy - y) < dist) { dist = Math.abs(vy - y); best = v; }
    }
    return best == null ? pt : { t: t + p.step / 2, p: best };
  };
  const finish = () => {
    const d = draft.current;
    draft.current = null;
    p.api.current?.setDraft(null);
    if (d) p.onAdd(d);
    p.onDone();
  };

  return (
    <div
      className={`absolute left-0 top-0 z-10 ${p.tool === 'erase' ? 'cursor-pointer' : 'cursor-crosshair'}`}
      style={{ left: STRIP_W, right: box.right, bottom: box.bottom, touchAction: 'none' }}
      onPointerDown={(e) => {
        const pt = at(e);
        if (!pt) return;
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (p.tool === 'erase') {
          const hit = p.api.current?.hit(e.clientX - r.left, e.clientY - r.top);
          if (hit) p.onErase(hit.id);
          return;
        }
        const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        if (p.tool === 'hline') {
          p.onAdd({ id, kind: 'hline', a: pt, b: pt });
          p.onDone();
          return;
        }
        if (!TWO_POINT.has(p.tool)) return;
        if (draft.current) {
          // second click of click-click drawing
          draft.current = { ...draft.current, b: pt };
          finish();
          return;
        }
        draft.current = { id, kind: p.tool as Drawing['kind'], a: pt, b: pt };
        down.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        p.api.current?.setDraft(draft.current);
      }}
      onPointerMove={(e) => {
        if (!draft.current) return;
        const pt = at(e);
        if (!pt) return;
        draft.current = { ...draft.current, b: pt };
        p.api.current?.setDraft(draft.current);
      }}
      onPointerUp={(e) => {
        if (!draft.current || !down.current) return;
        const moved = Math.hypot(e.clientX - down.current.x, e.clientY - down.current.y) > 5;
        down.current = null;
        if (moved) finish(); // dragged: done; a plain click waits for the second click
      }}
    />
  );
}

/** The "Indicators" menu in the chart's header. */
function IndicatorsMenu({ value, onChange }: { value: IndicatorId[]; onChange: (v: IndicatorId[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener('mousedown', close);
    return () => removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} className="relative ml-2 shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 ${open || value.length ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M3 17l5-6 4 4 8-10" /></svg>
        Indicators{value.length ? ` ${value.length}` : ''}
      </button>
      {open && (
        <div className="fixed z-50 mt-1 w-56 rounded-xl border border-ink/[0.1] bg-surface p-1.5 shadow-2xl" style={{ top: ref.current ? ref.current.getBoundingClientRect().bottom + 4 : 0, left: ref.current ? ref.current.getBoundingClientRect().left : 0 }}>
          {INDICATORS.map((i) => {
            const on = value.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onChange(on ? value.filter((x) => x !== i.id) : [...value, i.id])}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-ink/[0.06]"
              >
                <span className={`grid size-4 place-items-center rounded border ${on ? 'border-transparent' : 'border-ink/25'}`} style={on ? { background: i.color } : undefined}>
                  {on && <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#0b0b0f" strokeWidth="3.2" aria-hidden><path d="M5 12l5 5 9-10" /></svg>}
                </span>
                <span className="flex-1">{i.name}</span>
                <span className="h-0.5 w-4 rounded" style={{ background: i.color }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const ChartTools = { Strip, Overlay, IndicatorsMenu };
