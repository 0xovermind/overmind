'use client';

// The /pro page: what holding $OVHIVE unlocks, and the signed-in member's own status.
import Link from 'next/link';
import { auth, useAuth } from '@/lib/auth';
import { loadPro, OVHIVE_BUY_URL, PRO_MIN_DEFAULT, usePro } from '@/lib/pro';

const n0 = (n: number) => Math.round(n).toLocaleString('en-US');

const PERKS = [
  {
    icon: '⚡',
    title: 'Hive signals in real time',
    body: 'When the smart crowd flips on a token, you see it as it happens. Everyone else sees it 30 minutes later.',
    href: '/signals',
    cta: 'Open signals',
  },
  {
    icon: '📈',
    title: '7 and 30 day hive history',
    body: 'How the smart crowd has been buying and selling a token over the week and the month, not just today.',
    href: null,
    cta: 'On every token page',
  },
  {
    icon: '👁',
    title: 'Follow any wallet',
    body: 'Pick a wallet and get an alert on every buy, sell and transfer it makes, checked every minute. On your phone too.',
    href: '/watchlist',
    cta: 'Open watchlist',
  },
  {
    icon: '✦',
    title: 'Overmind AI on demand',
    body: 'A fresh AI read of any token right now, and Ask the hive: your own question, answered from Overmind’s data.',
    href: null,
    cta: 'On every token page',
  },
  {
    icon: '🧠',
    title: 'The Hive Pro badge',
    body: 'Next to your name on every call you post and on your profile, so people know you hold.',
    href: '/season',
    cta: 'Post a call',
  },
];

const COMPARE: [string, string, string][] = [
  ['Hive score, risk checks, charts', 'Yes', 'Yes'],
  ['Smart money and Telegram calls on charts', 'Yes', 'Yes'],
  ['Hive signals', '30 min delay', 'Real time'],
  ['Hive history', '1 day', '1, 7 and 30 days'],
  ['Token alerts (watchlist)', 'Yes', 'Yes'],
  ['Follow wallets', '—', 'Every move, every minute'],
  ['Overmind AI read', 'Shared, refreshed every 30 min', 'Fresh on demand + Ask the hive'],
  ['Badge on your calls', 'By holdings', '🧠 Hive Pro'],
];

const TIERS = [
  { icon: '🐝', name: 'Holder', min: 'any', note: 'A badge on your calls' },
  { icon: '🐝', name: 'Bee', min: '100K', note: 'A badge on your calls' },
  { icon: '🧠', name: 'Hive Pro', min: '1M', note: 'Everything on this page', pro: true },
  { icon: '👑', name: 'Queen', min: '10M', note: 'Hive Pro and the crown' },
];

function Status() {
  const { enabled, ready, authenticated } = useAuth();
  const s = usePro();
  const min = s?.threshold ?? PRO_MIN_DEFAULT;
  if (!enabled) return null;
  if (!ready || (authenticated && !s)) {
    return <p className="mt-4 font-mono text-xs text-muted">Checking your $OVHIVE…</p>;
  }
  if (!authenticated) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => auth.login()} className="pro-buy rounded-md px-4 py-2 text-sm font-semibold">
          Sign in to check your status
        </button>
        <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="rounded-md border border-ink/[0.12] px-4 py-2 text-sm font-semibold transition hover:bg-ink/[0.05]">
          Get $OVHIVE on Pons ↗
        </a>
      </div>
    );
  }
  const p = Math.min(1, (s?.balance ?? 0) / min);
  return (
    <div className={`mt-5 rounded-xl p-4 ${s?.pro ? 'pro-banner' : 'border border-ink/[0.08]'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">
          {s?.pro ? <><span aria-hidden>🧠</span> <span className="ovhive-grad">You’re Hive Pro.</span></> : 'Not Hive Pro yet'}
        </p>
        <p className="font-mono text-xs text-muted">
          {n0(s?.balance ?? 0)} / {n0(min)} $OVHIVE · {s?.wallets ?? 0} wallet{s?.wallets === 1 ? '' : 's'}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.06]">
        <div className="sync-fill h-full rounded-full" style={{ width: `${Math.max(p * 100, 1)}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {!s?.pro && (
          <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="pro-buy rounded-md px-3 py-1.5 text-xs font-semibold">
            Get {n0(Math.max(0, min - (s?.balance ?? 0)))} more on Pons ↗
          </a>
        )}
        <button type="button" onClick={() => void loadPro(true)} className="rounded-md border border-ink/[0.12] px-3 py-1.5 text-xs transition hover:bg-ink/[0.05]">
          Check again
        </button>
        <button type="button" onClick={() => auth.linkWallet()} className="rounded-md border border-ink/[0.12] px-3 py-1.5 text-xs transition hover:bg-ink/[0.05]">
          Link another wallet
        </button>
      </div>
    </div>
  );
}

