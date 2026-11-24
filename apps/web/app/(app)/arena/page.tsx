import type { Metadata } from 'next';
import Link from 'next/link';
import { appShare } from '@/lib/share';
import { asHorizon, getArena, HORIZON_LABEL, SOURCE, type ArenaCall, type ArenaSource, type ArenaSourceStats, type Outcome } from '@/lib/arena';
import { TokenAvatar } from '@/components/terminal/bits';

export const metadata: Metadata = appShare(
  'Arena: Hive vs Crowd vs AI',
  '/arena',
  'Three ways to read a token on Robinhood Chain, one scoreboard: smart wallets, the crowd and Overmind AI, scored against the price.',
  { openGraph: { images: [{ url: '/arena/image', width: 1600, height: 900 }] }, twitter: { card: 'summary_large_image', images: ['/arena/image'] } },
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const pct = (n: number | null, d = 0) => (n == null ? '—' : `${(n * 100).toFixed(d)}%`);
const signedPct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`);
const when = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`;
};
const OUTCOME: Record<Outcome, { label: string; cls: string }> = {
  win: { label: 'Right', cls: 'text-[#3ddc97]' },
  loss: { label: 'Wrong', cls: 'text-[#ff5d6c]' },
  push: { label: 'Flat', cls: 'text-muted' },
  open: { label: 'Open', cls: 'text-muted' },
};

