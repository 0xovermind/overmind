'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

export interface HiveRow {
  token: string;
  symbol: string;
  name: string;
  image_url: string | null;
  /** Where the token launched; 'uniswap-v4' (or null) is a plain pool, hidden like on Markets. */
  launchpad?: string | null;
  market_cap_usd: number | null;
  smart_buyers: number;
  smart_sellers: number;
  bullish_calls: number;
  bearish_calls: number;
  voters: number;
  score: number;
}

/** One shared poll of the hive board for every component on the page (30 s). */
let cache: { rows: HiveRow[]; byToken: Map<string, HiveRow> } = { rows: [], byToken: new Map() };
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    // The chain-wide board, plus the Pons board (its own smart set): most chain-wide rows are plain pools
    // without a logo, and Pons launches are where most of the hive's readings live.
    const board = (u: string): Promise<{ tokens: HiveRow[] }> =>
      fetch(u).then((r) => (r.ok ? (r.json() as Promise<{ tokens: HiveRow[] }>) : { tokens: [] })).catch(() => ({ tokens: [] }));
    const [all, pons] = await Promise.all([board(`${API_URL}/hive?limit=60`), board(`${API_URL}/hive?limit=60&scope=pons`)]);
    if (!all.tokens.length && !pons.tokens.length) return;
    const byToken = new Map<string, HiveRow>();
    for (const r of [...all.tokens, ...pons.tokens]) if (!byToken.has(r.token.toLowerCase())) byToken.set(r.token.toLowerCase(), r);
    const rows = [...byToken.values()].sort((a, b) => b.voters - a.voters);
    cache = { rows, byToken };
    subs.forEach((f) => f());
  } catch {
    // keep the last board
  }
}

export function useHive() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (!timer) {
      void load();
      timer = setInterval(load, 30_000);
    }
    return () => {
      subs.delete(f);
      if (!subs.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return cache;
}

export const hiveVerdict = (s: number) => (s >= 60 ? 'Buying' : s >= 20 ? 'Leaning in' : s > -20 ? 'Split' : s > -60 ? 'Leaning out' : 'Selling');
