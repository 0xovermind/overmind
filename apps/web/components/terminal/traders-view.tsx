'use client';

// The /traders page: the hive's smart wallets, ranked by realized profit on what they bought.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowSquareOut, Copy, Check } from '@phosphor-icons/react';
import { API_URL } from '@/lib/api';
import { short, usd } from '@/lib/format';
import { iconSrc } from './bits';
import { FollowWallet } from './watch';

interface TokenRef { address: string; symbol: string | null; imageUrl: string | null }
interface Trader {
  rank: number;
  wallet: string;
  realizedUsd: number;
  trades: number;
  tokens: number;
  best: (TokenRef & { realizedUsd: number }) | null;
  holding: (TokenRef & { valueUsd: number })[];
  lastTradeAt: string | null;
}

const EXPLORER = 'https://robinhoodchain.blockscout.com';

function ago(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

function Chip({ t, value }: { t: TokenRef; value?: string }) {
  return (
    <Link href={`/token/${t.address}`} className="inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border border-ink/[0.08] py-0.5 pl-0.5 pr-2 text-xs transition hover:border-ink/20">
      {t.imageUrl ? (
        <img src={iconSrc(t.imageUrl)} alt="" className="size-5 rounded-full object-cover" />
      ) : (
        <span className="grid size-5 place-items-center rounded-full bg-ink/[0.08] text-[10px] font-semibold">{(t.symbol ?? '?').slice(0, 1)}</span>
      )}
      <span className="truncate font-medium">${t.symbol ?? '?'}</span>
      {value && <span className="font-mono text-muted">{value}</span>}
    </Link>
  );
}

function WalletCell({ w }: { w: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap font-mono text-sm">
      <a href={`${EXPLORER}/address/${w}`} target="_blank" rel="noreferrer" className="hover:text-ink" title="Open in the explorer">
        {short(w, 4, 4)}
      </a>
      <button
        type="button"
        onClick={() => void navigator.clipboard?.writeText(w).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
        className="text-muted hover:text-ink"
        title="Copy address"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <a href={`${EXPLORER}/address/${w}`} target="_blank" rel="noreferrer" className="text-muted hover:text-ink" aria-label="Explorer"><ArrowSquareOut size={13} /></a>
      <FollowWallet wallet={w} />
    </span>
  );
}

export function TradersView() {
  const [rows, setRows] = useState<Trader[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(`${API_URL}/traders?limit=100`);
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { traders: Trader[] };
        if (live) { setRows(j.traders); setErr(false); }
      } catch {
        if (live) setErr(true);
      }
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Top traders</h1>
      <p className="mt-1 max-w-[70ch] text-sm text-muted">
        The most profitable wallets on Robinhood Chain, counting only tokens they actually bought. Bots, launch snipers, and devs or teams selling
        tokens they never bought are left out. These wallets are the smart side of the hive score.
      </p>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-ink/[0.06] bg-surface">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-ink/[0.06] text-left text-xs text-muted">
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Wallet</th>
              <th className="px-4 py-3 text-right font-medium">Realized</th>
              <th className="px-4 py-3 text-right font-medium">Trades</th>
              <th className="px-4 py-3 font-medium">Best trade</th>
              <th className="px-4 py-3 font-medium">Holding now</th>
              <th className="px-4 py-3 text-right font-medium">Last trade</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted">{err ? 'Could not load the traders. Retrying…' : 'Loading…'}</td></tr>
            ) : (
              rows.map((t) => (
                <tr key={t.wallet} className="border-b border-ink/[0.04] last:border-0">
                  <td className="px-4 py-3 font-mono text-muted">{t.rank}</td>
                  <td className="px-4 py-3"><WalletCell w={t.wallet} /></td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[#3ddc97]">+{usd(t.realizedUsd)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-muted">{t.trades} · {t.tokens} tok</td>
                  <td className="px-4 py-3">{t.best ? <Chip t={t.best} value={`+${usd(t.best.realizedUsd)}`} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {t.holding.length ? t.holding.map((h) => <Chip key={h.address} t={h} value={usd(h.valueUsd)} />) : <span className="text-muted">Nothing open</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted">{ago(t.lastTradeAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">Realized profit is from indexed trades on Robinhood Chain. Not advice.</p>
    </div>
  );
}
