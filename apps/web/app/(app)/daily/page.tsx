import type { Metadata } from 'next';
import { SectionTabs } from '@/components/terminal/section-tabs';
import Link from 'next/link';
import { appShare } from '@/lib/share';
import { asScope, dailyDate, getDaily, mcap, signedUsd, type DailyRow, type Scope } from '@/lib/daily';
import { TokenAvatar } from '@/components/terminal/bits';
import { DailyRecap } from '@/components/terminal/ai-bits';

export const metadata: Metadata = appShare(
  'Hive Daily',
  '/daily',
  'What the most profitable wallets on Robinhood Chain bought and sold in the last 24 hours.',
  { openGraph: { images: [{ url: '/daily/image', width: 1600, height: 900 }] }, twitter: { card: 'summary_large_image', images: ['/daily/image'] } },
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

function Col({ title, rows, buy }: { title: string; rows: DailyRow[]; buy: boolean }) {
  const color = buy ? '#3ddc97' : '#ff5d6c';
  return (
    <section className="rounded-2xl border border-ink/[0.07] bg-surface p-4">
      <h2 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em]" style={{ color }}>
        <span className="size-2 rounded-full" style={{ background: color }} />
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">Nothing clear in the last 24 hours.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((r) => {
            const p = (100 * r.buyers) / Math.max(1, r.buyers + r.sellers);
            return (
              <li key={r.token}>
                <Link href={`/token/${r.token}`} className="signal-row grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl px-2 py-3">
                  <TokenAvatar t={{ address: r.token, symbol: r.symbol, launchpad: null, image_url: r.image_url }} size={38} />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate font-semibold">${r.symbol}</span>
                      <span className="font-mono text-xs text-muted">mcap {mcap(r.market_cap_usd)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                        <div style={{ width: `${p}%`, background: '#3ddc97' }} />
                        <div style={{ width: `${100 - p}%`, background: '#ff5d6c' }} />
                      </div>
                      <span className="whitespace-nowrap font-mono text-[11px] text-muted">{r.buyers} in · {r.sellers} out</span>
                    </div>
                  </div>
                  <span className="font-mono text-base" style={{ color }}>{signedUsd(r.net_usd)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Tabs({ scope }: { scope: Scope }) {
  const tab = (s: Scope, label: string) => (
    <Link href={s === 'pons' ? '/daily' : '/daily?scope=all'} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${scope === s ? 'bg-ink/[0.12] text-ink' : 'text-muted hover:text-ink'}`}>{label}</Link>
  );
  return <div className="flex gap-1 rounded-lg bg-ink/[0.04] p-1">{tab('pons', 'Pons')}{tab('all', 'All chain')}</div>;
}

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const scope = asScope((await searchParams).scope);
  const d = await getDaily(5, scope);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1000px] px-3 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionTabs section="signals" active="/daily" className="mb-3" />
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Hive Daily · last 24h{d ? ` · ${dailyDate(d.at)}` : ''}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">What the profitable wallets did today</h1>
            <p className="mt-1 max-w-[62ch] text-sm text-muted">
              Net USD of the {d?.smart_wallets ?? 300} most profitable {scope === 'pons' ? 'Pons traders' : 'wallets on Robinhood Chain'}. Bots, snipers, dev dumps, spam and copycat tokens left out.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs scope={scope} />
            <a href={`/daily/image${scope === 'all' ? '?scope=all' : ''}`} target="_blank" rel="noopener noreferrer" className="pro-buy rounded-md px-3 py-1.5 text-xs font-semibold">Share image</a>
          </div>
        </div>
        {d && <DailyRecap scope={scope} />}
        {d ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Col title="Buying" rows={d.buying} buy />
            <Col title="Selling" rows={d.selling} buy={false} />
          </div>
        ) : (
          <p className="mt-10 text-center text-sm text-muted">The hive is warming up. Check back in a few minutes.</p>
        )}
        <p className="mt-4 text-center text-[11px] text-muted">A read of public on-chain behaviour, not financial advice.</p>
      </div>
    </div>
  );
}
