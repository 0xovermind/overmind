import type { Metadata } from 'next';
import Link from 'next/link';
import { appShare } from '@/lib/share';
import { mcap, signedUsd } from '@/lib/daily';
import { ago, asTrendScope, asTrendWindow, getTrending, type TrendScope, type TrendWindow } from '@/lib/trending';
import { TokenAvatar } from '@/components/terminal/bits';

export const metadata: Metadata = appShare(
  'Trending with smart money',
  '/trending',
  'What the most profitable wallets on Robinhood Chain are buying right now, over the last hour, 6 hours or day.',
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const WINDOWS: TrendWindow[] = ['1h', '6h', '24h'];
const href = (w: TrendWindow, s: TrendScope) => {
  const q = new URLSearchParams();
  if (w !== '24h') q.set('window', w);
  if (s !== 'all') q.set('scope', s);
  const qs = q.toString();
  return qs ? `/trending?${qs}` : '/trending';
};
const pct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(1)}%`);
/** First smart buy within the last 24h: the hive only just found it. */
const fresh = (sec: number | null) => !!sec && Date.now() / 1000 - sec < 24 * 3600;

function Pills({ w, s }: { w: TrendWindow; s: TrendScope }) {
  const pill = (to: string, on: boolean, label: string) => (
    <Link key={label} href={to} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${on ? 'bg-ink/[0.12] text-ink' : 'text-muted hover:text-ink'}`}>{label}</Link>
  );
  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex gap-1 rounded-lg bg-ink/[0.04] p-1">{WINDOWS.map((x) => pill(href(x, s), x === w, x))}</div>
      <div className="flex gap-1 rounded-lg bg-ink/[0.04] p-1">{pill(href(w, 'all'), s === 'all', 'All chain')}{pill(href(w, 'pons'), s === 'pons', 'Pons')}</div>
    </div>
  );
}

export default async function TrendingPage({ searchParams }: { searchParams: Promise<{ window?: string; scope?: string }> }) {
  const sp = await searchParams;
  const w = asTrendWindow(sp.window);
  const s = asTrendScope(sp.scope);
  const d = await getTrending(w, s);
  const rows = d?.tokens ?? [];
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-3 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Trending · smart money · last {w}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">What smart money is buying right now</h1>
            <p className="mt-1 max-w-[64ch] text-sm text-muted">
              Tokens ranked by how many of the {d?.smart_wallets ?? 300} most profitable wallets on Robinhood Chain are adding to them. Click one for its chart, with
              every smart trade and Telegram call on it.
            </p>
          </div>
          <Pills w={w} s={s} />
        </div>

        {rows.length === 0 ? (
          <p className="mt-12 text-center text-sm text-muted">
            {d ? `Smart money is quiet ${w === '1h' ? 'this hour' : 'right now'}. Try a longer window.` : 'Loading the hive… check back in a minute.'}
          </p>
        ) : (
          <div className="mt-5 overflow-hidden rounded-2xl border border-ink/[0.07] bg-surface">
            <div className="hidden grid-cols-[28px_minmax(0,1.6fr)_90px_minmax(0,1.3fr)_100px_80px_90px] gap-3 border-b border-ink/[0.07] px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted md:grid">
              <span>#</span><span>Token</span><span className="text-right">Mcap</span><span>Smart wallets</span><span className="text-right">Net flow</span><span className="text-right">{w}</span><span className="text-right">Found</span>
            </div>
            <ul>
              {rows.map((r, i) => {
                const p = (100 * r.buyers) / Math.max(1, r.buyers + r.sellers);
                return (
                  <li key={r.token} className="border-b border-ink/[0.05] last:border-0">
                    <Link
                      href={`/token/${r.token}`}
                      className="signal-row grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:grid-cols-[28px_minmax(0,1.6fr)_90px_minmax(0,1.3fr)_100px_80px_90px]"
                    >
                      <span className={`font-mono text-sm ${i < 3 ? 'ovhive-grad font-semibold' : 'text-muted'}`}>{i + 1}</span>
                      <span className="flex min-w-0 items-center gap-3">
                        <TokenAvatar t={{ address: r.token, symbol: r.symbol, launchpad: r.launchpad, image_url: r.image_url }} size={34} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold">${r.symbol}</span>
                            {fresh(r.first_smart_at) && <span className="rounded bg-[#3ddc97]/15 px-1.5 py-px font-mono text-[10px] font-semibold text-[#3ddc97]">NEW</span>}
                          </span>
                          <span className="block truncate text-xs text-muted">{r.name}</span>
                        </span>
                      </span>
                      <span className="text-right font-mono text-sm md:order-none">{mcap(r.market_cap_usd)}</span>
                      <span className="col-span-3 flex items-center gap-2 md:col-span-1">
                        <span className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.06]">
                          <span style={{ width: `${p}%`, background: '#3ddc97' }} />
                          <span style={{ width: `${100 - p}%`, background: '#ff5d6c' }} />
                        </span>
                        <span className="whitespace-nowrap font-mono text-[11px] text-muted">{r.buyers} in · {r.sellers} out</span>
                      </span>
                      <span className={`hidden text-right font-mono text-sm md:block ${r.net_usd >= 0 ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}`}>{signedUsd(r.net_usd)}</span>
                      <span className={`hidden text-right font-mono text-sm md:block ${(r.change_pct ?? 0) >= 0 ? 'text-ink/85' : 'text-[#ff5d6c]'}`}>{pct(r.change_pct)}</span>
                      <span className="hidden text-right font-mono text-xs text-muted md:block" title="First smart money buy">{ago(r.first_smart_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="mt-4 text-center text-[11px] text-muted">
          In: smart wallets that added to the token in the window. Out: took money off or cut the position. Found: first smart money buy. Bots, snipers, spam and
          copycats left out. A read of public on-chain behaviour, not financial advice.
        </p>
      </div>
    </div>
  );
}