function SourceCard({ s, leader, rank }: { s: ArenaSourceStats; leader: boolean; rank: number }) {
  const meta = SOURCE[s.source];
  const decided = s.wins + s.losses;
  return (
    <section
      className="arena-card relative overflow-hidden rounded-2xl border bg-surface p-5"
      style={{ borderColor: leader ? `${meta.color}66` : 'color-mix(in srgb, var(--color-ink) 7%, transparent)', animationDelay: `${rank * 80}ms` }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full opacity-20 blur-3xl" style={{ background: meta.color }} />
      <div className="relative flex items-center justify-between">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{meta.who}</div>
          <h2 className="mt-1 text-xl font-bold tracking-tight">{meta.name}</h2>
        </div>
        {leader && (
          <span className="rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-bg" style={{ background: meta.color }}>
            Leading
          </span>
        )}
      </div>
      <div className="relative mt-5 flex items-end gap-3">
        <div className="text-5xl font-extrabold tabular-nums tracking-tight" style={{ color: decided ? meta.color : undefined }}>
          {decided ? pct(s.winRate) : '—'}
        </div>
        <div className="pb-1.5 text-sm text-muted">right</div>
      </div>
      <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
        <div className="arena-bar h-full rounded-full" style={{ width: `${(s.winRate ?? 0) * 100}%`, background: meta.color }} />
      </div>
      <dl className="relative mt-4 grid grid-cols-3 gap-2 font-mono text-xs">
        <div>
          <dt className="text-muted">W · L · flat</dt>
          <dd className="mt-0.5 text-ink">
            {s.wins} · {s.losses} · {s.pushes}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Avg edge</dt>
          <dd className={`mt-0.5 ${s.edge == null ? 'text-ink' : s.edge >= 0 ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}`}>{signedPct(s.edge)}</dd>
        </div>
        <div>
          <dt className="text-muted">Streak</dt>
          <dd className={`mt-0.5 ${s.streak?.kind === 'win' ? 'text-[#3ddc97]' : s.streak ? 'text-[#ff5d6c]' : 'text-ink'}`}>
            {s.streak ? `${s.streak.n} ${s.streak.kind === 'win' ? 'right' : 'wrong'}` : '—'}
          </dd>
        </div>
      </dl>
      <p className="relative mt-4 text-xs leading-relaxed text-muted">
        {s.calls} calls · {s.open} still open. {meta.how}
      </p>
    </section>
  );
}

function DailyBars({ daily }: { daily: { day: string; hive: number | null; crowd: number | null; ai: number | null }[] }) {
  const W = 700;
  const H = 150;
  const group = W / daily.length;
  const bw = 14;
  const order: ArenaSource[] = ['hive', 'crowd', 'ai'];
  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label="Share of right calls per day">
      {[0.25, 0.5, 0.75, 1].map((y) => (
        <line key={y} x1={0} x2={W} y1={H - y * H} y2={H - y * H} stroke="color-mix(in srgb, var(--color-ink) 6%, transparent)" strokeDasharray={y === 0.5 ? '4 4' : undefined} />
      ))}
      {daily.map((d, i) => {
        const cx = i * group + group / 2;
        return (
          <g key={d.day}>
            {order.map((src, j) => {
              const v = d[src];
              if (v == null) return null;
              const h = Math.max(2, v * H);
              return (
                <rect key={src} className="arena-col" style={{ animationDelay: `${i * 40 + j * 20}ms` }} x={cx + (j - 1.5) * (bw + 3)} y={H - h} width={bw} height={h} rx={3} fill={SOURCE[src].color}>
                  <title>{`${SOURCE[src].name}: ${Math.round(v * 100)}% right`}</title>
                </rect>
              );
            })}
            <text x={cx} y={H + 17} textAnchor="middle" fontSize={11} fill="color-mix(in srgb, var(--color-ink) 45%, transparent)" fontFamily="ui-monospace, monospace">
              {new Date(`${d.day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CallRow({ c }: { c: ArenaCall }) {
  const meta = SOURCE[c.source];
  const o = OUTCOME[c.outcome];
  return (
    <li className="row-in">
      <Link href={`/token/${c.token.address}`} className="grid grid-cols-[110px_1fr_90px_80px_70px] items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-ink/[0.03] max-sm:grid-cols-[1fr_auto_auto]">
        <span className="flex items-center gap-2 font-mono text-xs max-sm:hidden">
          <span className="size-2 rounded-full" style={{ background: meta.color }} />
          {meta.name}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <TokenAvatar t={{ address: c.token.address, symbol: c.token.symbol ?? '?', launchpad: null, image_url: c.token.imageUrl }} size={24} />
          <span className="truncate font-semibold">${c.token.symbol ?? '?'}</span>
          <span className={`font-mono text-xs ${c.stance === 'bullish' ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}`}>{c.stance}</span>
        </span>
        <span className="font-mono text-xs text-muted max-sm:hidden">{when(c.at)}</span>
        <span className={`text-right font-mono text-xs ${c.move == null ? 'text-muted' : c.move >= 0 ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}`}>{signedPct(c.move)}</span>
        <span className={`text-right font-mono text-xs font-semibold ${o.cls}`}>{o.label}</span>
      </Link>
    </li>
  );
}

export default async function ArenaPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const h = asHorizon((await searchParams).h);
  const a = await getArena(h);
  const sources = a?.sources ?? [];
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Arena</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Hive <span className="text-muted">vs</span> Crowd <span className="text-muted">vs</span> AI
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Three ways to read a token, one scoreboard. Every bullish or bearish call is stored with its price and scored against the price {HORIZON_LABEL[h]} later.
            A move under {Math.round((a?.push ?? 0.02) * 100)}% either way counts as flat.
          </p>
        </div>
        <nav className="flex rounded-xl border border-ink/[0.08] p-1 font-mono text-xs">
          {([1, 24, 168] as const).map((x) => (
            <Link key={x} href={`/arena?h=${x}`} className={`rounded-lg px-3 py-1.5 transition ${x === h ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}>
              {x === 168 ? '7d' : `${x}h`}
            </Link>
          ))}
        </nav>
      </header>

      {!a ? (
        <p className="mt-10 rounded-2xl border border-ink/[0.07] bg-surface p-8 text-center text-sm text-muted">The arena is loading its scoreboard. Try again in a minute.</p>
      ) : (
        <>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {sources.map((s, i) => (
              <SourceCard key={s.source} s={s} leader={a.leader === s.source} rank={i} />
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-2xl border border-ink/[0.07] bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Right calls per day</h2>
                <div className="flex gap-3 font-mono text-[11px] text-muted">
                  {(['hive', 'crowd', 'ai'] as const).map((s) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: SOURCE[s].color }} />
                      {SOURCE[s].name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <DailyBars daily={a.daily} />
              </div>
            </section>
            <section className="rounded-2xl border border-ink/[0.07] bg-surface p-5">
              <h2 className="font-semibold">Clashes</h2>
              <p className="mt-1 text-xs text-muted">Same token, opposite sides, within 6 hours. Who read it right.</p>
              {a.clashes.length === 0 ? (
                <p className="mt-6 text-sm text-muted">No clashes yet. They show up when two sides disagree on the same token.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {a.clashes.slice(0, 6).map((c, i) => (
                    <li key={i} className="row-in flex items-center gap-3 rounded-xl bg-ink/[0.03] px-3 py-2 text-sm">
                      <Link href={`/token/${c.token.address}`} className="font-semibold hover:underline">${c.token.symbol ?? '?'}</Link>
                      <span className="flex-1 font-mono text-xs text-muted">
                        {c.sides.map((s) => `${SOURCE[s.source].name} ${s.stance}`).join(' · ')}
                      </span>
                      <span className="font-mono text-xs font-semibold" style={{ color: c.winner && c.winner !== 'push' ? SOURCE[c.winner].color : undefined }}>
                        {c.winner == null ? 'open' : c.winner === 'push' ? 'flat' : `${SOURCE[c.winner].name} won`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="mt-3 overflow-hidden rounded-2xl border border-ink/[0.07] bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.06] px-4 py-3">
              <h2 className="font-semibold">Latest calls</h2>
              <span className="font-mono text-xs text-muted">move {HORIZON_LABEL[h]} after the call, in the call&apos;s direction</span>
            </div>
            {a.recent.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted">No calls yet.</p>
            ) : (
              <ul className="divide-y divide-ink/[0.05]">
                {a.recent.slice(0, 40).map((c) => (
                  <CallRow key={c.id} c={c} />
                ))}
              </ul>
            )}
          </section>

          <section className="mt-3 rounded-2xl border border-ink/[0.07] bg-surface p-5 text-sm text-muted">
            <h2 className="font-semibold text-ink">Join the crowd</h2>
            <p className="mt-1">
              The crowd is you. Vote bullish or bearish on any token page (no account needed). When 3+ votes agree on a token, the crowd makes its call and it gets scored
              like the others. Scores use Overmind&apos;s own price data. Nothing here is financial advice.
            </p>
            {sources.find((s) => s.source === 'crowd')?.calls === 0 && (
              <p className="mt-2 text-ink">The crowd has not made a call yet. One token with 3 votes is enough to start.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
