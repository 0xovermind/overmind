import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';

/**
 * TradingView-style drawings on the candle chart: trend lines, rays, horizontal levels, rectangles,
 * Fibonacci retracements and a measure tool. Drawn by a series primitive, so they pan and zoom with the
 * candles.
 *
 * Points are stored as (unix time, USD price) — never as pixels or as market cap — so a drawing stays put
 * when the interval changes or the chart switches between price and market cap. Times between candles,
 * or to the right of the last one, are placed by interpolating on the interval's candle grid.
 */

export type Tool = 'cursor' | 'trend' | 'ray' | 'hline' | 'rect' | 'fib' | 'measure' | 'erase';
export const TWO_POINT: ReadonlySet<Tool> = new Set(['trend', 'ray', 'rect', 'fib', 'measure']);

export interface DrawPoint { t: number; p: number }
export interface Drawing { id: string; kind: Exclude<Tool, 'cursor' | 'erase'>; a: DrawPoint; b: DrawPoint }

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0];

const LINE = '#78bae6';
const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ['#8b8b96', '#ff6b5b', '#ffb547', '#3ddc97', '#78bae6', '#b58cff', '#8b8b96'];

export interface DrawContext {
  /** Candle times of the current series, ascending. */
  times: () => number[];
  /** Seconds per candle. */
  step: () => number;
  /** USD price → what the chart shows (price or market cap). */
  scale: () => number;
  /** Formats a value in the chart's units for labels. */
  format: (v: number) => string;
}

