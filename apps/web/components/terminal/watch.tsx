'use client';

// The watchlist UI: the star on a token page, the alerts bell in the header, and the /watchlist list.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell, BellRinging, Star } from '@phosphor-icons/react';
import { usePush } from '@/lib/push';
import { iconSrc } from './bits';
import { compact, usd } from '@/lib/format';
import { SIDE_LABEL, useAlerts, useWatching, useWatchlist, type AnyAlert, type HiveAlert, type HiveSide, type WalletAlert } from '@/lib/watchlist';
import { setFollow, useFollowedWallets, useFollowWallet } from '@/lib/wallets';
import { OVHIVE_BUY_URL, usePro } from '@/lib/pro';

const sideColor = (s: HiveSide | null | undefined) => (s === 'buying' ? 'text-[#3ddc97]' : s === 'selling' ? 'text-[#ff5d6c]' : 'text-muted');
const signed = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n}`);

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}

function Icon({ url, symbol, size = 28 }: { url: string | null; symbol: string | null; size?: number }) {
  return url ? (
    <img src={iconSrc(url)} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-ink/[0.08] text-[11px] font-semibold" style={{ width: size, height: size }}>
      {(symbol ?? '?').slice(0, 1)}
    </span>
  );
}

/** Turn browser notifications for hive alerts on or off (works with the site closed). */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const { state, enable, disable } = usePush();
  if (state === 'unsupported') return compact ? null : <p className="text-xs text-muted">This browser can&apos;t show push notifications.</p>;
  if (state === 'denied') return <p className="text-xs text-muted">Notifications are blocked for this site in your browser settings.</p>;
  const on = state === 'on';
  return (
    <button
      type="button"
      disabled={state === 'busy'}
      onClick={() => void (on ? disable() : enable())}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
        on ? 'border-[#3ddc97]/40 bg-[#3ddc97]/10 text-[#3ddc97]' : 'border-ink/[0.12] text-ink hover:border-ink/25'
      }`}
    >
      <BellRinging size={14} weight={on ? 'fill' : 'regular'} />
      {state === 'busy' ? 'One moment…' : on ? 'Browser alerts on' : 'Get alerts in this browser'}
    </button>
  );
}

/** Star a token: get an alert when the hive's reading of it flips. */
export function WatchStar({ token }: { token: string }) {
  const { watching, toggle } = useWatching(token);
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      aria-pressed={watching}
      title={watching ? 'Watching: you get an alert when the hive flips. Click to stop.' : 'Watch: get an alert when the hive flips on this token'}
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
        watching ? 'border-[#facb0e]/40 bg-[#facb0e]/10 text-[#facb0e]' : 'border-ink/[0.1] text-muted hover:border-ink/20 hover:text-ink'
      }`}
    >
      <Star size={14} weight={watching ? 'fill' : 'regular'} />
      {watching ? 'Watching' : 'Watch'}
    </button>
  );
}

function alertLine(a: HiveAlert) {
  const sym = a.token.symbol ? `$${a.token.symbol}` : 'A token';
  return a.side === 'buying' ? `${sym}: the hive flipped to buying` : `${sym}: the hive flipped to selling`;
}

const shortAddr = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;
const ACTION: Record<WalletAlert['action'], { verb: string; color: string }> = {
  buy: { verb: 'bought', color: 'text-[#3ddc97]' },
  sell: { verb: 'sold', color: 'text-[#ff5d6c]' },
  in: { verb: 'received', color: 'text-ink' },
  out: { verb: 'sent', color: 'text-muted' },
  coexit: { verb: 'leaving', color: 'text-[#ff5d6c]' },
};

/** One alert row (hive flip or followed-wallet move), for the bell and the watchlist page. */
function AlertItem({ a, onNavigate }: { a: AnyAlert; onNavigate?: () => void }) {
  if (a.kind === 'wallet' && a.action === 'coexit') {
    return (
      <Link
        href={`/token/${a.token.address}`}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-4 py-3 transition hover:bg-ink/[0.04] ${a.read ? '' : 'bg-ink/[0.03]'}`}
      >
        <Icon url={a.token.imageUrl} symbol={a.token.symbol} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            <span className="text-[#ff5d6c]">{a.amount} wallets</span> that bought ${a.token.symbol ?? '?'} with you are leaving
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted">
            sold or trimmed in the last hour{a.counterparty ? ` · of ${a.counterparty}` : ''}{a.usd != null ? ` · ${usd(a.usd)}` : ''} · {ago(a.at)}
          </div>
        </div>
      </Link>
    );
  }
  if (a.kind === 'wallet') {
    const act = ACTION[a.action];
    const who = a.wallet.label ?? shortAddr(a.wallet.address);
    return (
      <Link
        href={`/token/${a.token.address}`}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-4 py-3 transition hover:bg-ink/[0.04] ${a.read ? '' : 'bg-ink/[0.03]'}`}
      >
        <Icon url={a.token.imageUrl} symbol={a.token.symbol} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm">
            <span className="font-semibold">{who}</span> <span className={act.color}>{act.verb}</span> ${a.token.symbol ?? '?'}
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted">
            {compact(a.amount)}{a.usd != null ? ` · ${usd(a.usd)}` : ''}
            {a.counterparty ? ` · ${a.action === 'in' ? 'from' : 'to'} ${shortAddr(a.counterparty)}` : ''} · {ago(a.at)}
          </div>
        </div>
      </Link>
    );
  }
  return (
    <Link
      href={`/token/${a.token.address}`}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-3 transition hover:bg-ink/[0.04] ${a.read ? '' : 'bg-ink/[0.03]'}`}
    >
      <Icon url={a.token.imageUrl} symbol={a.token.symbol} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{alertLine(a)}</div>
        <div className="mt-0.5 font-mono text-xs text-muted">
          <span className={sideColor(a.from.side)}>{signed(a.from.score)}</span> → <span className={sideColor(a.side)}>{signed(a.score)}</span> · {ago(a.createdAt)}
        </div>
      </div>
    </Link>
  );
}

