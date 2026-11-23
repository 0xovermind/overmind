// $OVHIVE burns: every Transfer of the token to the dead address (0x…dEaD) or the zero address, read
// from the chain. The first read walks the token's whole history in 100k-block ranges (the public RPC's
// limit); after that each refresh only reads the blocks since the last one. Kept in memory.
import { Rpc } from './rpc';

export const OVHIVE = '0x53d38ba0c217cd4d1f74a36503731023fcd7f358';
/** The block $OVHIVE was created in (Pons launch). */
const FROM_BLOCK = 116_731_924n;
const RANGE = 100_000n;
const REFRESH_MS = 5 * 60_000;
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const DEAD = '0x000000000000000000000000000000000000000000000000000000000000dead';
const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
const SUPPLY = 1_000_000_000;

export interface Burn { tx: string; block: number; time: string | null; from: string; to: 'dead' | 'zero'; amount: number }
interface RawLog { transactionHash: string; blockNumber: string; blockTimestamp?: string; topics: string[]; data: string }

let state: { scanned: bigint; burns: Burn[]; at: number } = { scanned: FROM_BLOCK - 1n, burns: [], at: 0 };
let refreshing = 0;

async function refresh(rpcUrl: string) {
  const rpc = new Rpc(rpcUrl);
  const head = BigInt(await rpc.call<string>('eth_blockNumber', []));
  // Built on the side and swapped in at the end, so readers never see a half-read list.
  const next = { scanned: state.scanned, burns: state.burns.map((x) => ({ ...x })) };
  for (let a = next.scanned + 1n; a <= head; a += RANGE) {
    const b = a + RANGE - 1n > head ? head : a + RANGE - 1n;
    const logs = await rpc.call<RawLog[]>('eth_getLogs', [{
      fromBlock: `0x${a.toString(16)}`, toBlock: `0x${b.toString(16)}`, address: OVHIVE, topics: [TRANSFER, null, [DEAD, ZERO]],
    }]);
    for (const l of logs) {
      next.burns.push({
        tx: l.transactionHash,
        block: Number(BigInt(l.blockNumber)),
        time: l.blockTimestamp && BigInt(l.blockTimestamp) > 0n ? new Date(Number(BigInt(l.blockTimestamp)) * 1000).toISOString() : null,
        from: `0x${l.topics[1]!.slice(26)}`,
        to: l.topics[2] === DEAD ? 'dead' : 'zero',
        amount: Number(BigInt(l.data) / 10n ** 12n) / 1e6,
      });
    }
    next.scanned = b;
  }
  // Fill missing timestamps (the RPC sometimes omits them) from the block itself.
  for (const x of next.burns.filter((x) => !x.time)) {
    const blk = await rpc.call<{ timestamp: string } | null>('eth_getBlockByNumber', [`0x${x.block.toString(16)}`, false]);
    if (blk) x.time = new Date(Number(BigInt(blk.timestamp)) * 1000).toISOString();
  }
  state = { ...next, at: Date.now() };
}

/** Thrown while the first full read is still running (in another request): the API answers 503. */
export class BurnsNotReady extends Error {}

export async function ovhiveBurns(rpcUrl: string) {
  // The request that refreshes waits for it: in workerd, I/O started by one request is cancelled when
  // that request ends, so a refresh left running in the background would hang forever. After the first
  // read a refresh is one short getLogs. Others serve the cached list meanwhile (unless there is none).
  if (Date.now() - state.at > REFRESH_MS && (!refreshing || Date.now() - refreshing > 120_000)) {
    refreshing = Date.now();
    try {
      await refresh(rpcUrl);
    } catch (err) {
      console.log('burns refresh failed', err);
      if (!state.at) throw err;
    } finally {
      refreshing = 0;
    }
  }
  if (!state.at) throw new BurnsNotReady('burns: first read still running');
  const burns = [...state.burns].sort((a, b) => b.block - a.block);
  const total = burns.reduce((s, x) => s + x.amount, 0);
  return { token: OVHIVE, supply: SUPPLY, total, share: total / SUPPLY, count: burns.length, updatedAt: new Date(state.at).toISOString(), burns };
}
