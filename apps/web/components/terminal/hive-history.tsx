'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { API_URL } from '@/lib/api';
import { auth, useAuth } from '@/lib/auth';
import { V1 } from '@/lib/members';
import { loadPro, OVHIVE_BUY_URL, PRO_MIN_DEFAULT, usePro } from '@/lib/pro';

interface Point { t: string; score: number | null; buyers: number; sellers: number; price_usd: number | null }

const RANGES = [
  { k: 1, label: '1D' },
  { k: 7, label: '7D' },
  { k: 30, label: '30D' },
] as const;

const W = 320;
const H = 120;
const PAD = 6;

const fmtPrice = (p: number) =>
  p >= 1 ? `$${p.toFixed(2)}` : p >= 0.01 ? `$${p.toFixed(4)}` : `$${p.toPrecision(3)}`;

/**
 * The hive's reading on one token through time (smart-wallet flow, rebuilt from swaps by the indexer),
 * with the price as a faint overlay. Green above zero (the smart crowd was buying), red below.
 */
export function HiveHistory({ token }: { token: string }) {
  const [days, setDays] = useState<1 | 7 | 30>(1);
  const [pts, setPts] = useState<Point[] | null | undefined>(undefined);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');

  const proStatus = usePro();
  const { authenticated } = useAuth();
  const locked = days > 1 && !proStatus?.pro;

  useEffect(() => {
    let live = true;
    if (locked) { setPts(undefined); return; }
    setPts(undefined);
    // 1 day is public; 7D/30D are Hive Pro and read through the signed-in /v1 route.
    const req = days > 1
      ? auth.getAccessToken().then((tk) => fetch(`${V1}/hive/${token}/history?days=${days}`, { headers: tk ? { authorization: `Bearer ${tk}` } : {} }))
      : fetch(`${API_URL}/hive/${token}/history?days=1`);
    req
      .then(async (r) => (r.ok ? ((await r.json()) as { points: Point[] }).points : null))
      // Young tokens: drop the empty stretch before the first trade so the line fills the chart.
      .then((p) => {
        if (!p) return p;
        const first = p.findIndex((q) => q.score !== null);
        return first > 1 ? p.slice(first - 1) : p;
      })
      .then((p) => live && setPts(p))
      .catch(() => live && setPts(null));
    return () => { live = false; };
  }, [token, days, locked]);

  const g = useMemo(() => {
    if (!pts?.length) return null;
    const n = pts.length;
    const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);
    const y = (s: number) => H / 2 - (s / 100) * (H / 2 - PAD);
    // Score: carry the last known reading across gaps so the line stays continuous once it starts.
    let last: number | null = null;
    const seg: string[] = [];
    pts.forEach((p, i) => {
      if (p.score !== null) last = p.score;
      if (last === null) return;
      seg.push(`${seg.length ? 'L' : 'M'}${x(i).toFixed(1)},${y(last).toFixed(1)}`);
    });
    if (!seg.length) return { empty: true as const, x, y };
    const firstX = Number(seg[0]!.slice(1).split(',')[0]);
    const line = seg.join(' ');
    const area = `${line} L${x(n - 1).toFixed(1)},${(H / 2).toFixed(1)} L${firstX.toFixed(1)},${(H / 2).toFixed(1)} Z`;
    // Price on a log scale (memecoins move in multiples).
    const pr = pts.map((p) => (p.price_usd && p.price_usd > 0 ? Math.log(p.price_usd) : null));
    const vals = pr.filter((v): v is number => v !== null);
    let price = '';
    if (vals.length > 1) {
      const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
      price = pr
        .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${(H - PAD - ((v - lo) / span) * (H - 2 * PAD)).toFixed(1)}`))
        .filter(Boolean)
        .map((s, i) => `${i ? 'L' : 'M'}${s}`)
        .join(' ');
    }
    return { empty: false as const, x, y, line, area, price };
  }, [pts]);

  const hp = hover !== null && pts ? pts[hover] : null;
  const latest = pts?.length ? [...pts].reverse().find((p) => p.score !== null) ?? null : null;

  return (
    <div className="mt-4 border-t border-ink/[0.06] pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Smart money over time</span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.k}
              type="button"
              onClick={() => setDays(r.k)}
              className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] ${days === r.k ? 'bg-ink/[0.1] text-ink' : 'text-muted hover:text-ink'}`}
            >
              {r.label}
              {r.k > 1 && !proStatus?.pro && <span className="ml-0.5 opacity-60">🔒</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-[120px] w-full touch-none"
          preserveAspectRatio="none"
          onPointerMove={(e) => {
            if (!pts?.length) return;
            const r = e.currentTarget.getBoundingClientRect();
            const k = (e.clientX - r.left) / r.width;
            setHover(Math.max(0, Math.min(pts.length - 1, Math.round(k * (pts.length - 1)))));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <clipPath id={`up-${uid}`}><rect x="0" y="0" width={W} height={H / 2} /></clipPath>
            <clipPath id={`dn-${uid}`}><rect x="0" y={H / 2} width={W} height={H / 2} /></clipPath>
            <linearGradient id={`gu-${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3ddc97" stopOpacity="0.35" /><stop offset="1" stopColor="#3ddc97" stopOpacity="0.02" /></linearGradient>
            <linearGradient id={`gd-${uid}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#ff5d6c" stopOpacity="0.35" /><stop offset="1" stopColor="#ff5d6c" stopOpacity="0.02" /></linearGradient>
          </defs>
          <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="currentColor" strokeOpacity="0.15" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {g && !g.empty && (
            <>
              {g.price && <path d={g.price} fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
              <path d={g.area} fill={`url(#gu-${uid})`} clipPath={`url(#up-${uid})`} />
              <path d={g.area} fill={`url(#gd-${uid})`} clipPath={`url(#dn-${uid})`} />
              <path d={g.line} fill="none" stroke="#3ddc97" strokeWidth="1.8" clipPath={`url(#up-${uid})`} vectorEffect="non-scaling-stroke" />
              <path d={g.line} fill="none" stroke="#ff5d6c" strokeWidth="1.8" clipPath={`url(#dn-${uid})`} vectorEffect="non-scaling-stroke" />
            </>
          )}
          {hover !== null && g && (
            <line x1={g.x(hover)} x2={g.x(hover)} y1="0" y2={H} stroke="currentColor" strokeOpacity="0.35" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {locked && (
          <div className="pro-lock absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg px-4 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em]"><span className="hive-orb mr-1.5 inline-block size-2 rounded-full align-middle" />Hive Pro</span>
            <span className="text-[11.5px] leading-snug text-muted">
              Hold {(proStatus?.threshold ?? PRO_MIN_DEFAULT).toLocaleString('en-US')} $OVHIVE to unlock {days}-day history.
              {proStatus ? ` You hold ${proStatus.balance.toLocaleString('en-US')}.` : ''}
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {!authenticated ? (
                <button type="button" onClick={() => auth.login()} className="rounded-md bg-ink/[0.1] px-2 py-1 text-[11px] text-ink hover:bg-ink/[0.16]">Sign in</button>
              ) : (
                <>
                  <button type="button" onClick={() => auth.linkWallet()} className="rounded-md bg-ink/[0.1] px-2 py-1 text-[11px] text-ink hover:bg-ink/[0.16]">Link wallet</button>
                  <button type="button" onClick={() => void loadPro(true)} className="rounded-md bg-ink/[0.1] px-2 py-1 text-[11px] text-ink hover:bg-ink/[0.16]">Re-check</button>
                </>
              )}
              <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="pro-buy rounded-md px-2 py-1 text-[11px] font-semibold">Get $OVHIVE</a>
            </div>
          </div>
        )}
        {!locked && pts === undefined && <div className="absolute inset-0 grid place-items-center text-xs text-muted">Loading…</div>}
        {!locked && (pts === null || (g && g.empty)) && (
          <div className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-muted">No smart-wallet trades in this window yet.</div>
        )}
      </div>

      <div className="mt-1.5 flex min-h-[16px] items-center justify-between font-mono text-[10px] text-muted">
        {hp ? (
          <>
            <span>{new Date(hp.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <span>
              <span className={hp.score === null ? '' : hp.score >= 0 ? 'text-[#3ddc97]' : 'text-[#ff5d6c]'}>
                {hp.score === null ? 'no flow' : `${hp.score > 0 ? '+' : ''}${hp.score}`}
              </span>
              {' · '}{hp.buyers} in / {hp.sellers} out{hp.price_usd ? ` · ${fmtPrice(hp.price_usd)}` : ''}
            </span>
          </>
        ) : (
          <>
            <span>+100 buying · −100 selling</span>
            <span>{latest && !locked ? `now ${latest.score! > 0 ? '+' : ''}${latest.score} · ` : ''}price faint</span>
          </>
        )}
      </div>
    </div>
  );
}
