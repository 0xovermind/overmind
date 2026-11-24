import type { Metadata } from 'next';
import { appShare } from '@/lib/share';
import { DnaSearch } from '@/components/terminal/dna-bits';

export const metadata: Metadata = appShare(
  'Wallet DNA',
  '/dna',
  'What kind of trader is a wallet? Sniper, diamond hands, scalper, bot: read any Robinhood Chain wallet from its trades.',
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const KINDS = [
  ['The Sniper', 'In within the first minute of launch'],
  ['Diamond Hands', 'Buys and sits for days'],
  ['The Sharpshooter', 'Few trades, most of them right'],
  ['The Scalper', 'In and out within the hour'],
  ['Paper Hands', 'Out at the first red candle'],
  ['The Machine', 'Trades like a bot, because it is one'],
  ['The Whale', 'Big size, moves charts'],
  ['The Degen', 'Many tokens, no fixed rules'],
] as const;

export default function DnaIndex() {
  return (
    <div className="h-full overflow-y-auto">
      <main className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-10">
      <div className="dna-orb pointer-events-none absolute left-1/2 top-0 -z-10 size-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(240,107,168,0.22),transparent_65%)] blur-2xl" />
      <div className="text-center">
        <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Wallet DNA</div>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight sm:text-5xl">What kind of trader is this wallet?</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted">
          Paste any Robinhood Chain wallet. Overmind reads its trades and tells you how it plays: when it buys, how long it holds, how often it&apos;s right.
          You get a card to share.
        </p>
      </div>
      <div className="mt-8">
        <DnaSearch />
      </div>
      <ul className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.map(([name, line], i) => (
          <li key={name} className="arena-card rounded-xl border border-ink/[0.07] bg-surface p-3" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="text-sm font-semibold">{name}</div>
            <div className="mt-1 text-xs text-muted">{line}</div>
          </li>
        ))}
      </ul>
    </main>
    </div>
  );
}