export function ProView() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[900px] px-3 pb-16 pt-6 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">$OVHIVE · Hive Pro</p>

        <section className="mt-3 rounded-2xl border border-ink/[0.07] bg-surface p-6">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Hold {n0(PRO_MIN_DEFAULT)} $OVHIVE. <span className="ovhive-grad">See the hive first.</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            No subscription, no staking, no lock. Keep $OVHIVE in any wallet on your Overmind account and Hive Pro turns on. Sell and it turns off. Balances
            are read from Robinhood Chain and added up across every wallet you link.
          </p>
          <Status />
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          {PERKS.map((k) => (
            <div key={k.title} className="rounded-2xl border border-ink/[0.07] bg-surface p-5">
              <p className="text-2xl" aria-hidden>{k.icon}</p>
              <p className="mt-2 font-semibold">{k.title}</p>
              <p className="mt-1 text-sm text-muted">{k.body}</p>
              {k.href ? (
                <Link href={k.href} className="mt-3 inline-block text-xs font-semibold text-ink/80 hover:text-ink">{k.cta} →</Link>
              ) : (
                <p className="mt-3 text-xs text-muted">{k.cta}</p>
              )}
            </div>
          ))}
        </section>

        <section className="mt-4 overflow-hidden rounded-2xl border border-ink/[0.07] bg-surface">
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-ink/[0.07] px-5 py-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
            <span />
            <span>Free</span>
            <span className="ovhive-grad">Hive Pro</span>
          </div>
          {COMPARE.map(([k, free, pro]) => (
            <div key={k} className="grid grid-cols-[1.4fr_1fr_1fr] gap-3 border-b border-ink/[0.05] px-5 py-2.5 text-sm last:border-0">
              <span>{k}</span>
              <span className="text-muted">{free}</span>
              <span className="font-medium">{pro}</span>
            </div>
          ))}
        </section>

        <section className="mt-4 rounded-2xl border border-ink/[0.07] bg-surface p-6">
          <p className="text-sm text-muted">Holder badges</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {TIERS.map((t) => (
              <div key={t.name} className={`rounded-xl px-3 py-3 ${t.pro ? 'pro-banner' : 'border border-ink/[0.07]'}`}>
                <p className="text-xl" aria-hidden>{t.icon}</p>
                <p className={`mt-1 text-sm font-semibold ${t.pro ? 'ovhive-grad' : ''}`}>{t.name}</p>
                <p className="font-mono text-xs text-muted">{t.min} $OVHIVE</p>
                <p className="mt-1 text-xs text-muted">{t.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted">
            Every burn and the dev wallet are public: <Link href="/burns" className="underline decoration-ink/30 hover:text-ink">overmind.ink/burns</Link>. Holding $OVHIVE is not an
            investment promise. Hive Pro is what it unlocks on Overmind, nothing more.
          </p>
        </section>
      </div>
    </div>
  );
}
