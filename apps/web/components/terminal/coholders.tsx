'use client';

// "Who bought with you": the wallets that bought this token within 30 minutes of a wallet's first buy, and
// how many of them are still in. For a signed-in member it reads their own wallet; anyone can paste one.
// Plus the link to the launch replay.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FilmStrip, UsersThree } from '@phosphor-icons/react';
import { V1 } from '@/lib/members';
import { isWallet, type CoHolders as Data } from '@/lib/arena';
import { usd } from '@/lib/format';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const STATUS = {
  holding: { label: 'holding', color: '#3ddc97' },
  trimmed: { label: 'trimmed', color: '#facb0e' },
  exited: { label: 'sold out', color: '#ff5d6c' },
} as const;

export function LaunchTools({ token, symbol, wallet }: { token: string; symbol: string; wallet: string | null }) {
  const [w, setW] = useState<string | null>(wallet);
  const [input, setInput] = useState('');
  const [d, setD] = useState<Data | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'none' | 'done'>('idle');
  const [open, setOpen] = useState(false);

  useEffect(() => setW(wallet), [wallet]);
  useEffect(() => {
    if (!w) return;
    let live = true;
    setState('loading');
    fetch(`${V1}/tokens/${token}/coholders?wallet=${w.toLowerCase()}`)
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setState('none');
        setD((await r.json()) as Data);
        setState('done');
      })
      .catch(() => live && setState('none'));
    return () => {
      live = false;
    };
  }, [token, w]);

  const bar = d && d.total ? [d.holding, d.trimmed, d.exited].map((n) => (100 * n) / d.total) : null;
  return (
    <section className="rounded-2xl border border-ink/[0.06] bg-surface p-4">
      <Link
        href={`/token/${token}/replay`}
        className="group flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#f06ba8]/[0.12] to-[#78bae6]/[0.1] px-3.5 py-3 transition hover:from-[#f06ba8]/[0.18] active:scale-[0.98]"
      >
        <FilmStrip size={20} className="text-[#f06ba8]" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Replay the launch</div>
          <div className="text-xs text-muted">${symbol}&apos;s first trades, played back</div>
        </div>
        <span className="text-muted transition group-hover:translate-x-0.5">→</span>
      </Link>

      <div className="mt-4 flex items-center gap-2">
        <UsersThree size={16} className="text-muted" />
        <h3 className="text-sm font-semibold">Who bought with {wallet && w === wallet ? 'you' : 'this wallet'}</h3>
      </div>
      {!w || state === 'none' ? (
        <div className="mt-2">
          <p className="text-xs text-muted">
            {state === 'none' ? 'This wallet never bought here.' : 'Paste a wallet: see who bought within 30 minutes of it, and who is still in.'}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isWallet(input.trim())) setW(input.trim());
            }}
            className="mt-2 flex gap-1.5"
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="0x…" spellCheck={false} className="min-w-0 flex-1 rounded-lg border border-ink/[0.1] bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none focus:border-brand/50" />
            <button type="submit" className="rounded-lg bg-ink/[0.08] px-3 text-xs transition hover:bg-ink/[0.12] active:scale-[0.96]">Check</button>
          </form>
        </div>
      ) : state === 'loading' || !d ? (
        <div className="skel mt-3 h-10 rounded-lg bg-gradient-to-r from-ink/[0.04] via-ink/[0.08] to-ink/[0.04] bg-[length:200%_100%]" />
      ) : d.total === 0 ? (
        <p className="mt-2 text-xs text-muted">Nobody else bought within 30 minutes of that first buy.</p>
      ) : (
        <div className="row-in mt-2">
          <p className="text-sm">
            <span className="font-semibold">{d.total}</span> wallets bought with {wallet && w === wallet ? 'you' : short(w)}.{' '}
            <span style={{ color: STATUS.holding.color }}>{d.holding} still in</span>,{' '}
            <span style={{ color: STATUS.trimmed.color }}>{d.trimmed} trimmed</span>,{' '}
            <span style={{ color: STATUS.exited.color }}>{d.exited} sold out</span>.
          </p>
          {bar && (
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-ink/[0.06]">
              {bar.map((pc, i) => (
                <div key={i} className="arena-bar" style={{ width: `${pc}%`, background: Object.values(STATUS)[i]!.color }} />
              ))}
            </div>
          )}
          {d.left24h > 0 && (
            <p className="mt-2 text-xs text-[#ff5d6c]">
              {d.left24h} of them sold in the last 24h ({usd(d.soldLast24hUsd)}).
            </p>
          )}
          <button type="button" onClick={() => setOpen((x) => !x)} className="mt-2 text-xs text-muted hover:text-ink">
            {open ? 'Hide wallets' : 'Show wallets'}
          </button>
          {open && (
            <ul className="mt-1.5 max-h-56 space-y-1 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {d.wallets.map((x) => (
                <li key={x.wallet} className="flex items-center gap-2 text-xs">
                  <Link href={`/dna/${x.wallet}`} className="font-mono text-muted hover:text-ink">{short(x.wallet)}</Link>
                  <span className="font-mono">{x.boughtUsd == null ? '' : usd(x.boughtUsd)}</span>
                  <span className="ml-auto font-mono" style={{ color: STATUS[x.status].color }}>{STATUS[x.status].label}</span>
                </li>
              ))}
            </ul>
          )}
          {w !== wallet && (
            <button type="button" onClick={() => { setW(wallet); setState('idle'); setD(null); }} className="mt-2 block text-xs text-muted hover:text-ink">
              Check another wallet
            </button>
          )}
        </div>
      )}
    </section>
  );
}