/** Follow a wallet (Hive Pro): its buys, sells and transfers show up in the bell. */
export function FollowWallet({ wallet, compactView = false }: { wallet: string; compactView?: boolean }) {
  const { following, toggle, busy, error, clearError } = useFollowWallet(wallet);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggle();
        }}
        disabled={busy}
        aria-pressed={following}
        title={following ? 'Following: alerts on every buy, sell and transfer. Click to stop.' : 'Follow this wallet (Hive Pro): get an alert on every buy, sell and transfer'}
        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold transition disabled:opacity-60 ${
          following ? 'border-[#facb0e]/40 bg-[#facb0e]/10 text-[#facb0e]' : 'border-ink/[0.1] text-muted hover:border-ink/20 hover:text-ink'
        }`}
      >
        <BellRinging size={12} weight={following ? 'fill' : 'regular'} />
        {!compactView && (following ? 'Following' : 'Follow')}
      </button>
      {error && (
        <span role="alert" onClick={clearError} className="absolute right-0 top-7 z-30 w-56 cursor-pointer rounded-lg border border-ink/[0.1] bg-surface-2 p-2.5 text-left text-xs leading-relaxed shadow-xl">
          {error}{' '}
          {/pro|\$OVHIVE/i.test(error) && (
            <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="ovhive-grad font-semibold">Get $OVHIVE ↗</a>
          )}
        </span>
      )}
    </span>
  );
}

/** Followed wallets on the watchlist page: add by address (Hive Pro), label, remove. */
function FollowedWallets() {
  const { items, max } = useFollowedWallets();
  const pro = usePro();
  const [addr, setAddr] = useState('');
  const [label, setLabel] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = /^0x[0-9a-fA-F]{40}$/.test(addr.trim());
  const add = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const err = await setFollow(addr.trim(), true, label.trim() || undefined);
    setBusy(false);
    setMsg(err);
    if (!err) {
      setAddr('');
      setLabel('');
    }
  };
  return (
    <section className="rounded-2xl border border-ink/[0.06] bg-surface md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/[0.06] px-4 py-3">
        <span className="text-sm font-semibold">
          Followed wallets {items ? <span className="text-muted">{items.length}/{max}</span> : null}
        </span>
        <span className="text-xs text-muted">Hive Pro · alerts on every buy, sell and transfer, checked every minute</span>
      </div>
      {pro && !pro.pro ? (
        <div className="pro-banner m-4 rounded-xl p-4 text-sm">
          Hold <span className="font-semibold">{pro.threshold.toLocaleString('en-US')} $OVHIVE</span> to follow wallets. You hold {pro.balance.toLocaleString('en-US')}.{' '}
          <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="ovhive-grad font-semibold">Get $OVHIVE ↗</a>
        </div>
      ) : (
        <form
          className="flex flex-wrap gap-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Wallet address 0x…"
            className="min-w-0 flex-[2_1_260px] rounded-lg border border-ink/[0.08] bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-ink/20"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            placeholder="Label (optional)"
            className="min-w-0 flex-[1_1_140px] rounded-lg border border-ink/[0.08] bg-bg px-3 py-2 text-xs outline-none focus:border-ink/20"
          />
          <button type="submit" disabled={!valid || busy} className="pro-buy rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Follow'}
          </button>
          {msg && <p className="w-full text-xs text-[#ff5d6c]">{msg}</p>}
        </form>
      )}
      {items && items.length > 0 && (
        <ul className="border-t border-ink/[0.06]">
          {items.map((w) => (
            <li key={w.wallet} className="flex items-center gap-3 border-b border-ink/[0.04] px-4 py-2.5 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{w.label ?? shortAddr(w.wallet)}</div>
                <a href={`https://robinhoodchain.blockscout.com/address/${w.wallet}`} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-muted hover:text-ink">
                  {w.wallet}
                </a>
              </div>
              <span className="hidden text-xs text-muted sm:block">{w.lastAlertAt ? `last move · ${ago(w.lastAlertAt)}` : 'no moves yet'}</span>
              <button
                type="button"
                onClick={() => void setFollow(w.wallet, false)}
                className="rounded-md border border-ink/[0.1] px-2 py-1 text-[11px] text-muted transition hover:border-[#ff5d6c]/40 hover:text-[#ff5d6c]"
              >
                Unfollow
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The header bell: unread count, and the latest alerts in a dropdown. Only for signed-in members. */
export function AlertsBell() {
  const { items, unread, markRead, member } = useAlerts();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!member) return null;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void markRead();
        }}
        aria-label={unread ? `${unread} new hive alerts` : 'Hive alerts'}
        className="relative grid size-9 place-items-center rounded-lg border border-ink/[0.08] text-muted transition hover:text-ink"
      >
        <Bell size={16} weight={unread ? 'fill' : 'regular'} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-[#ff5d6c] px-1 font-mono text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-ink/[0.08] bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink/[0.06] px-4 py-3">
            <span className="text-sm font-semibold">Hive alerts</span>
            <Link href="/watchlist" onClick={() => setOpen(false)} className="text-xs text-muted hover:text-ink">Watchlist →</Link>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs leading-relaxed text-muted">
              No alerts yet. Star a token with <span className="text-ink">Watch</span> to hear when the hive flips on it, or follow a wallet (Hive Pro) to hear every move it makes.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((a) => (
                <li key={a.id}>
                  <AlertItem a={a} onNavigate={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-ink/[0.06] px-4 py-3"><PushToggle compact /></div>
        </div>
      )}
    </div>
  );
}

