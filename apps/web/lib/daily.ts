import { API_URL } from './api';

/** Hive Daily (indexer /hive/daily): the smart set's biggest net buys and sells over the last 24h. */
export interface DailyRow {
  token: string; symbol: string; name: string; image_url: string | null; market_cap_usd: number | null;
  buyers: number; sellers: number; net_usd: number; score: number;
}
export type Scope = 'pons' | 'all';
export const asScope = (v: unknown): Scope => (v === 'all' ? 'all' : 'pons');
export interface Daily { at: string; scope?: Scope; smart_wallets: number; buying: DailyRow[]; selling: DailyRow[] }

export async function getDaily(limit = 5, scope: Scope = 'pons'): Promise<Daily | null> {
  try {
    const r = await fetch(`${API_URL}/hive/daily?limit=${limit}&scope=${scope}`, { next: { revalidate: 300 } });
    return r.ok ? ((await r.json()) as Daily) : null;
  } catch {
    return null;
  }
}

export const signedUsd = (n: number) => {
  const a = Math.abs(n);
  const t = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}K` : `$${Math.round(a)}`;
  return (n < 0 ? '−' : '+') + t;
};
export const mcap = (n: number | null) => (n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`);
export const dailyDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase();
