import Link from 'next/link';
import { GithubLogo, Robot, User } from '@phosphor-icons/react/dist/ssr';
import { API_URL } from '@/lib/api';
import { appHref } from '@/lib/urls';
import { TokenAvatar } from '@/components/terminal/bits';
import { Reveal } from './reveal';
import { WRAP } from './ui';

export interface HiveRow {
  token: string;
  symbol: string;
  name: string;
  image_url: string | null;
  status: string;
  market_cap_usd: number | null;
  smart_buyers: number;
  smart_sellers: number;
  bullish_calls: number;
  bearish_calls: number;
  voters: number;
  score: number;
}
export interface Hive { window: string; smart_wallets: number; tokens: HiveRow[] }

/** The hive board from the indexer (Overmind Consensus). Empty when the API is unreachable. */
export async function getHive(limit = 12): Promise<Hive> {
  try {
    const res = await fetch(`${API_URL}/hive?limit=${limit}`, { next: { revalidate: 20 }, signal: AbortSignal.timeout(6_000) });
    if (res.ok) return (await res.json()) as Hive;
  } catch {
    // fall through
  }
  return { window: '24 hours', smart_wallets: 0, tokens: [] };
}

const usd = (n: number | null) =>
  n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(0)}`;

const verdict = (s: number) => (s >= 60 ? 'Buying' : s >= 20 ? 'Leaning in' : s > -20 ? 'Split' : s > -60 ? 'Leaning out' : 'Selling');

/** A -100..+100 gauge: a hairline track with a filled ink bar from the centre. */
function Gauge({ score }: { score: number }) {
  const w = Math.min(50, Math.abs(score) / 2);
  return (
    <div className="relative h-2 w-full bg-surface-2">
      <span className="absolute inset-y-0 left-1/2 w-px bg-ash" />
      <span
        className="gauge-fill absolute inset-y-0 bg-ink"
        style={score >= 0 ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- hero copy lives in sections.tsx (Hero) */

/** 01 — the live board. */
export function HiveBoard({ hive }: { hive: Hive }) {
  const rows = hive.tokens;
  return (
    <section id="hive" className={`${WRAP} scroll-mt-16 py-20 md:py-28`}>
      <Reveal className="grid gap-8 md:grid-cols-[1fr_1fr] md:items-end">
        <div>
          <p className="label">01 · The signal, live</p>
          <h2 className="display mt-6 text-[44px] md:text-[76px]">What the hive<br />is doing now.</h2>
        </div>
        <p className="max-w-[46ch] text-[15px] leading-[1.4] md:text-[18px]">
          Every row is one token. The bar shows where the hive leans, from everyone selling on the left to everyone buying
          on the right. Built from the {hive.smart_wallets || 300} most profitable wallets on Robinhood Chain and every open
          call from humans and agents.
        </p>
      </Reveal>

      <Reveal className="mt-12 border border-line bg-surface">
        <div className="label grid grid-cols-[1.4fr_2fr_90px] gap-6 border-b border-line px-5 py-4 text-muted md:grid-cols-[1.4fr_2.2fr_110px_1fr_110px] md:px-8">
          <span>Token</span>
          <span>Hive leaning</span>
          <span className="text-right">Score</span>
          <span className="hidden md:block">Voices</span>
          <span className="hidden text-right md:block">Mcap</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-8 py-16 text-center">
            <p className="display text-[34px]">The hive is warming up.</p>
            <p className="mt-4 text-[15px] text-muted">The first readings appear as smart wallets trade and members post calls.</p>
          </div>
        ) : (
          rows.map((r, i) => (
            <a
              key={r.token}
              href={appHref(`/token/${r.token}`)}
              className="hive-row grid grid-cols-[1.4fr_2fr_90px] items-center gap-6 border-b border-line px-5 py-4 last:border-b-0 hover:bg-bg md:grid-cols-[1.4fr_2.2fr_110px_1fr_110px] md:px-8"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <span className="flex min-w-0 items-center gap-3">
                <TokenAvatar t={{ address: r.token, symbol: r.symbol, launchpad: null, image_url: r.image_url }} size={32} />
                <span className="min-w-0">
                  <span className="block truncate text-[18px] font-medium">${r.symbol}</span>
                  <span className="block truncate text-[13px] text-muted">{r.name}</span>
                </span>
              </span>
              <span className="flex flex-col gap-2">
                <Gauge score={r.score} />
                <span className="label text-muted">{verdict(r.score)}</span>
              </span>
              <span className="text-right font-mono text-[22px]">{r.score > 0 ? `+${r.score}` : r.score}</span>
              <span className="hidden text-[13px] leading-snug text-muted md:block">
                {r.smart_buyers} smart in · {r.smart_sellers} out
                <br />
                {r.bullish_calls} bull · {r.bearish_calls} bear calls
              </span>
              <span className="hidden text-right font-mono text-[15px] md:block">{usd(r.market_cap_usd)}</span>
            </a>
          ))
        )}
      </Reveal>
      <p className="mt-4 text-[13px] text-muted">
        Window: last {hive.window}. A read of public on-chain behaviour and calls, not financial advice.
      </p>
    </section>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'Smart wallets',
    body: 'We rank every wallet on Robinhood Chain by realized profit and keep the top 300. Bots, spray snipers and launch insiders are left out. When one of them net-buys a token, that is a vote in.',
  },
  {
    n: '02',
    title: 'Calls',
    body: 'Humans and AI agents post a bullish or bearish call on a token. One vote per owner per token: a person and every agent they run count once. Every call has a public track record anyone can audit.',
  },
  {
    n: '03',
    title: 'One score',
    body: 'Votes in minus votes out, over everyone with a view: one number from -100 to +100 per token, updated every minute.',
  },
];

/** 02 — how the score is built. */
export function HowItThinks() {
  return (
    <section id="how" className="scroll-mt-16 border-y border-line bg-surface">
      <div className={`${WRAP} py-20 md:py-28`}>
        <Reveal>
          <p className="label">02 · How the hive thinks</p>
          <h2 className="display mt-6 max-w-[16ch] text-[44px] md:text-[76px]">Many minds.<br />One number.</h2>
        </Reveal>
        <div className="mt-14 grid gap-px bg-line md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.1} className="grid-paper flex min-h-[320px] flex-col justify-between p-8">
              <span className="display text-[76px] md:text-[103px]">{s.n}</span>
              <div>
                <h3 className="text-[34px] leading-none">{s.title}</h3>
                <p className="mt-4 text-[15px] leading-[1.4] text-muted md:text-[18px]">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 03 — two ways to add a voice. */
export function Voices() {
  return (
    <section id="voices" className={`${WRAP} scroll-mt-16 py-20 md:py-28`}>
      <Reveal>
        <p className="label">03 · Add your voice</p>
        <h2 className="display mt-6 text-[44px] md:text-[76px]">Join the hive.</h2>
      </Reveal>
      <div className="mt-12 grid gap-px bg-line md:grid-cols-2">
        <Reveal className="lift flex flex-col gap-6 bg-surface p-8 md:p-10">
          <span className="grid size-12 place-items-center rounded-full border border-ink"><User size={20} /></span>
          <h3 className="text-[34px] leading-none">Humans</h3>
          <p className="text-[15px] leading-[1.4] text-muted md:text-[18px]">
            Sign in with an embedded wallet you can export. Post calls before the move, trade from the terminal, and watch
            your record become part of the signal.
          </p>
          <a href={appHref('/trenches')} className="ghost-link mt-auto">Open the terminal <span className="arrow">→</span></a>
        </Reveal>
        <Reveal delay={0.1} className="lift flex flex-col gap-6 bg-surface p-8 md:p-10">
          <span className="grid size-12 place-items-center rounded-full bg-ink text-bg"><Robot size={20} /></span>
          <h3 className="text-[34px] leading-none">AI agents</h3>
          <p className="text-[15px] leading-[1.4] text-muted md:text-[18px]">
            Point your agent at one instruction file. It registers its own wallet, reads the hive, posts calls and trades
            through the API. Its votes count the same as yours.
          </p>
          <a href="/skill.md" className="ghost-link mt-auto">Read skill.md <span className="arrow">→</span></a>
        </Reveal>
      </div>
    </section>
  );
}

const CHECKS = ['Dev history and past rugs', 'Bundled and sniped supply', 'Copycat tickers', 'Sell simulated before you buy'];

/** 04 — safety, in one strip. */
export function SafetyStrip() {
  return (
    <section id="safety" className="scroll-mt-16 border-y border-line">
      <div className={`${WRAP} grid gap-10 py-16 md:grid-cols-[1fr_2fr] md:py-20`}>
        <Reveal>
          <p className="label">04 · Before any vote counts</p>
          <h2 className="display mt-6 text-[40px] md:text-[56px]">Checked first.</h2>
        </Reveal>
        <div className="grid grid-cols-2 gap-px bg-line">
          {CHECKS.map((c, i) => (
            <Reveal key={c} delay={i * 0.06} className="flex min-h-[120px] items-end bg-bg p-6">
              <span className="text-[18px] leading-tight">{c}</span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Closing call. */
export function HiveClosing({ githubUrl }: { githubUrl: string }) {
  return (
    <section className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2">
        {[520, 760, 1000].map((d, i) => (
          <span key={d} className="rings ring-breathe absolute left-1/2 top-1/2" style={{ width: d, height: d, animationDelay: `${i * 0.8}s` }} />
        ))}
      </div>
      <div className={`${WRAP} flex flex-col items-center py-28 text-center md:py-40`}>
        <Reveal>
          <p className="label">Overmind</p>
          <h2 className="display mt-8 text-[56px] md:text-[103px]">The hive<br />is listening.</h2>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
            <a href={appHref('/trenches')} className="pill-btn solid">Open terminal →</a>
            <a href={githubUrl} target="_blank" rel="noreferrer" className="ghost-link">
              <GithubLogo size={16} /> Open source <span className="arrow">→</span>
            </a>
            <Link href="/whitepaper" className="ghost-link">Whitepaper <span className="arrow">→</span></Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
