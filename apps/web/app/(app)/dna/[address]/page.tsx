import type { Metadata } from 'next';
import Link from 'next/link';
import { appShare } from '@/lib/share';
import { DNA_COLOR, getDna, holdLabel, isWallet, type Dna } from '@/lib/arena';
import { DnaRoast, DnaSearch, DnaShare } from '@/components/terminal/dna-bits';
import { usd } from '@/lib/format';

// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  const w = address.toLowerCase();
  const img = `/dna/${w}/image`;
  return appShare(`Wallet DNA ${short(w)}`, `/dna/${w}`, 'What kind of trader this wallet is, read from its trades on Robinhood Chain.', {
    openGraph: { images: [{ url: img, width: 1600, height: 900 }] },
    twitter: { card: 'summary_large_image', images: [img] },
  });
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-xl bg-ink/[0.035] px-3.5 py-3">
      <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${tone === 'up' ? 'text-[#3ddc97]' : tone === 'down' ? 'text-[#ff5d6c]' : ''}`}>{value}</div>
    </div>
  );
}

function Card({ d }: { d: Dna }) {
  const c = DNA_COLOR[d.archetype.id] ?? '#f06ba8';
  const s = d.stats;
  return (
    <section className="arena-card relative overflow-hidden rounded-3xl border border-ink/[0.08] bg-surface p-6 sm:p-8">
      <div className="dna-orb pointer-events-none absolute -right-24 -top-24 size-80 rounded-full blur-3xl" style={{ background: `${c}33` }} />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
          <span>WALLET DNA</span>
          <a href={`https://robinhoodchain.blockscout.com/address/${d.wallet}`} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
            {short(d.wallet)} ↗
          </a>
        </div>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-6xl" style={{ color: c }}>
          {d.archetype.name}
        </h1>
        <p className="mt-2 text-base text-ink/80">{d.archetype.line}</p>
        {d.traits.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {d.traits.map((t) => (
              <span key={t} className="rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: `${c}55`, color: c }}>
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Win rate" value={s.winRate == null ? '—' : `${Math.round(s.winRate * 100)}%`} />
          <Stat label="Realized" value={`${s.realizedUsd >= 0 ? '+' : '-'}${usd(Math.abs(s.realizedUsd))}`} tone={s.realizedUsd >= 0 ? 'up' : 'down'} />
          <Stat label="Typical hold" value={holdLabel(s.medianHoldS)} />
          <Stat label="Tokens traded" value={String(s.tokens)} />
          <Stat label="Trades" value={s.trades.toLocaleString('en-US')} />
          <Stat label="Volume" value={usd(s.volumeUsd)} />
          <Stat label="Sniped launches" value={`${Math.round(s.snipeRate * 100)}%`} />
          <Stat label="Busiest hour" value={s.favoriteHourUtc == null ? '—' : `${String(s.favoriteHourUtc).padStart(2, '0')}:00 UTC`} />
        </div>
        {(d.best || d.worst) && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {d.best && (
              <Link href={`/token/${d.best.token}`} className="rounded-xl bg-[#3ddc97]/[0.07] px-3.5 py-3 text-sm transition hover:bg-[#3ddc97]/[0.12]">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Best trade</span>
                <div className="mt-1 font-semibold">
                  ${d.best.symbol} <span className="text-[#3ddc97]">+{usd(d.best.realized)}</span>
                </div>
              </Link>
            )}
            {d.worst && (
              <Link href={`/token/${d.worst.token}`} className="rounded-xl bg-[#ff5d6c]/[0.07] px-3.5 py-3 text-sm transition hover:bg-[#ff5d6c]/[0.12]">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Worst trade</span>
                <div className="mt-1 font-semibold">
                  ${d.worst.symbol} <span className="text-[#ff5d6c]">-{usd(Math.abs(d.worst.realized))}</span>
                </div>
              </Link>
            )}
          </div>
        )}
        <div className="mt-4">
          <DnaRoast wallet={d.wallet} />
        </div>
        <div className="mt-5">
          <DnaShare wallet={d.wallet} archetype={d.archetype.name} />
        </div>
      </div>
    </section>
  );
}

export default async function DnaPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const w = address.toLowerCase();
  const d = isWallet(w) ? await getDna(w) : null;
  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
      {d ? (
        <Card d={d} />
      ) : (
        <section className="rounded-3xl border border-ink/[0.08] bg-surface p-8 text-center">
          <h1 className="text-2xl font-bold">No trades to read</h1>
          <p className="mt-2 text-sm text-muted">
            {isWallet(w) ? `Overmind hasn't seen ${short(w)} trade on Robinhood Chain yet.` : 'That is not a wallet address.'}
          </p>
        </section>
      )}
      <div className="mt-8">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.14em] text-muted">Read another wallet</div>
        <DnaSearch />
      </div>
      <p className="mt-6 text-xs text-muted">
        Read from this wallet&apos;s swaps that Overmind indexed (its latest 20,000). Realized profit counts the cost of the share it sold. Not financial advice.
      </p>
    </main>
    </div>
  );
}
