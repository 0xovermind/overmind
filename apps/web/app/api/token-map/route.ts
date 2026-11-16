import { API_URL } from '@/lib/api';
import { tokenFlow, type TokenFlow } from '@/lib/token-flow';

/**
 * GET /api/token-map?address=0x… : the Token Map graph of one token (every transfer since launch,
 * holders, linked wallets, snipers). Reading the chain takes a few seconds, so each token is
 * cached here for 10 minutes.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE = new Map<string, { at: number; v: TokenFlow | null }>();
const TTL = 600_000;

type Info = { deployer?: string | null; curve?: string | null };

export async function GET(req: Request) {
  const a = (new URL(req.url).searchParams.get('address') ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return Response.json({ error: 'give a token address, 0x… (40 hex)' }, { status: 400 });
  const hit = CACHE.get(a);
  let v = hit && Date.now() - hit.at < TTL ? hit.v : undefined;
  if (v === undefined) {
    try {
      const info: Info = await fetch(`${API_URL}/tokens/${a}`, { signal: AbortSignal.timeout(8_000) })
        .then(async (r) => (r.ok ? ((await r.json()) as Info) : {}))
        .catch(() => ({}));
      v = await tokenFlow(a, { creator: info.deployer ?? null, curve: info.curve ?? null, block: null });
      CACHE.set(a, { at: Date.now(), v });
      if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value!);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  if (!v) return Response.json({ error: 'no transfers found for this address on Robinhood Chain' }, { status: 404 });
  return Response.json(v, { headers: { 'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
}
