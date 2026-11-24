'use client';

// Wallet DNA client bits: the address box, the AI line (fetched after the card is on screen) and sharing.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DownloadSimple, MagnifyingGlass, Sparkle, XLogo } from '@phosphor-icons/react';
import { V1 } from '@/lib/members';
import { isWallet } from '@/lib/arena';
import { useAuth } from '@/lib/auth';

export function DnaSearch({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState(false);
  const session = useAuth();
  const mine = session.authenticated ? (session.user?.wallet ?? null) : null;
  const go = (w: string) => {
    if (!isWallet(w.trim())) return setErr(true);
    setErr(false);
    router.push(`/dna/${w.trim().toLowerCase()}`);
  };
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(v);
        }}
        className={`flex items-center gap-2 rounded-2xl border bg-surface p-2 transition ${err ? 'border-[#ff5d6c]/60' : 'border-ink/[0.1] focus-within:border-brand/50'}`}
      >
        <MagnifyingGlass size={18} className="ml-2 shrink-0 text-muted" />
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Paste any wallet address (0x…)"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent px-1 py-2 font-mono text-sm outline-none placeholder:text-muted"
        />
        <button type="submit" className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-bg transition active:scale-[0.96]">
          Read DNA
        </button>
      </form>
      {err && <p className="mt-2 text-xs text-[#ff5d6c]">That doesn&apos;t look like a wallet address.</p>}
      {mine && (
        <button type="button" onClick={() => go(mine)} className="mt-3 text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          Read my own wallet&apos;s DNA →
        </button>
      )}
    </div>
  );
}

export function DnaRoast({ wallet }: { wallet: string }) {
  const [text, setText] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'done' | 'off'>('loading');
  useEffect(() => {
    let live = true;
    fetch(`${V1}/wallets/${wallet}/dna/roast`)
      .then(async (r) => {
        if (!live) return;
        if (!r.ok) return setState('off');
        setText(((await r.json()) as { text: string }).text);
        setState('done');
      })
      .catch(() => live && setState('off'));
    return () => {
      live = false;
    };
  }, [wallet]);
  if (state === 'off') return null;
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-ink/[0.04] px-4 py-3 text-sm">
      <Sparkle size={16} weight="fill" className="mt-0.5 shrink-0 text-[#f06ba8]" />
      {state === 'loading' ? (
        <span className="skel h-4 w-3/4 rounded bg-gradient-to-r from-ink/[0.04] via-ink/[0.09] to-ink/[0.04] bg-[length:200%_100%]" />
      ) : (
        <span className="row-in">
          {text} <span className="font-mono text-[11px] text-muted">Overmind AI</span>
        </span>
      )}
    </div>
  );
}

export function DnaShare({ wallet, archetype }: { wallet: string; archetype: string }) {
  const url = `https://overmind.ink/dna/${wallet}`;
  const text = `My wallet's DNA on Robinhood Chain: ${archetype}.\n\nRead yours on @0xovermind`;
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-bg transition active:scale-[0.96]"
      >
        <XLogo size={16} weight="bold" /> Share on X
      </a>
      <a
        href={`/dna/${wallet}/image`}
        download={`overmind-dna-${wallet.slice(2, 8)}.png`}
        className="flex items-center gap-2 rounded-xl border border-ink/[0.1] px-4 py-2.5 text-sm transition hover:bg-ink/[0.04] active:scale-[0.96]"
      >
        <DownloadSimple size={16} /> Download card
      </a>
    </div>
  );
}
