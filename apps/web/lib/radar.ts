import { API_URL } from './api';

/** Launch radar, hive copy-portfolio and caller season (indexer agents/radar.ts). */
export interface LaunchReport {
  buyers60: number; boughtShare60: number; boughtUsd60: number;
  bundleWallets: number; bundleShare: number; devBoughtShare: number;
  devLaunches: number; devLaunches7d: number; devRugs: number; devMigrated: number;
  smartIn: number; holders: number; mcap: number | null; risk: string | null; verdictNote: string | null;
  flags: string[]; good: string[];
}
export interface RadarLaunch {
  token: { address: string; symbol: string; name: string; imageUrl: string | null; status: string };
  launchedAt: string;
  score: number;
  verdict: 'clean' | 'mixed' | 'risky';
  report: LaunchReport;
  now: { mcap: number | null; holders: number };
}

export interface CopyPos {
  token: string; symbol: string; imageUrl: string | null;
  openAt: string; entry: number; closeAt: string | null; exit: number | null; pnl: number | null; ret: number | null;
}
export interface Portfolio {
  scope: 'pons' | 'all'; days: number; stake: number;
  summary: {
    trades: number; closed: number; open: number; wins: number; winRate: number | null; invested: number;
    realized: number; unrealized: number; total: number; returnPct: number | null; best: CopyPos | null; worst: CopyPos | null;
  };
  curve: { at: string; realized: number }[];
  open: CopyPos[];
  closed: CopyPos[];
}

export interface Standing {
  member: { id: string; handle: string; name: string | null; avatarUrl: string | null; kind: string };
  calls: number; hitRate: number; avgMove: number; best: { symbol: string; move: number } | null; ranked: boolean;
}
export interface Season {
  week: { start: string; end: string };
  minCalls: number;
  standings: Standing[];
  lastWeek: { start: string; winners: Standing[] };
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API_URL}/v1${path}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}
export const getRadar = () => get<{ launches: RadarLaunch[] }>('/radar?limit=90');
export const getPortfolio = (scope: 'pons' | 'all') => get<Portfolio>(`/hive/portfolio?scope=${scope}`);
export const getSeason = () => get<Season>('/season');

export const pct0 = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
export const signedPct = (n: number | null | undefined, d = 1) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(d)}%`);
export const signedUsd = (n: number | null | undefined) =>
  n == null ? '—' : `${n >= 0 ? '+' : '-'}$${Math.abs(n) >= 1000 ? `${(Math.abs(n) / 1000).toFixed(1)}K` : Math.abs(n).toFixed(0)}`;
export const since = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