export class Drawings implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private items: Drawing[] = [];
  private draft: Drawing | null = null;
  private hidden = false;
  private sel: string | null = null;
  private readonly view: IPrimitivePaneView;

  constructor(private readonly ctx: DrawContext) {
    const renderer: IPrimitivePaneRenderer = { draw: (target) => this.draw(target) };
    this.view = { zOrder: () => 'top', renderer: () => renderer };
  }

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart;
    this.series = p.series;
    this.request = p.requestUpdate;
  }
  detached() {
    this.chart = null;
    this.series = null;
    this.request = null;
  }
  updateAllViews() {}
  paneViews() {
    return [this.view];
  }

  set(items: Drawing[]) {
    this.items = items;
    this.request?.();
  }
  setDraft(d: Drawing | null) {
    this.draft = d;
    this.request?.();
  }
  setSelected(id: string | null) {
    this.sel = id;
    this.request?.();
  }
  /** Which end of the selected drawing is under a pane point (within 9 px). */
  handleAt(x: number, y: number): 'a' | 'b' | null {
    const d = this.items.find((i) => i.id === this.sel);
    if (!d || d.kind === 'hline') return null;
    for (const k of ['b', 'a'] as const) {
      const px = this.x(d[k].t), py = this.y(d[k].p);
      if (px != null && py != null && Math.hypot(px - x, py - y) <= 9) return k;
    }
    return null;
  }
  setHidden(h: boolean) {
    this.hidden = h;
    this.request?.();
  }
  refresh() {
    this.request?.();
  }

  // ---------- coordinates ----------
  /** x (CSS px) for a unix time, on the candle grid (interpolated between and beyond candles). */
  x(t: number): number | null {
    const ts = this.chart?.timeScale();
    const times = this.ctx.times();
    if (!ts || !times.length) return null;
    const step = this.ctx.step();
    let lo = 0;
    let hi = times.length - 1;
    if (t <= times[0]!) return ts.logicalToCoordinate(((t - times[0]!) / step) as never);
    if (t >= times[hi]!) return ts.logicalToCoordinate((hi + (t - times[hi]!) / step) as never);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! <= t) lo = mid;
      else hi = mid;
    }
    const frac = (t - times[lo]!) / Math.max(1, times[hi]! - times[lo]!);
    return ts.logicalToCoordinate((lo + frac * (hi - lo)) as never);
  }
  /** y (CSS px) for a USD price, in the chart's current units. */
  y(p: number): number | null {
    return this.series?.priceToCoordinate(p * this.ctx.scale()) ?? null;
  }
  /** A pane point (CSS px) back to (time, USD price). */
  point(x: number, y: number): DrawPoint | null {
    const ts = this.chart?.timeScale();
    const times = this.ctx.times();
    const s = this.series;
    if (!ts || !s || !times.length) return null;
    const logical = ts.coordinateToLogical(x);
    const v = s.coordinateToPrice(y);
    if (logical == null || v == null) return null;
    const step = this.ctx.step();
    const i = Math.floor(logical);
    const frac = logical - i;
    const base = i < 0 ? times[0]! + i * step : i >= times.length ? times[times.length - 1]! + (i - times.length + 1) * step : times[i]!;
    return { t: base + frac * step, p: v / this.ctx.scale() };
  }

  /** The drawing under a pane point (within 7 px), for the eraser. */
  hit(x: number, y: number): Drawing | null {
    const near = (ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l));
      return Math.hypot(x - (ax + k * dx), y - (ay + k * dy)) <= 7;
    };
    for (const d of [...this.items].reverse()) {
      const ax = this.x(d.a.t), ay = this.y(d.a.p), bx = this.x(d.b.t), by = this.y(d.b.p);
      if (ax == null || ay == null) continue;
      if (d.kind === 'hline' && Math.abs(y - ay) <= 7) return d;
      if (bx == null || by == null) continue;
      if ((d.kind === 'trend' || d.kind === 'measure') && near(ax, ay, bx, by)) return d;
      if (d.kind === 'ray' && near(ax, ay, ax + (bx - ax) * 50, ay + (by - ay) * 50)) return d;
      if ((d.kind === 'rect' || d.kind === 'fib' || d.kind === 'measure') && x >= Math.min(ax, bx) - 4 && x <= Math.max(ax, bx) + 4 && y >= Math.min(ay, by) - 4 && y <= Math.max(ay, by) + 4) return d;
    }
    return null;
  }

  // ---------- drawing ----------
  private draw(target: Target) {
    if (this.hidden || !this.chart || !this.series) return;
    const all = this.draft ? [...this.items, this.draft] : this.items;
    if (!all.length) return;
    target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr, bitmapSize }) => {
      const W = bitmapSize.width;
      c.lineCap = 'round';
      c.font = `600 ${Math.round(10.5 * vr)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      c.textBaseline = 'middle';
      const label = (text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') => {
        c.textAlign = align;
        const w = c.measureText(text).width + 10 * hr, h = 17 * vr;
        const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
        c.fillStyle = 'rgba(12,12,16,.88)';
        c.beginPath();
        c.roundRect(left, y - h / 2, w, h, 5 * hr);
        c.fill();
        c.fillStyle = color;
        c.fillText(text, align === 'right' ? x - 5 * hr : align === 'center' ? x : x + 5 * hr, y);
      };
      const dot = (x: number, y: number, color: string) => {
        c.fillStyle = '#0c0c10';
        c.strokeStyle = color;
        c.lineWidth = 1.5 * hr;
        c.beginPath();
        c.arc(x, y, 4.5 * hr, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      };
      for (const d of all) {
        const on = d.id === this.sel || d === this.draft;
        const lw = on ? 1.4 : 1;
        const ax0 = this.x(d.a.t), ay0 = this.y(d.a.p), bx0 = this.x(d.b.t), by0 = this.y(d.b.p);
        if (ax0 == null || ay0 == null) continue;
        const ax = ax0 * hr, ay = ay0 * vr;
        const scaleK = this.ctx.scale();
        if (d.kind === 'hline') {
          c.strokeStyle = LINE;
          c.lineWidth = 1.3 * lw * hr;
          c.setLineDash(on ? [] : [6 * hr, 4 * hr]);
          c.beginPath();
          c.moveTo(0, ay);
          c.lineTo(W, ay);
          c.stroke();
          c.setLineDash([]);
          label(this.ctx.format(d.a.p * scaleK), W - 4 * hr, ay, LINE, 'right');
          continue;
        }
        if (bx0 == null || by0 == null) continue;
        const bx = bx0 * hr, by = by0 * vr;
        if (d.kind === 'trend' || d.kind === 'ray') {
          let ex = bx, ey = by;
          if (d.kind === 'ray' && bx !== ax) {
            const k = ((bx > ax ? W : 0) - ax) / (bx - ax);
            ex = ax + (bx - ax) * k;
            ey = ay + (by - ay) * k;
          }
          c.strokeStyle = LINE;
          c.lineWidth = 1.6 * lw * hr;
          c.beginPath();
          c.moveTo(ax, ay);
          c.lineTo(ex, ey);
          c.stroke();
        } else if (d.kind === 'rect') {
          c.fillStyle = 'rgba(120,186,230,.12)';
          c.strokeStyle = 'rgba(120,186,230,.75)';
          c.lineWidth = 1.2 * hr;
          c.beginPath();
          c.rect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
          c.fill();
          c.stroke();
        } else if (d.kind === 'fib') {
          const left = Math.min(ax, bx), right = Math.max(ax, bx);
          // 0 at the second point (where the move ended), 1 at the first (where it started), like TradingView
          const lv = FIB.map((f) => d.b.p + (d.a.p - d.b.p) * f);
          for (let i = 0; i < FIB.length; i++) {
            const yy = this.y(lv[i]!);
            if (yy == null) continue;
            const y = yy * vr;
            if (i < FIB.length - 1) {
              const ny = this.y(lv[i + 1]!);
              if (ny != null) {
                c.fillStyle = `${FIB_COLORS[i + 1]}14`;
                c.fillRect(left, Math.min(y, ny * vr), right - left, Math.abs(ny * vr - y));
              }
            }
            c.strokeStyle = FIB_COLORS[i]!;
            c.lineWidth = 1.1 * hr;
            c.beginPath();
            c.moveTo(left, y);
            c.lineTo(right, y);
            c.stroke();
            c.fillStyle = FIB_COLORS[i]!;
            c.textAlign = 'left';
            c.fillText(`${FIB[i]}  ${this.ctx.format(lv[i]! * scaleK)}`, right + 6 * hr, y);
          }
          c.strokeStyle = 'rgba(255,255,255,.25)';
          c.setLineDash([4 * hr, 4 * hr]);
          c.beginPath();
          c.moveTo(ax, ay);
          c.lineTo(bx, by);
          c.stroke();
          c.setLineDash([]);
        } else if (d.kind === 'measure') {
          const up = d.b.p >= d.a.p;
          const col = up ? '#3ddc97' : '#ff6b5b';
          c.fillStyle = up ? 'rgba(61,220,151,.12)' : 'rgba(255,107,91,.12)';
          c.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
          c.strokeStyle = col;
          c.lineWidth = 1.4 * hr;
          c.beginPath();
          c.moveTo(ax, ay);
          c.lineTo(bx, by);
          c.stroke();
          const pct = d.a.p ? ((d.b.p - d.a.p) / d.a.p) * 100 : 0;
          const bars = Math.round(Math.abs(d.b.t - d.a.t) / this.ctx.step());
          const mins = Math.round(Math.abs(d.b.t - d.a.t) / 60);
          const span = mins >= 1440 ? `${(mins / 1440).toFixed(1)}d` : mins >= 60 ? `${(mins / 60).toFixed(1)}h` : `${mins}m`;
          label(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%  ·  ${bars} bars  ·  ${span}`, (ax + bx) / 2, Math.min(ay, by) - 14 * vr, col, 'center');
        }
        if (on) {
          dot(ax, ay, d.kind === 'measure' ? '#fff' : LINE);
          dot(bx, by, d.kind === 'measure' ? '#fff' : LINE);
        }
      }
    });
  }
}