/** The /watchlist page: starred tokens with the hive's reading, and the alerts feed. */
export function WatchlistView() {
  const { items, member } = useWatchlist();
  const alerts = useAlerts();
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Watchlist</h1>
      <p className="mt-1 max-w-[62ch] text-sm text-muted">
        Star tokens with <span className="text-ink">Watch</span> on their page. When the hive flips on one, from selling to buying (score {'≥'} +20) or
        back (score {'≤'} −20), you get an alert in the bell at the top. Checked every 5 minutes. Hive Pro members can also follow wallets
        (here or with <span className="text-ink">Follow</span> on the Traders page) and get an alert on every buy, sell and transfer they make.
      </p>
      {member && <div className="mt-4"><PushToggle /></div>}
      {!member ? (
        <p className="mt-10 rounded-2xl border border-ink/[0.06] bg-surface px-6 py-10 text-center text-sm text-muted">Sign in to keep a watchlist and get hive alerts.</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <FollowedWallets />
          <section className="rounded-2xl border border-ink/[0.06] bg-surface">
            <div className="border-b border-ink/[0.06] px-4 py-3 text-sm font-semibold">Starred tokens {items ? <span className="text-muted">{items.length}</span> : null}</div>
            {items === null ? (
              <div className="space-y-3 p-4">{[0, 1, 2].map((i) => <div key={i} className="skel h-10 w-full rounded-lg" />)}</div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Nothing starred yet. Open any token and hit Watch.</p>
            ) : (
              <ul>
                {items.map((w) => (
                  <li key={w.token.address} className="border-b border-ink/[0.04] last:border-0">
                    <Link href={`/token/${w.token.address}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink/[0.03]">
                      <Icon url={w.token.imageUrl} symbol={w.token.symbol} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">${w.token.symbol ?? '?'}</div>
                        <div className="text-xs text-muted">mcap {usd(w.token.marketCapUsd)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono text-lg ${sideColor(w.hive?.side)}`}>{signed(w.hive?.score)}</div>
                        <div className="text-xs text-muted">{w.hive ? `${SIDE_LABEL[w.hive.side]} · ${w.hive.voters} voices` : 'No reading yet'}</div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-ink/[0.06] bg-surface">
            <div className="border-b border-ink/[0.06] px-4 py-3 text-sm font-semibold">Recent alerts</div>
            {alerts.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted">No flips yet on your tokens.</p>
            ) : (
              <ul>
                {alerts.items.map((a) => (
                  <li key={a.id} className="border-b border-ink/[0.04] last:border-0">
                    <AlertItem a={a} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
