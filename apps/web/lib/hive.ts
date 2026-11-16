'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

export interface HiveRow {
  token: string;
  symbol: string;
  name: string;
  image_url: string | null;
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
    const res = await fetch(`${API_URL}/hive?limit=60`);
    if (!res.ok) return;
    const body = (await res.json()) as { tokens: HiveRow[] };
    cache = { rows: body.tokens, byToken: new Map(body.tokens.map((r) => [r.token.toLowerCase(), r])) };
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