/** Drawings saved per token in this browser (never sent anywhere). */
export function loadDrawings(address: string): Drawing[] {
  try {
    const v = JSON.parse(localStorage.getItem(`overmind.draw.${address.toLowerCase()}`) ?? '[]') as Drawing[];
    return Array.isArray(v) ? v.filter((d) => d && d.a && d.b && d.kind !== ('measure' as never)) : [];
  } catch {
    return [];
  }
}
export function saveDrawings(address: string, items: Drawing[]) {
  try {
    // the measure tool is a quick read, not something to keep
    localStorage.setItem(`overmind.draw.${address.toLowerCase()}`, JSON.stringify(items.filter((d) => d.kind !== 'measure')));
  } catch {
    // storage unavailable
  }
}

// ---------- indicators ----------
export type IndicatorId = 'ma20' | 'ema50' | 'bb' | 'vwap' | 'rsi';
export const INDICATORS: { id: IndicatorId; name: string; color: string }[] = [
  { id: 'ma20', name: 'MA 20', color: '#ffb547' },
  { id: 'ema50', name: 'EMA 50', color: '#b58cff' },
  { id: 'bb', name: 'Bollinger Bands 20, 2', color: '#78bae6' },
  { id: 'vwap', name: 'VWAP', color: '#f06ba8' },
  { id: 'rsi', name: 'RSI 14', color: '#facb0e' },
];

