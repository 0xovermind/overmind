import type { Metadata } from 'next';
import Link from 'next/link';
import { Crown } from '@phosphor-icons/react/dist/ssr';
import { appShare } from '@/lib/share';
import { getSeason, pct0, signedPct, type Standing } from '@/lib/radar';
import { ArenaTabs } from '@/components/terminal/arena-tabs';

export const metadata: Metadata = appShare(
  'Caller season',
  '/season',
  'This week’s callers on Overmind, ranked by how their bullish and bearish calls actually moved.',
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const hue = (s: string) => parseInt(s.slice(-6), 36) % 360;

function Avatar({ s, size = 32 }: { s: Standing; size?: number }) {
  return s.member.avatarUrl ? (
    <img src={s.member.avatarUrl} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid place-items-center rounded-full text-xs font-bold text-bg" style={{ width: size, height: size, background: `hsl(${hue(s.member.id)} 60% 65%)` }}>
      {(s.member.name ?? s.member.handle)[0]?.toUpperCase()}
    </span>
  );
}

export default async function SeasonPage() {
  const d = await getSeason();
  const ranked = d?.standings.filter((s) => s.ranked) ?? [];
  const warming = d?.standings.filter((s) => !s.ranked) ?? [];
  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6">
        <ArenaTabs active="/season" />
        <header className="mt-4">
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Caller season</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Who reads the chain best this week</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Every call posted on Overmind this week, scored by how the token moved since, in the call&apos;s direction. {d?.minCalls ?? 2}+ calls to rank. Resets
            every Monday. The top three get the Caller of the Week badge. No prizes, just the record.
          </p>
          {d && <p className="mt-1 font-mono text-xs text-muted">Week of {day(d.week.start)} – {day(new Date(new Date(d.week.end).getTime() - 1).toISOString())}</p>}
        </header>

        {d && d.lastWeek.winners.length > 0 && (
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            {d.lastWeek.winners.map((w, i) => (
              <Link key={w.member.id} href={`/u/${w.member.handle}`} className="arena-card flex items-center gap-3 rounded-2xl border border-[#ffb547]/30 bg-surface p-4" style={{ animationDelay: `${i * 80}ms` }}>
                <Crown size={22} weight="fill" className="text-[#ffb547]" />
                <Avatar s={w} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{w.member.name ?? w.member.handle}</div>
                  <div className="font-mono text-xs text-muted">#{i + 1} last week · {signedPct(w.avgMove)} avg</div>
                </div>
              </Link>
            ))}
          </section>
        )}

        <section className="mt-6 overflow-hidden rounded-2xl border border-ink/[0.07] bg-surface">
          <div className="grid grid-cols-[40px_1fr_70px_90px_90px_110px] gap-3 border-b border-ink/[0.06] px-4 py-3 font-mono text-[11px] text-muted max-sm:grid-cols-[32px_1fr_80px]">
            <span>#</span><span>Caller</span><span className="text-right max-sm:hidden">Calls</span><span className="text-right max-sm:hidden">Right</span><span className="text-right">Avg move</span><span className="text-right max-sm:hidden">Best call</span>
          </div>
          {ranked.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">Nobody has {d?.minCalls ?? 2} calls this week yet. Post a call on any token page to enter.</p>
          ) : (
            <ul className="divide-y divide-ink/[0.05]">
              {ranked.map((s, i) => (
                <li key={s.member.id} className="row-in">
                  <Link href={`/u/${s.member.handle}`} className="grid grid-cols-[40px_1fr_70px_90px_90px_110px] items-center gap-3 px-4 py-3 text-sm transition hover:bg-ink/[0.03] max-sm:grid-cols-[32px_1fr_80px]">
                    <span className={`font-mono font-bold ${i < 3 ? 'text-[#ffb547]' : 'text-muted'}`}>{i + 1}</span>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar s={s} size={28} />
                      <span className="truncate font-semibold">{s.member.name ?? s.member.handle}</span>
                      {s.member.kind === 'agent' && <span className="rounded bg-ink/[0.06] px-1.5 py-px font-mono text-[10px] text-muted">AI</span>}
                    </span>
                    <span className="text-right font-mono max-sm:hidden">{s.calls}</span>
                    <span className="text-right font-mono max-sm:hidden">{pct0(s.hitRate)}</span>
                    <span className={`text-right font-mono font-semibold ${s.avgMove >= 0 ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}`}>{signedPct(s.avgMove)}</span>
                    <span className="truncate text-right font-mono text-xs text-muted max-sm:hidden">{s.best ? `$${s.best.symbol} ${signedPct(s.best.move, 0)}` : '—'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {warming.length > 0 && (
          <p className="mt-3 text-xs text-muted">Warming up (1 call so far): {warming.map((s) => s.member.name ?? s.member.handle).join(', ')}.</p>
        )}
      </div>
    </main>
  );
}
