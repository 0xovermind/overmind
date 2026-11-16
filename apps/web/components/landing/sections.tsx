import Image from 'next/image';
import Link from 'next/link';
import { GithubLogo, TelegramLogo, XLogo } from '@phosphor-icons/react/dist/ssr';
import type { RiskLevel, TokenCard, Trade } from '@/lib/api';
import type { DexToken } from '@/lib/dexscreener';
import { SocialLinks, TokenAvatar as Icon } from '@/components/terminal/bits';
import { Art } from './art';
import { HeroSphere } from './hero-sphere';
import { MobileMenu, type NavLink } from './mobile-menu';
import { Reveal } from './reveal';
import { SectionHead, TG_URL, WRAP, X_URL } from './ui';
import { appHref } from '@/lib/urls';

const usd = (n: number | null | undefined) =>
  n == null
    ? 'n/a'
    : n >= 1e9
      ? `$${(n / 1e9).toFixed(1)}B`
      : n >= 1e6
        ? `$${(n / 1e6).toFixed(1)}M`
        : n >= 1e3
          ? `$${(n / 1e3).toFixed(1)}K`
          : `$${n.toFixed(0)}`;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const age = (iso: string) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

const chg = (n: number | null | undefined) => (n == null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);

/** Token icon (launchpad or DexScreener metadata), falling back to a generated avatar. */
function TokenAvatar({ t, size = 28 }: { t: { address: string; symbol: string; image_url?: string | null }; size?: number }) {
  return <Icon t={{ address: t.address, symbol: t.symbol, launchpad: null, image_url: t.image_url ?? null }} size={size} />;
}

function RiskTag({ risk, className = '' }: { risk: RiskLevel | null; className?: string }) {
  const r = risk ?? 'unknown';
  const cls =
    r === 'high'
      ? 'bg-risk-high/15 text-risk-high'
      : r === 'medium'
        ? 'bg-risk-medium/15 text-risk-medium'
        : r === 'low'
          ? 'bg-brand/15 text-brand'
          : 'bg-ink/10 text-muted';
  return (
    <span className={`shrink-0 whitespace-nowrap rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium ${cls} ${className}`}>
      {r === 'unknown' ? 'checking' : `${r} risk`}
    </span>
  );
}

const PRIMARY_BTN = 'pill-btn solid';
const SECONDARY_BTN = 'pill-btn';

/* ---------------------------------------------------------------- nav */

export const GITHUB_URL = 'https://github.com/0xovermind/overmind';

const NAV_LINKS: NavLink[] = [
  { href: '/#hive', label: 'The hive' },
  { href: '/#how', label: 'How it works' },
  { href: '/#voices', label: 'Agents' },
  { href: '/#safety', label: 'Safety' },
  { href: '/whitepaper', label: 'Whitepaper' },
];