interface OHLCV { time: number; open: number; high: number; low: number; close: number; volume: number }
type Pt = { time: number; value: number };

export function sma(bars: OHLCV[], n: number): Pt[] {
  const out: Pt[] = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= n) sum -= bars[i - n]!.close;
    if (i >= n - 1) out.push({ time: b.time, value: sum / n });
  });
  return out;
}
export function ema(bars: OHLCV[], n: number): Pt[] {
  const out: Pt[] = [];
  const k = 2 / (n + 1);
  let e: number | null = null;
  bars.forEach((b, i) => {
    e = e == null ? b.close : b.close * k + e * (1 - k);
    if (i >= n - 1) out.push({ time: b.time, value: e });
  });
  return out;
}
export function bollinger(bars: OHLCV[], n = 20, m = 2): { upper: Pt[]; lower: Pt[]; mid: Pt[] } {
  const upper: Pt[] = [], lower: Pt[] = [], mid: Pt[] = [];
  for (let i = n - 1; i < bars.length; i++) {
    const win = bars.slice(i - n + 1, i + 1).map((b) => b.close);
    const mean = win.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(win.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
    const t = bars[i]!.time;
    mid.push({ time: t, value: mean });
    upper.push({ time: t, value: mean + m * sd });
    lower.push({ time: t, value: mean - m * sd });
  }
  return { upper, lower, mid };
}
/** Volume-weighted average price over the loaded window (typical price × volume). */
export function vwap(bars: OHLCV[]): Pt[] {
  let pv = 0, v = 0;
  const out: Pt[] = [];
  for (const b of bars) {
    const vol = b.volume > 0 ? b.volume : 0;
    pv += ((b.high + b.low + b.close) / 3) * vol;
    v += vol;
    if (v > 0) out.push({ time: b.time, value: pv / v });
  }
  return out;
}
export function rsi(bars: OHLCV[], n = 14): Pt[] {
  const out: Pt[] = [];
  let gain = 0, loss = 0;
  for (let i = 1; i < bars.length; i++) {
    const ch = bars[i]!.close - bars[i - 1]!.close;
    const g = Math.max(0, ch), l = Math.max(0, -ch);
    if (i <= n) {
      gain += g / n;
      loss += l / n;
      if (i === n) out.push({ time: bars[i]!.time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
    } else {
      gain = (gain * (n - 1) + g) / n;
      loss = (loss * (n - 1) + l) / n;
      out.push({ time: bars[i]!.time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
    }
  }
  return out;
}
