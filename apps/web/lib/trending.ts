import { API_URL } from './api';

/** Trending with smart money (indexer /hive/trending): tokens ranked by smart wallets buying them. */
export type TrendWindow = '1h' | '6h' | '24h';
export const asTrendWindow = (v: unknown): TrendWindow => (v === '1h' || v === '6h' ? v : '24h');
export type TrendScope = 'all' | 'pons';
export const asTrendScope = (v: unknown): TrendScope => (v === 'pons' ? 'pons' : 'all');

export interface TrendingRow {
  token: string; symbol: string; name: string; image_url: string | null; launchpad: string | null; status: string | null;
  market_cap_usd: number | null; price_usd: number | null;
  buyers: number; sellers: number; trades: number;
  buy_usd: number; sell_usd: number; net_usd: number; score: number;
  change_pct: number | null; first_smart_at: number | null; last_at: number;
}
export interface Trending { window: TrendWindow; scope: TrendScope; at: string; smart_wallets: number; tokens: TrendingRow[] }

export async function getTrending(window: TrendWindow, scope: TrendScope, limit = 40): Promise<Trending | null> {
  try {
    const r = await fetch(`${API_URL}/hive/trending?window=${window}&scope=${scope}&limit=${limit}`, { next: { revalidate: 30 } });
    return r.ok ? ((await r.json()) as Trending) : null;
  } catch {
    return null;
  }
}

/** "3h ago", "2d ago" from unix seconds. */
export const ago = (sec: number | null) => {
  if (!sec) return '—';
  const m = Math.max(0, Math.round((Date.now() / 1000 - sec) / 60));
  return m < 60 ? `${m}m ago` : m < 48 * 60 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
