import type { Env } from './env';

/**
 * RH Radar (api.bagsboard.com): Telegram group calls and DexScreener promotions per token, timestamped,
 * for marks on our charts next to the smart-money marks. Data partner, credited where shown.
 *
 * Their limit for us is ~10-20 requests a minute, so every token read is cached (TTL) and upstream
 * calls are capped (MAX_PER_MIN, two per token: calls + promotions). Over the cap a stale read is
 * served, or an empty one marked `limited`.
 */
const BASE = 'https://api.bagsboard.com';
const TTL_MS = 3 * 60_000;
const MAX_PER_MIN = 12;

export interface RadarCall {
  /** unix seconds */
  time: number;
  /** anonymized group id (the same group keeps the same id) */
  group: string;
  /** market cap when the call was made, when RH Radar verified it */
  mcap: number | null;
}
export interface RadarPromo {
  time: number;
  /** tokenProfile (DEX PAID), boost, ad, cto ... as RH Radar names it */
  type: string;
}
export interface RadarRead {
  source: 'RH Radar';
  calls: RadarCall[];
  promos: RadarPromo[];
  limited?: boolean;
}

const cache = new Map<string, { at: number; read: RadarRead }>();
let recent: number[] = [];

const take = (n: number) => {
  const now = Date.now();
  recent = recent.filter((t) => now - t < 60_000);
  if (recent.length + n > MAX_PER_MIN) return false;
  for (let i = 0; i < n; i++) recent.push(now);
  return true;
};

async function get<T>(env: Env, path: string): Promise<T[]> {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${env.RHR_API_KEY}` }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`rh radar ${r.status}`);
  const j = (await r.json()) as { data?: T[] };
  return j.data ?? [];
}

const ms = (v: unknown) => (typeof v === 'number' && v > 0 ? Math.floor(v / 1000) : null);

export async function radarRead(env: Env, token: string): Promise<RadarRead> {
  const empty: RadarRead = { source: 'RH Radar', calls: [], promos: [] };
  if (!env.RHR_API_KEY) return empty;
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.read;
  if (!take(2)) return hit ? hit.read : { ...empty, limited: true };
  try {
    const [calls, promos] = await Promise.all([
      get<{ timestamp?: number; originalMessageAt?: number; groupId?: string; entryMarketCapUsd?: number | null; callMcStatus?: string }>(env, `/v1/calls/token/${token}`),
      get<{ eventAt?: number; detectedAt?: number; type?: string }>(env, `/v1/dex-paid/token/${token}`),
    ]);
    const read: RadarRead = {
      source: 'RH Radar',
      calls: calls
        .map((c) => ({
          time: ms(c.originalMessageAt ?? c.timestamp) ?? 0,
          group: String(c.groupId ?? '').slice(0, 10),
          mcap: c.callMcStatus === 'verified' && typeof c.entryMarketCapUsd === 'number' ? c.entryMarketCapUsd : null,
        }))
        .filter((c) => c.time > 0)
        .sort((a, b) => a.time - b.time),
      promos: promos
        .map((p) => ({ time: ms(p.eventAt ?? p.detectedAt) ?? 0, type: String(p.type ?? 'promo') }))
        .filter((p) => p.time > 0)
        .sort((a, b) => a.time - b.time),
    };
    cache.set(token, { at: Date.now(), read });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return read;
  } catch {
    return hit ? hit.read : empty;
  }
}