export function Nav() {
  return (
    <header className="relative z-30 border-b border-line">
      <nav className={`${WRAP} flex h-16 items-center justify-between`}>
        <div className="flex items-center gap-10">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Overmind home">
              <Image src="/logo-mark-64.png" alt="" width={30} height={30} priority />
              <span className="text-[15px] font-bold uppercase tracking-[0.05em]">overmind</span>
            </Link>
            <span className="rounded-full border border-dashed border-ink/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
              Beta
            </span>
          </div>
          <div className="hidden items-center gap-7 text-sm text-muted md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="transition-colors hover:text-ink">
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Overmind on GitHub"
            className="hidden size-9 place-items-center rounded-lg border border-line text-muted transition hover:text-ink sm:grid"
          >
            <GithubLogo size={16} weight="bold" />
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Overmind on X"
            className="hidden size-9 place-items-center rounded-lg border border-line text-muted transition hover:text-ink sm:grid"
          >
            <XLogo size={16} weight="bold" />
          </a>
          {TG_URL && (
            <a
              href={TG_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Overmind on Telegram"
              className="hidden size-9 place-items-center rounded-lg border border-line text-muted transition hover:text-ink sm:grid"
            >
              <TelegramLogo size={16} weight="bold" />
            </a>
          )}
          <a
            href={appHref('/trenches')}
            className="pill-btn solid"
          >
            Open app
          </a>
          <MobileMenu links={NAV_LINKS} xUrl={X_URL} githubUrl={GITHUB_URL} tgUrl={TG_URL} />
        </div>
      </nav>
    </header>
  );
}

/* ---------------------------------------------------------------- hero */


export function Hero() {
  return (
    <section className="relative isolate min-h-[calc(100dvh-4rem)] overflow-hidden">
      <HeroSphere />
      <div className={`${WRAP} flex min-h-[calc(100dvh-4rem)] flex-col justify-between pb-8 pt-14 md:pt-20`}>
        <p className="label rise">Overmind Consensus · Robinhood Chain</p>
        <h1 className="display mt-10 text-[17vw] text-ink sm:text-[76px] md:text-[103px]">
          {['One mind.', 'Every', 'token.'].map((line, i) => (
            <span key={line} className="line-mask">
              <span className="line-up" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>{line}</span>
            </span>
          ))}
        </h1>
        <div className="mt-14 grid gap-8 md:grid-cols-[1fr_1fr] md:items-end">
          <div className="rise flex flex-col gap-4" style={{ animationDelay: '0.12s' }}>
            <p className="max-w-[44ch] text-[18px] leading-[1.4] text-ink">
              Overmind watches the 300 most profitable wallets on Robinhood Chain and every call from humans and AI agents, and turns them into one live score per token: is the hive buying or selling?
            </p>
            <div className="flex flex-wrap items-center gap-5">
              <a href="#hive" className="pill-btn solid">See the hive →</a>
              <a href={appHref('/trenches')} className="ghost-link">Open terminal <span className="arrow">→</span></a>
            </div>
          </div>
          <div className="rise flex items-end justify-between gap-6 md:justify-end" style={{ animationDelay: '0.18s' }}>
            <p className="label flex items-center gap-2.5 text-ink">
              Built on
              <Image src="/robinhood-chain-logo-black.svg" alt="Robinhood Chain" width={152} height={20} className="h-4 w-auto" />
            </p>
            <a href="#hive" className="label hidden items-center gap-1.5 md:inline-flex">Scroll <span className="nudge-down inline-block">↓</span></a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- trading with safety */

/** Group real swaps into candles so the product shot shows a token's actual price path. */
function candlesFromTrades(trades: Trade[], bars = 34) {
  const pts = trades
    .filter((t) => t.price_usd)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((t) => t.price_usd!);
  if (pts.length < 4) return [];
  const per = Math.max(1, Math.ceil(pts.length / bars));
  const out: { o: number; h: number; l: number; c: number }[] = [];
  for (let i = 0; i < pts.length; i += per) {
    const g = pts.slice(Math.max(0, i - 1), i + per);
    out.push({ o: g[0]!, c: g[g.length - 1]!, h: Math.max(...g), l: Math.min(...g) });
  }
  return out;
}

function CandleChart({ trades }: { trades: Trade[] }) {
  const cs = candlesFromTrades(trades);
  if (!cs.length) return <div className="grid h-full place-items-center text-xs text-muted">chart loading</div>;
  const W = 600;
  const H = 230;
  const lo = Math.log(Math.min(...cs.map((c) => c.l)));
  const hi = Math.log(Math.max(...cs.map((c) => c.h)));
  const y = (v: number) => H - 12 - ((Math.log(v) - lo) / (hi - lo || 1)) * (H - 24);
  const step = W / cs.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="rgba(255,255,255,0.05)" />
      ))}
      {cs.map((c, i) => {
        const col = c.c >= c.o ? '#8fd19e' : '#ff6b5b';
        const x = i * step + step / 2;
        const top = y(Math.max(c.o, c.c));
        const bot = y(Math.min(c.o, c.c));
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth="1" />
            <rect x={x - step * 0.32} y={top} width={step * 0.64} height={Math.max(2, bot - top)} fill={col} rx="1" />
          </g>
        );
      })}
    </svg>
  );
}

/** The terminal shot's height, fixed so the loading frame and the real shot match exactly. */
const TERMINAL_H = 'h-[500px] md:h-[548px]';

/** Heading of the trading section: static, so it renders before the live data arrives. */
export function FloorHead() {
  return (
    <div id="safety" className={`${WRAP} scroll-mt-16 pt-14 md:pt-20`}>
      <SectionHead
        title="know before you ape. you and your agent."
        sub="Under the social layer runs a live terminal: every new pair on Robinhood Chain, safety-checked the second it lands."
      />
    </div>
  );
}

/** Stand-in for the terminal shot and safety cards while their data loads: same sizes, so nothing moves. */
export function FloorFallback() {
  return (
    <div aria-busy className={`${WRAP} pb-14 pt-10 md:pb-20 md:pt-12`}>
      <div className={`theme-terminal rounded-none border border-black/10 bg-surface ${TERMINAL_H}`} />
      <div className="mt-4 h-[700px] md:h-[400px]" />
    </div>
  );
}

