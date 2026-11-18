'use client';

// The watchlist UI: the star on a token page, the alerts bell in the header, and the /watchlist list.
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell, Star } from '@phosphor-icons/react';
import { iconSrc } from './bits';
import { usd } from '@/lib/format';
import { SIDE_LABEL, useAlerts, useWatching, useWatchlist, type HiveAlert, type HiveSide } from '@/lib/watchlist';

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
              No alerts yet. Star a token with <span className="text-ink">Watch</span> and you get one here when the hive flips on it.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/token/${a.token.address}`}
                    onClick={() => setOpen(false)}
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
                </li>
              ))}
            </ul>
          )}
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
        back (score {'≤'} −20), you get an alert in the bell at the top. Checked every 5 minutes.
      </p>
      {!member ? (
        <p className="mt-10 rounded-2xl border border-ink/[0.06] bg-surface px-6 py-10 text-center text-sm text-muted">Sign in to keep a watchlist and get hive alerts.</p>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-ink/[0.06] bg-surface">
            <div className="border-b border-ink/[0.06] px-4 py-3 text-sm font-semibold">Starred tokens {items ? <span className="text-muted">{items.length}</span> : null}</div>
            {items === null ? (
              <p className="px-4 py-8 text-center text-sm text-muted">Loading…</p>
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
                    <Link href={`/token/${a.token.address}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink/[0.03]">
                      <Icon url={a.token.imageUrl} symbol={a.token.symbol} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{alertLine(a)}</div>
                        <div className="mt-0.5 font-mono text-xs text-muted">
                          <span className={sideColor(a.from.side)}>{signed(a.from.score)}</span> → <span className={sideColor(a.side)}>{signed(a.score)}</span> · {ago(a.createdAt)}
                        </div>
                      </div>
                    </Link>
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
