import type { IChartApi, IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesApi, ISeriesPrimitive, SeriesAttachedParameter, SeriesType, Time } from 'lightweight-charts';

type Target = Parameters<IPrimitivePaneRenderer['draw']>[0];

/** The smart set's trades on one candle (see the indexer's /hive/:address/trades). */
export interface SmartMark {
  /** The candle's time (snapped to the interval). */
  time: number;
  buys: number;
  sells: number;
  buyUsd: number;
  sellUsd: number;
}

const BUY = '#3ddc97';
const SELL = '#ff6b5b';
const GOLD = '#facb0e';

/**
 * Smart money on the candles: where the wallets behind the hive score bought (a marker under the
 * candle) and sold (over it), with how many trades. Drawn a little further from the candle than the
 * viewer's own B/S pills, so both can sit on one candle. No wallets: only that the smart crowd traded.
 */
export class SmartMarks implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private request: (() => void) | null = null;
  private items: SmartMark[] = [];
  private readonly view: IPrimitivePaneView;

  constructor(private readonly barAt: (time: number) => { high: number; low: number } | undefined) {
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
  set(items: SmartMark[]) {
    this.items = items;
    this.request?.();
  }
  updateAllViews() {}
  paneViews() {
    return [this.view];
  }

  private draw(target: Target) {
    const chart = this.chart;
    const series = this.series;
    if (!chart || !series || !this.items.length) return;
    target.useBitmapCoordinateSpace(({ context: c, horizontalPixelRatio: hr, verticalPixelRatio: vr }) => {
      const h = 16 * vr;
      const off = 24 * vr; // clear of the own-trade pill (5 px gap + 15 px pill)
      c.font = `800 ${Math.round(9.5 * vr)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const mark = (x: number, top: number, color: string, up: boolean, n: number) => {
        const label = n > 1 ? String(n) : '';
        const w = Math.max(h + 2 * hr, (label ? c.measureText(label).width + 20 * hr : h + 2 * hr));
        // a dark pill ringed in the side's colour with a gold "smart" diamond, so it never reads as one's own trade
        c.fillStyle = 'rgba(12,12,16,.92)';
        c.strokeStyle = color;
        c.lineWidth = 1.5 * hr;
        c.beginPath();
        c.roundRect(x - w / 2, top, w, h, h / 2);
        c.fill();
        c.stroke();
        const dx = label ? x - w / 2 + 8.5 * hr : x;
        const cy = top + h / 2;
        const r = 3.6 * vr;
        c.fillStyle = GOLD;
        c.beginPath();
        c.moveTo(dx, cy - r);
        c.lineTo(dx + r * 0.8, cy);
        c.lineTo(dx, cy + r);
        c.lineTo(dx - r * 0.8, cy);
        c.closePath();
        c.fill();
        if (label) {
          c.fillStyle = color;
          c.fillText(label, dx + 5 * hr + c.measureText(label).width / 2, cy + 0.5 * vr);
        }
        // a small tick toward the candle
        c.fillStyle = color;
        c.beginPath();
        if (up) {
          c.moveTo(x - 3 * hr, top);
          c.lineTo(x + 3 * hr, top);
          c.lineTo(x, top - 4 * vr);
        } else {
          c.moveTo(x - 3 * hr, top + h);
          c.lineTo(x + 3 * hr, top + h);
          c.lineTo(x, top + h + 4 * vr);
        }
        c.closePath();
        c.fill();
      };
      for (const it of this.items) {
        const x = chart.timeScale().timeToCoordinate(it.time as Time);
        const bar = this.barAt(it.time);
        if (x == null || !bar) continue;
        const cx = x * hr;
        if (it.buys) {
          const y = series.priceToCoordinate(bar.low);
          if (y != null) mark(cx, y * vr + off, BUY, true, it.buys);
        }
        if (it.sells) {
          const y = series.priceToCoordinate(bar.high);
          if (y != null) mark(cx, y * vr - off - h, SELL, false, it.sells);
        }
      }
    });
  }
}
