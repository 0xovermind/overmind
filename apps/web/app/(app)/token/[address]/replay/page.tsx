import type { Metadata } from 'next';
import Link from 'next/link';
import { appShare } from '@/lib/share';
import { getReplay } from '@/lib/arena';
import { ReplayPlayer } from '@/components/terminal/replay-player';
import { TokenAvatar } from '@/components/terminal/bits';

// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  const a = address.toLowerCase();
  return appShare('Launch replay', `/token/${a}/replay`, 'Watch this token launch on Robinhood Chain, trade by trade: snipers, smart wallets, the dev.');
}

export default async function ReplayPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const r = await getReplay(address);
  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-5">
      {r ? (
        <>
          <header className="mb-4 flex flex-wrap items-center gap-3">
            <TokenAvatar t={{ address: r.token.address, symbol: r.token.symbol, launchpad: r.token.launchpad, image_url: r.token.imageUrl }} size={40} />
            <div>
              <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Launch replay</div>
              <h1 className="text-2xl font-bold tracking-tight">
                ${r.token.symbol} <span className="text-base font-normal text-muted">{r.token.name}</span>
              </h1>
            </div>
            <Link href={`/token/${r.token.address}`} className="ml-auto rounded-xl border border-ink/[0.1] px-3 py-2 text-sm transition hover:bg-ink/[0.04]">
              Back to the token
            </Link>
          </header>
          {r.events.length === 0 ? (
            <p className="rounded-2xl border border-ink/[0.07] bg-surface p-8 text-center text-sm text-muted">No trades yet to replay.</p>
          ) : (
            <ReplayPlayer r={r} />
          )}
        </>
      ) : (
        <p className="rounded-2xl border border-ink/[0.07] bg-surface p-8 text-center text-sm text-muted">Overmind does not index this token.</p>
      )}
    </main>
    </div>
  );
}
