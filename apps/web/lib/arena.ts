import { API_URL } from './api';

/** Arena, Wallet DNA, co-holders and launch replay (indexer agents/arena.ts). */
export type ArenaSource = 'hive' | 'crowd' | 'ai';
export type Outcome = 'win' | 'loss' | 'push' | 'open';

export interface ArenaSourceStats {
  source: ArenaSource;
  calls: number;
  scored: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  edge: number | null;
  open: number;
  streak: { kind: 'win' | 'loss'; n: number } | null;
}
export interface ArenaTokenRef { address: string; symbol: string | null; imageUrl: string | null }
export interface ArenaCall {
  id: string;
  source: ArenaSource;
  stance: 'bullish' | 'bearish';
  at: string;
  weight: number | null;
  token: ArenaTokenRef;
  priceAt: number;
  mcapAt: number | null;
  priceAfter: number | null;
  move: number | null;
  outcome: Outcome;
}
export interface ArenaClash {
  token: ArenaTokenRef;
  at: string;
  sides: { source: ArenaSource; stance: 'bullish' | 'bearish'; at: string; outcome: Outcome }[];
  winner: ArenaSource | 'push' | null;
}
export interface Arena {
  horizon: 1 | 24 | 168;
  days: number;
  push: number;
  sources: ArenaSourceStats[];
  leader: ArenaSource | null;
  daily: { day: string; hive: number | null; crowd: number | null; ai: number | null }[];
  clashes: ArenaClash[];
  recent: ArenaCall[];
}

export const SOURCE: Record<ArenaSource, { name: string; who: string; color: string; how: string }> = {
  hive: {
    name: 'The Hive',
    who: 'Smart wallets',
    color: '#facb0e',
    how: 'A call when the most profitable wallets on the chain flip to buying or selling a token.',
  },
  crowd: {
    name: 'The Crowd',
    who: 'Your votes',
    color: '#78bae6',
    how: 'A call when 3+ people vote on a token and one side wins the last 24 hours.',
  },
  ai: {
    name: 'Overmind AI',
    who: '@overmind_ai',
    color: '#f06ba8',
    how: 'A call every 4 hours from the AI agent, made from the hive read and the risk checks.',
  },
};

export const asHorizon = (v: string | string[] | undefined): 1 | 24 | 168 => (v === '1' ? 1 : v === '168' ? 168 : 24);
export const HORIZON_LABEL = { 1: '1 hour', 24: '24 hours', 168: '7 days' } as const;

export async function getArena(h: 1 | 24 | 168): Promise<Arena | null> {
  try {
    const r = await fetch(`${API_URL}/v1/arena?h=${h}`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Arena) : null;
  } catch {
    return null;
  }
}

export interface Dna {
  wallet: string;
  archetype: { id: string; name: string; line: string };
  traits: string[];
  stats: {
    tokens: number;
    trades: number;
    buys: number;
    sells: number;
    closed: number;
    wins: number;
    winRate: number | null;
    realizedUsd: number;
    volumeUsd: number;
    medianHoldS: number | null;
    snipeRate: number;
    holding: number;
    tradesPerDay: number;
    activeDays: number;
    favoriteHourUtc: number | null;
    firstAt: string | null;
    lastAt: string | null;
    inHive: boolean;
  };
  best: { token: string; symbol: string; realized: number } | null;
  worst: { token: string; symbol: string; realized: number } | null;
}

export async function getDna(wallet: string): Promise<Dna | null> {
  try {
    const r = await fetch(`${API_URL}/v1/wallets/${wallet.toLowerCase()}/dna`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Dna) : null;
  } catch {
    return null;
  }
}

export const isWallet = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

export function holdLabel(s: number | null): string {
  if (s == null) return '—';
  if (s < 60) return `${Math.max(1, Math.round(s))}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)}h`;
  return `${(s / 86400).toFixed(s < 864000 ? 1 : 0)}d`;
}

export interface CoHolders {
  token: string;
  wallet: string;
  firstBuy: string;
  window: string;
  total: number;
  holding: number;
  trimmed: number;
  exited: number;
  left24h: number;
  soldLast24hUsd: number;
  wallets: { wallet: string; boughtUsd: number | null; status: 'holding' | 'trimmed' | 'exited'; soldLast24hUsd: number | null; lastSell: string | null }[];
}

export interface ReplayEvent { t: number; trader: string; side: 'buy' | 'sell'; amount: number; usd: number | null; mcap: number | null; tags: string[]; tx: string }
export interface Replay {
  token: { address: string; symbol: string; name: string; imageUrl: string | null; deployer: string; createdAt: string; launchpad: string | null };
  events: ReplayEvent[];
  truncated: boolean;
  moments: {
    firstSmartBuy: { t: number; wallet: string } | null;
    devFirstSell: { t: number; usd: number | null } | null;
    peak: { mcap: number; t: number } | null;
    traders: number;
    snipers: number;
  };
}

export async function getReplay(token: string): Promise<Replay | null> {
  try {
    const r = await fetch(`${API_URL}/v1/tokens/${token.toLowerCase()}/replay`, { cache: 'no-store' });
    return r.ok ? ((await r.json()) as Replay) : null;
  } catch {
    return null;
  }
}

/** Accent color per DNA archetype. */
export const DNA_COLOR: Record<string, string> = {
  sniper: '#ff5d6c', bot: '#78bae6', sharpshooter: '#3ddc97', diamond: '#78bae6', paper: '#facb0e',
  scalper: '#f06ba8', whale: '#78bae6', degen: '#f06ba8', fresh: '#ececf1',
};