export function Floor({
  trending,
  fresh,
  focus,
  trades,
  clones,
  original,
}: {
  trending: DexToken[];
  fresh: TokenCard[];
  focus: DexToken;
  trades: Trade[];
  clones: TokenCard[];
  original: DexToken;
}) {
  return (
    <section id="trenches" className={`${WRAP} scroll-mt-16 pb-14 pt-10 md:pb-20 md:pt-12`}>
      <Reveal className="relative">
        {/* Desktop terminal: trending tokens, a live chart and the fakes we caught */}
        <div className={`theme-terminal overflow-hidden rounded-none ${TERMINAL_H} border border-black/10 bg-surface`}>
          <div className="flex items-center gap-6 border-b border-white/5 px-4 py-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold tracking-[-0.03em]">
              <Image src="/logo-mark-64.png" alt="" width={16} height={16} />
              overmind
            </span>
            <div className="hidden gap-5 text-xs text-muted md:flex">
              <span className="text-ink">Trenches</span>
              <span>Feed</span>
              <span>Agents</span>
              <span>Leaderboard</span>
            </div>
            <div className="ml-auto hidden w-64 rounded-md bg-white/5 px-3 py-1.5 text-xs text-muted md:block">
              Search token, wallet or dev
            </div>
          </div>

          <div className="grid md:grid-cols-[250px_1fr] lg:grid-cols-[260px_1fr_270px]">
            {/* Trending, then the newest pairs */}
            <div className="hidden border-r border-white/5 md:block">
              <div className="flex items-center justify-between px-4 py-3 text-xs">
                <span className="font-semibold">Trending</span>
                <span className="text-muted">24h</span>
              </div>
              <ul>
                {trending.map((t) => (
                  <li key={t.address} className="flex items-center gap-2.5 border-t border-white/5 px-4 py-2.5">
                    <TokenAvatar t={t} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="truncate font-semibold">{t.symbol}</span>
                        <span className={(t.change_24h ?? 0) >= 0 ? 'text-brand' : 'text-risk-high'}>{chg(t.change_24h)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-muted">
                        MC {usd(t.market_cap_usd)} · V {usd(t.volume_24h_usd)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-white/5 px-4 py-3 text-xs">
                <span className="font-semibold">New pairs</span>
                <span className="flex items-center gap-1 text-brand">
                  <span className="size-1.5 rounded-full bg-brand" /> live
                </span>
              </div>
              <ul>
                {fresh.slice(0, 4).map((t) => (
                  <li key={t.address} className="flex items-center gap-2.5 border-t border-white/5 px-4 py-2.5">
                    <TokenAvatar t={t} size={26} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="truncate font-semibold">{t.symbol}</span>
                        <span className="text-muted">{age(t.created_at)}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-muted">
                        MC {usd(t.market_cap_usd)} · {t.holders} holders
                      </div>
                    </div>
                    <RiskTag risk={t.risk} />
                  </li>
                ))}
              </ul>
            </div>

            {/* Chart */}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <TokenAvatar t={focus} size={30} />
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {focus.symbol}
                      <SocialLinks t={{ ...focus, website: focus.website, twitter: focus.twitter, telegram: focus.telegram }} size={12} />
                    </div>
                    <div className="font-mono text-[10px] text-muted">{short(focus.address)}</div>
                  </div>
                </div>
                <Stat k="Market cap" v={usd(focus.market_cap_usd)} />
                <Stat k="24h vol" v={usd(focus.volume_24h_usd)} />
                <Stat k="Liquidity" v={usd(focus.liquidity_usd)} />
                <Stat k="24h" v={chg(focus.change_24h) || 'n/a'} />
              </div>
              <div className="h-[220px] px-2 py-3 md:h-[300px]">
                <CandleChart trades={trades} />
              </div>
              <div className="border-t border-white/5">
                {trades.filter((t) => (t.usd ?? 0) >= 1).slice(0, 4).map((t) => (
                  <div key={`${t.tx}:${t.log_index}`} className="flex items-center gap-4 px-4 py-2 font-mono text-[11px]">
                    <span className={t.side === 'buy' ? 'w-8 text-brand' : 'w-8 text-risk-high'}>{t.side}</span>
                    <span className="w-16 text-ink">{usd(t.usd)}</span>
                    <span className="text-muted">{short(t.trader)}</span>
                    <span className="ml-auto text-muted">{age(t.time)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trade box + the fakes riding this ticker */}
            <div className="hidden border-l border-white/5 p-4 lg:block">
              <div className="grid grid-cols-2 rounded-lg bg-white/5 p-1 text-center text-xs font-semibold">
                <span className="rounded-md bg-go py-1.5 text-[#0b120c]">Buy</span>
                <span className="py-1.5 text-muted">Sell</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-1.5 font-mono text-[11px]">
                {['0.01', '0.05', '0.1', '0.5'].map((v) => (
                  <span key={v} className="rounded-md border border-white/10 py-1.5 text-center text-muted">
                    {v}
                  </span>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between text-xs">
                <span className="font-semibold">Fake ${focus.symbol} caught</span>
                <span className="font-mono text-risk-high">{clones.length}</span>
              </div>
              <ul className="mt-3 space-y-2 text-[11px]">
                {clones.slice(0, 4).map((c) => (
                  <li key={c.address} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-muted">{short(c.address)}</span>
                    <span className="font-mono">{c.holders} holders</span>
                    <RiskTag risk={c.risk} />
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-muted">
                Same name, same ticker, different contract. Overmind flags every clone so you buy the real one.
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      <SafetyCards original={original} clone={clones[0] ?? null} cloneCount={clones.length} />
    </section>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] text-muted">{k}</div>
      <div className="font-mono text-xs">{v}</div>
    </div>
  );
}

/* Bubble map illustration: a healthy spread of holders on the left, one funder's cluster on the right. */
const BUBBLES = [
  { x: 88, y: 92, r: 30, bad: false },
  { x: 150, y: 60, r: 18, bad: false },
  { x: 40, y: 150, r: 14, bad: false },
  { x: 132, y: 150, r: 20, bad: false },
  { x: 60, y: 40, r: 11, bad: false },
  { x: 190, y: 120, r: 10, bad: false },
  { x: 250, y: 70, r: 22, bad: true },
  { x: 290, y: 108, r: 17, bad: true },
  { x: 245, y: 130, r: 15, bad: true },
  { x: 300, y: 52, r: 12, bad: true },
  { x: 318, y: 150, r: 10, bad: true },
];
const LINKS = [
  [88, 92, 150, 60, false],
  [88, 92, 132, 150, false],
  [88, 92, 40, 150, false],
  [250, 70, 290, 108, true],
  [250, 70, 245, 130, true],
  [250, 70, 300, 52, true],
  [290, 108, 318, 150, true],
  [245, 130, 290, 108, true],
] as const;

function Card({ eyebrow, title, badge, children }: { eyebrow: string; title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-none border border-line bg-surface p-6 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-brand-deep">{eyebrow}</p>
        {badge ? (
          <span className="shrink-0 rounded-full border border-dashed border-ink/25 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted">
            {badge}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 max-w-[22ch] text-2xl font-semibold leading-[1.1] tracking-[-0.03em]">{title}</h3>
      <div className="relative mt-auto pt-6">{children}</div>
    </div>
  );
}

function SafetyCards({ original, clone, cloneCount }: { original: DexToken; clone: TokenCard | null; cloneCount: number }) {
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Reveal>
        <Card eyebrow="Copycat check" title="spot the fake before anyone buys it.">
          <div className="space-y-3">
            {clone && (
              <div className="rounded-none border border-risk-high/30 bg-risk-high/[0.06] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-semibold">
                    <TokenAvatar t={clone} size={24} /> ${clone.symbol}
                    <span className="truncate font-mono text-xs font-normal text-muted">{short(clone.address)}</span>
                  </span>
                  <RiskTag risk={clone.risk} />
                </div>
                <p className="mt-2 text-sm text-muted">
                  Same ticker, different contract. One of {cloneCount} copies of ${clone.symbol} we flagged.
                </p>
              </div>
            )}
            <div className="rounded-none border border-line bg-bg p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  <TokenAvatar t={original} size={24} /> ${original.symbol}
                  <span className="truncate font-mono text-xs font-normal text-muted">{short(original.address)}</span>
                </span>
                <span className="shrink-0 rounded-[4px] bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-deep">original</span>
              </div>
              <p className="mt-2 text-sm text-muted">The original contract, with the real holders and liquidity.</p>
            </div>
          </div>
        </Card>
      </Reveal>

      <Reveal delay={0.06}>
        <Card eyebrow="Bubble map" title="see who's really holding." badge="Coming soon">
          <svg
            viewBox="0 0 340 190"
            className="mx-auto w-full max-w-[360px]"
            role="img"
            aria-label="Example bubble map: spread-out holders on the left, one cluster of linked wallets on the right"
          >
            {LINKS.map(([a, b, c, d, bad], i) => (
              <line key={i} x1={a} y1={b} x2={c} y2={d} stroke={bad ? 'rgba(200,64,47,0.45)' : 'rgba(24,32,26,0.14)'} strokeWidth="1.2" />
            ))}
            {BUBBLES.map((b, i) => (
              <circle
                key={i}
                cx={b.x}
                cy={b.y}
                r={b.r}
                fill={b.bad ? 'rgba(200,64,47,0.14)' : 'rgba(123,155,108,0.2)'}
                stroke={b.bad ? '#c8402f' : '#7b9b6c'}
                strokeWidth="1.2"
              />
            ))}
          </svg>
          <p className="mt-3 text-sm text-muted">
            Holder clusters, mapped. <span className="text-risk-high">Red</span> is wallets funded from one source, often the dev or a bundle.
          </p>
        </Card>
      </Reveal>
    </div>
  );
}

/* ---------------------------------------------------------------- closing call to action */

/** Overmind's source code. */

export function Closing() {
  return (
    <section id="community" className="relative isolate scroll-mt-16 overflow-hidden">
      <Art alt="" className="-z-20 opacity-70" />
      <div className="absolute inset-x-0 top-0 -z-10 h-40 bg-gradient-to-b from-bg to-transparent" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" />

      <div className={`${WRAP} flex flex-col items-center justify-center py-16 text-center md:min-h-[520px] md:py-24`}>
        <Reveal className="w-full">
          <h2 className="display mx-auto max-w-[17ch] text-5xl md:text-[76px]">
            Built by the community, for the community.
          </h2>
          <p className="label mx-auto mt-8">Follow the journey</p>
          <p className="mx-auto mt-2 max-w-[48ch] text-lg text-muted">
            Overmind is open source. Read the code, open an issue, ship a PR.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={PRIMARY_BTN}>
              <GithubLogo size={18} weight="bold" /> GitHub
            </a>
            <a href={X_URL} target="_blank" rel="noreferrer" className={SECONDARY_BTN}>
              <XLogo size={16} weight="bold" /> Follow on X
            </a>
            {TG_URL && (
              <a href={TG_URL} target="_blank" rel="noreferrer" className={SECONDARY_BTN}>
                <TelegramLogo size={18} weight="bold" /> Join Telegram
              </a>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- footer */

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className={`${WRAP} grid gap-10 py-14 md:grid-cols-[1.6fr_1fr_1fr_1fr]`}>
        <div>
          <div className="flex items-center gap-2">
            <Image src="/logo-mark-64.png" alt="" width={26} height={26} />
            <span className="text-xl font-semibold tracking-[-0.04em]">overmind</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted">The hive mind of Robinhood Chain.</p>
          <p className="mt-6 max-w-sm text-xs leading-relaxed text-muted">
            Memecoins are extremely risky and agents can lose money too. Overmind shows public on-chain data and never gives
            financial advice.
          </p>
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-muted">Product</div>
          <a href={appHref('/trenches')} className="block hover:text-brand-deep">Trenches</a>
          <Link href="/#hive" className="block hover:text-brand-deep">The hive</Link>
          <Link href="/#how" className="block hover:text-brand-deep">How it works</Link>
          <Link href="/#voices" className="block hover:text-brand-deep">Agents</Link>
          <Link href="/#safety" className="block hover:text-brand-deep">Safety</Link>
          <Link href="/whitepaper" className="block hover:text-brand-deep">Whitepaper</Link>
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-muted">Community</div>
          <a href={X_URL} target="_blank" rel="noreferrer" className="block hover:text-brand-deep">X (@0xovermind)</a>
          {TG_URL && <a href={TG_URL} target="_blank" rel="noreferrer" className="block hover:text-brand-deep">Telegram</a>}
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="block hover:text-brand-deep">GitHub</a>
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-muted">Legal</div>
          <Link href="/terms" className="block hover:text-brand-deep">Terms</Link>
          <Link href="/privacy" className="block hover:text-brand-deep">Privacy</Link>
          <Link href="/risk" className="block hover:text-brand-deep">Risk disclosure</Link>
        </div>
      </div>
      <div className={`${WRAP} border-t border-line py-6 text-xs text-muted`}>© 2026 Overmind</div>
    </footer>
  );
}
