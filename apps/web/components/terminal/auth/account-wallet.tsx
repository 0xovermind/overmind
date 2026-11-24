'use client';

// The wallet half of the account menu (balances, holdings, the wallet drawer). It pulls in viem and the
// chain client, so the menu loads it lazily: visitors never download it, members get it after the page.
import { fmtUnits, useBalances } from '@/lib/balances';
import { useWalletHoldings } from '@/lib/holdings';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Total wallet value in dollars next to the account chip (the same total as the wallet view): ETH at
 * the live price plus every token held. Opens the wallet panel. Phones drop the cents above $1,000.
 */
export function BalanceButton({ wallet, onOpen }: { wallet: `0x${string}`; onOpen: () => void }) {
  const h = useWalletHoldings(wallet);
  const v = h.totalUsd;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Wallet balance: ETH, USDG and every token you hold"
      aria-label={v == null ? 'Wallet balance' : `Wallet balance ${money.format(v)}`}
      className="rounded-xl border border-ink/[0.08] bg-surface px-3 py-2 font-mono text-sm font-semibold tabular-nums transition hover:border-ink/20"
    >
      {v == null ? (
        <span className="inline-block h-4 w-14 animate-pulse rounded bg-ink/[0.08] align-middle" />
      ) : (
        <>
          <span className="sm:hidden">{v >= 1000 ? moneyWhole.format(v) : money.format(v)}</span>
          <span className="hidden sm:inline">{money.format(v)}</span>
        </>
      )}
    </button>
  );
}

/** ETH balance row inside the open account menu. */
export function MenuBalance({ wallet }: { wallet: `0x${string}` | null }) {
  const { balances } = useBalances(wallet);
  return <span className="font-mono">{balances ? `${fmtUnits(balances.eth, 18, 4)} ETH` : '…'}</span>;
}
