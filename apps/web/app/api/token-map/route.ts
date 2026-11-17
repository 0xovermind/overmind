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
/** One build per token at a time: the page prewarms the map and the tab may ask again while it runs. */
const INFLIGHT = new Map<string, Promise<TokenFlow | null>>();

type Info = { deployer?: string | null; curve?: string | null; created_at?: string | null; symbol?: string | null; name?: string | null };

/** Robinhood Chain makes ~9.2 blocks a second. */
const BLOCKS_PER_S = 9.2;

/**
 * Start the transfer scan near the launch instead of block 0: from the token's age, with a wide margin
 * (age x 1.5 + 5,000 blocks), so the launch is never cut off and a young token needs one log query.
 */
async function launchBlockGuess(createdAt?: string | null): Promise<number | null> {
  if (!createdAt) return null;
  const ageS = (Date.now() - new Date(createdAt).getTime()) / 1000;
  if (!Number.isFinite(ageS) || ageS < 0) return null;
  try {
    const r = await fetch('https://rpc.mainnet.chain.robinhood.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(8_000),
    });
    const head = parseInt(((await r.json()) as { result?: string }).result ?? '', 16);
    if (!Number.isFinite(head)) return null; // RPC busy: scan the whole history instead
    return Math.max(0, Math.floor(head - ageS * BLOCKS_PER_S * 1.5 - 5_000));
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const a = (new URL(req.url).searchParams.get('address') ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return Response.json({ error: 'give a token address, 0x… (40 hex)' }, { status: 400 });
  const hit = CACHE.get(a);
  let v = hit && Date.now() - hit.at < TTL ? hit.v : undefined;
  if (v === undefined) {
    try {
      let job = INFLIGHT.get(a);
      if (!job) {
        job = (async () => {
          const info: Info = await fetch(`${API_URL}/tokens/${a}`, { signal: AbortSignal.timeout(8_000) })
            .then(async (r) => (r.ok ? ((await r.json()) as Info) : {}))
            .catch(() => ({}));
          const flow = await tokenFlow(a, { creator: info.deployer ?? null, curve: info.curve ?? null, block: await launchBlockGuess(info.created_at) });
          // The chain read keeps ASCII only; our index has the real (unicode) ticker and name.
          if (flow && info.symbol) flow.symbol = info.symbol;
          if (flow && info.name) flow.name = info.name;
          if (flow) CACHE.set(a, { at: Date.now(), v: flow }); // an empty result may be a busy RPC: retry next time
          if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value!);
          return flow;
        })().finally(() => INFLIGHT.delete(a));
        INFLIGHT.set(a, job);
      }
      v = await job;
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
    }
  }
  if (!v) return Response.json({ error: 'no transfers found for this address on Robinhood Chain' }, { status: 404 });
  return Response.json(v, { headers: { 'cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' } });
}
