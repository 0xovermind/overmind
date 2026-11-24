'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';
import { auth, useAuth } from '@/lib/auth';
import { usd } from '@/lib/format';
import { V1 } from '@/lib/members';
import { loadPro, OVHIVE_BUY_URL, PRO_MIN_DEFAULT, usePro } from '@/lib/pro';
import { TokenAvatar } from './bits';
import { SignalWhy } from './ai-bits';

interface Signal {
  id: string; token: string; kind: 'flip' | 'new'; side: 'buying' | 'selling'; score: number;
  prev_side: string | null; prev_score: number | null; voters: number; at: string;
  price_usd: number | null; market_cap_usd: number | null;
  symbol: string; name: string; image_url: string | null; price_now: number | null; market_cap_now: number | null; score_now: number | null;
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
};

/** What the token did since the signal (market cap, falling back to price). */
function since(s: Signal): number | null {
  const a = s.market_cap_usd ?? s.price_usd, b = s.market_cap_now ?? s.price_now;
  return a && b ? ((b - a) / a) * 100 : null;
}

function Row({ s }: { s: Signal }) {
  const up = s.side === 'buying';
  const ch = since(s);
  // A buying signal "worked" if the token went up after it; a selling one if it went down.
  const right = ch == null || Math.abs(ch) < 0.5 ? null : up ? ch > 0 : ch < 0;
  return (
    <li className="row-in">
      <Link href={`/token/${s.token}`} className="signal-row group grid grid-cols-[44px_1fr_auto] items-center gap-3 rounded-xl px-3 py-3 sm:grid-cols-[44px_1fr_150px_120px]">
        <TokenAvatar t={{ address: s.token, symbol: s.symbol, launchpad: null, image_url: s.image_url }} size={40} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] font-semibold">${s.symbol}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${up ? 'bg-[#3ddc97]/15 text-[#3ddc97]' : 'bg-[#ff5d6c]/15 text-[#ff5d6c]'}`}>
              {s.kind === 'new' ? (up ? 'Hive piling in' : 'Hive dumping') : up ? 'Flipped to buying' : 'Flipped to selling'}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {s.prev_score != null ? `${s.prev_score > 0 ? '+' : ''}${s.prev_score} → ` : ''}
            <span className={up ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}>{s.score > 0 ? '+' : ''}{s.score}</span>
            {' · '}{s.voters} smart voices · {ago(s.at)}
          </div>
        </div>
        <div className="hidden text-right font-mono text-xs text-muted sm:block">
          <div>at signal {usd(s.market_cap_usd)}</div>
          <div>now {usd(s.market_cap_now)}</div>
        </div>
        <div className={`text-right font-mono text-sm ${right == null ? 'text-muted' : right ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}`}>
          {ch == null ? '—' : `${ch > 0 ? '+' : ''}${ch.toFixed(ch > -10 && ch < 10 ? 1 : 0)}%`}
          <div className="text-[10px] text-muted">since signal</div>
        </div>
      </Link>
      <SignalWhy id={s.id} />
    </li>
  );
}

/** The hive signal feed: real time for Hive Pro, 30 minutes late for everyone else. */
export function SignalsView() {
  const pro = usePro();
  const { authenticated } = useAuth();
  const [scope, setScope] = useState<'pons' | 'all'>('pons');
  const [data, setData] = useState<{ signals: Signal[]; delayed: boolean; pending: number } | null>(null);

  const load = useCallback(async () => {
    try {
      if (pro?.pro) {
        const tk = await auth.getAccessToken();
        const r = await fetch(`${V1}/hive/signals?scope=${scope}`, { headers: tk ? { authorization: `Bearer ${tk}` } : {} });
        if (r.ok) { const j = (await r.json()) as { signals: Signal[] }; setData({ signals: j.signals, delayed: false, pending: 0 }); return; }
      }
      const r = await fetch(`${API_URL}/hive/signals?scope=${scope}`);
      const j = (await r.json()) as { signals: Signal[]; pending: number };
      setData({ signals: j.signals, delayed: true, pending: j.pending });
    } catch {
      setData((d) => d ?? { signals: [], delayed: true, pending: 0 });
    }
  }, [pro?.pro, scope]);

  useEffect(() => {
    setData(null);
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[920px] px-3 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hive signals</h1>
            <p className="mt-1 max-w-[60ch] text-sm text-muted">
              When the most profitable wallets on Robinhood Chain turn on a token together. Each signal shows what the token did after it.
            </p>
          </div>
          <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-ink/[0.04] p-1">
            {([['pons', 'Pons'], ['all', 'All chain']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setScope(k)} className={`rounded-md px-3 py-1 text-xs font-semibold ${scope === k ? 'bg-ink/[0.12] text-ink' : 'text-muted hover:text-ink'}`}>{label}</button>
            ))}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${data && !data.delayed ? 'pro-buy' : 'bg-ink/[0.08] text-muted'}`}>
            {data && !data.delayed ? 'Hive Pro · real time' : '30 min delay'}
          </span>
          </div>
        </div>

        {data?.delayed && (
          <div className="pro-banner mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
            <span className="text-sm">
              {data.pending > 0 ? <b>{data.pending} newer signal{data.pending === 1 ? '' : 's'} </b> : 'New signals '}
              {data.pending > 0 ? 'already live for Hive Pro.' : 'reach Hive Pro 30 minutes earlier.'}
              <span className="text-muted"> Hold {(pro?.threshold ?? PRO_MIN_DEFAULT).toLocaleString('en-US')} $OVHIVE to see them as they happen.</span>
            </span>
            <span className="flex gap-1.5">
              {!authenticated ? (
                <button type="button" onClick={() => auth.login()} className="rounded-md bg-ink/[0.1] px-2.5 py-1 text-xs hover:bg-ink/[0.16]">Sign in</button>
              ) : (
                <>
                  <button type="button" onClick={() => auth.linkWallet()} className="rounded-md bg-ink/[0.1] px-2.5 py-1 text-xs hover:bg-ink/[0.16]">Link wallet</button>
                  <button type="button" onClick={() => void loadPro(true)} className="rounded-md bg-ink/[0.1] px-2.5 py-1 text-xs hover:bg-ink/[0.16]">Re-check</button>
                </>
              )}
              <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="pro-buy rounded-md px-2.5 py-1 text-xs font-semibold">Get $OVHIVE</a>
            </span>
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-ink/[0.07] bg-surface p-2">
          {data === null ? (
            <p className="px-3 py-10 text-center text-sm text-muted">Reading the hive…</p>
          ) : data.signals.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted">
              No signals yet. The hive is checked every 5 minutes; a signal needs a clear lean from at least {scope === 'pons' ? 3 : 5} smart wallets.
            </p>
          ) : (
            <ul className="flex flex-col">{data.signals.map((s) => <Row key={s.id} s={s} />)}</ul>
          )}
        </section>
        <p className="mt-3 text-center text-[11px] text-muted">A read of public on-chain behaviour, not financial advice.</p>
      </div>
    </div>
  );
}
