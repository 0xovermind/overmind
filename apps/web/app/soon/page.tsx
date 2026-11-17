import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { GithubLogo, XLogo } from '@phosphor-icons/react/dist/ssr';
import { HeroSphere } from '@/components/landing/hero-sphere';
import { Countdown } from '@/components/landing/countdown';
import { GITHUB_URL } from '@/components/landing/sections';
import { X_URL } from '@/components/landing/ui';

export const viewport: Viewport = { themeColor: '#e5e4e0' };
export const metadata: Metadata = {
  title: { absolute: 'Overmind | Opens 17 Nov, 16:00 UTC' },
  twitter: { card: 'summary_large_image', site: '@0xovermind', title: 'Overmind | Opens 17 Nov, 16:00 UTC', description: 'The hive mind of Robinhood Chain. One live score per token from the best wallets and every call.', images: ['/og-overmind.jpg'] },
  description: 'The hive mind of Robinhood Chain. One live score per token from the best wallets and every call. Launching 17 Nov 2026, 16:00 UTC.',
  openGraph: { images: [{ url: '/og-overmind.jpg', width: 1200, height: 630 }] },
};

const LAUNCH_AT = process.env.NEXT_PUBLIC_LAUNCH_AT ?? '2026-11-17T16:00:00Z';

/** The launch gate: shown on every page until the launch time (middleware.ts redirects here). */
export const dynamic = 'force-dynamic';

export default function Soon() {
  // After the launch the countdown page sends everyone to the site.
  if (Date.now() >= Date.parse(LAUNCH_AT)) redirect('/');
  return (
    <div className="theme-paper relative isolate min-h-dvh overflow-hidden">
      <HeroSphere />
      <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col justify-between px-4 pb-8 pt-8 md:px-8">
        <header className="rise flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 100 100" aria-hidden>
              <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" />
              <circle cx="50" cy="50" r="21" fill="none" stroke="currentColor" strokeWidth="8" />
              <circle cx="50" cy="50" r="6" fill="currentColor" />
            </svg>
            <span className="text-[15px] font-bold uppercase tracking-[0.05em]">overmind</span>
          </span>
          <span className="label">Robinhood Chain</span>
        </header>

        <section className="mt-16 md:mt-0">
          <p className="label rise">Launching 17 Nov 2026 · 16:00 UTC</p>
          <h1 className="display mt-8 text-[16vw] sm:text-[90px] md:text-[120px]">
            {['One mind.', 'Every token.'].map((line, i) => (
              <span key={line} className="line-mask">
                <span className="line-up" style={{ animationDelay: `${0.1 + i * 0.12}s` }}>{line}</span>
              </span>
            ))}
          </h1>
          <Countdown to={LAUNCH_AT} />
        </section>

        <footer className="rise mt-12 grid gap-6 md:grid-cols-[1fr_auto] md:items-end" style={{ animationDelay: '0.3s' }}>
          <p className="max-w-[48ch] text-[15px] leading-[1.4] md:text-[18px]">
            The hive mind of Robinhood Chain: one live score per token from the 300 most profitable wallets and every call
            from humans and AI agents.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={X_URL} target="_blank" rel="noreferrer" className="pill-btn solid"><XLogo size={14} weight="bold" /> Follow</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="pill-btn"><GithubLogo size={14} weight="bold" /> GitHub</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
