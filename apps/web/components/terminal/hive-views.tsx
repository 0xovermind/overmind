'use client';

// The hive, seen four ways: a honeycomb map of the market, a radar where smart money pulls tokens to the
// centre, a galaxy of smart wallets around the tokens they trade, and a one-card-at-a-time swipe deck.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/api';
import { V1 } from '@/lib/members';
import { usd } from '@/lib/format';

export interface HiveTok {
  token: string; symbol: string; name: string; image_url: string | null; market_cap_usd: number | null;
  smart_buyers: number; smart_sellers: number; voters: number; score: number; created_at: string;
}
interface GalaxyTok { token: string; symbol: string; mcap: number | null; buyers: number; sellers: number; net: number; wallets: { wallet: string; net: number; trades: number }[] }

const UP = '#3ddc97';
const DN = '#ff5d6c';
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };
/** Score → fill: deep red through dark amber to bright green. */
function fill(score: number) {
  const s = Math.max(-100, Math.min(100, score)) / 100;
  if (s >= 0) return `hsl(${150 - (1 - s) * 30} ${40 + s * 40}% ${20 + s * 26}%)`;
  return `hsl(${352} ${40 - s * 40}% ${20 - s * 26}%)`;
}

export function useHive(scope: 'pons' | 'all', every = 30_000) {
  const [rows, setRows] = useState<HiveTok[] | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch(`${API_URL}/hive?limit=60&scope=${scope}`).then((r) => r.json() as Promise<{ tokens: HiveTok[] }>).then((j) => live && setRows(j.tokens)).catch(() => {});
    load();
    const id = setInterval(() => document.visibilityState === 'visible' && load(), every);
    return () => { live = false; clearInterval(id); };
  }, [scope, every]);
  return rows;
}

/** The side card for a selected token (map, radar). */
export function TokenCard({ t, onClose }: { t: HiveTok; onClose: () => void }) {
  const c = t.score >= 0 ? UP : DN;
  return (
    <div className="row-in rounded-2xl border border-ink/[0.08] bg-surface p-5 shadow-[0_30px_60px_-30px_rgba(0,0,0,.8)]">
      <div className="flex items-start justify-between">
        <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Selected</div>
        <button type="button" onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">✕</button>
      </div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight">${t.symbol}</div>
      <div className="text-sm text-muted">{t.name} · mcap {usd(t.market_cap_usd)}</div>
      <div className="mt-4 text-5xl font-extrabold tabular-nums" style={{ color: c }}>{t.score > 0 ? '+' : ''}{t.score}</div>
      <div className="text-sm text-muted">hive score · {t.smart_buyers} smart wallets buying, {t.smart_sellers} selling (24h)</div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-ink/[0.07]">
        <div style={{ width: `${(100 * t.smart_buyers) / Math.max(1, t.smart_buyers + t.smart_sellers)}%`, background: UP }} />
        <div className="flex-1" style={{ background: DN }} />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link href={`/token/${t.token}`} className="rounded-xl bg-go py-2.5 text-center text-sm font-bold text-bg">Trade</Link>
        <Link href={`/token/${t.token}/replay`} rel="nofollow" prefetch={false} className="rounded-xl border border-ink/[0.12] py-2.5 text-center text-sm font-semibold">Replay</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Map

/** Axial hex coordinates spiralling out from the centre. */
function spiral(n: number): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  const dirs: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  for (let ring = 1; out.length < n; ring++) {
    let q = -ring, r = ring;
    for (const [dq, dr] of dirs) for (let k = 0; k < ring && out.length < n; k++) { out.push([q, r]); q += dq; r += dr; }
  }
  return out;
}

export function HiveMap({ rows, onPick, picked }: { rows: HiveTok[]; onPick: (t: HiveTok) => void; picked: string | null }) {
  // Biggest tokens in the middle.
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.market_cap_usd ?? 0) - (a.market_cap_usd ?? 0)), [rows]);
  const pos = spiral(sorted.length);
  const R = 46;
  const pts = pos.map(([q, r]) => [R * Math.sqrt(3) * (q + r / 2), R * 1.5 * r] as const);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = R + 6;
  const vb = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  const hex = (cx: number, cy: number, r: number) => Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  return (
    <svg viewBox={vb} className="h-full w-full" role="img" aria-label="Hive map: every token as a cell, coloured by the hive score">
      <defs>
        <linearGradient id="hx-gloss" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id="hx-ring" x1="0" x2="1"><stop offset="0" stopColor="#facb0e" /><stop offset=".5" stopColor="#f06ba8" /><stop offset="1" stopColor="#78bae6" /></linearGradient>
      </defs>
      {sorted.map((t, i) => {
        const [cx, cy] = pts[i]!;
        const on = picked === t.token;
        return (
          <g key={t.token} className="hex-cell cursor-pointer" style={{ animationDelay: `${Math.min(i, 40) * 18}ms` }} onClick={() => onPick(t)}>
            <polygon points={hex(cx, cy, R - 2.5)} fill={fill(t.score)} stroke={on ? 'url(#hx-ring)' : 'rgba(0,0,0,.6)'} strokeWidth={on ? 4 : 2} />
            <polygon points={hex(cx, cy - 3, R - 10)} fill="url(#hx-gloss)" opacity=".55" pointerEvents="none" />
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize={t.symbol.length > 7 ? 9.5 : 11.5} fontWeight={800} fill="rgba(255,255,255,.95)" pointerEvents="none">
              {t.symbol.slice(0, 9)}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10.5} fill="rgba(255,255,255,.78)" fontFamily="var(--font-mono)" pointerEvents="none">
              {t.score > 0 ? '+' : ''}{t.score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- Radar

export function HiveRadar({ rows, onPick }: { rows: HiveTok[]; onPick: (t: HiveTok) => void }) {
  const S = 1000, C = S / 2, RMAX = 440;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-full w-full" role="img" aria-label="Hive radar: tokens the smart wallets buy hardest sit closest to the centre">
      <defs>
        <radialGradient id="rd-sweep"><stop offset="0" stopColor="#f06ba8" stopOpacity="0" /><stop offset="1" stopColor="#f06ba8" stopOpacity=".22" /></radialGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <circle key={f} cx={C} cy={C} r={RMAX * f} fill="none" stroke="currentColor" strokeOpacity={0.16 - i * 0.02} strokeDasharray={i ? '2 7' : undefined} />
      ))}
      <line x1={C - RMAX} x2={C + RMAX} y1={C} y2={C} stroke="currentColor" strokeOpacity=".07" />
      <line x1={C} x2={C} y1={C - RMAX} y2={C + RMAX} stroke="currentColor" strokeOpacity=".07" />
      <g className="radar-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
        <path d={`M${C},${C} L${C + RMAX},${C} A${RMAX},${RMAX} 0 0,0 ${C + RMAX * Math.cos(-0.7)},${C + RMAX * Math.sin(-0.7)} Z`} fill="url(#rd-sweep)" />
      </g>
      {rows.map((t) => {
        const r = Math.max(70, 95 + ((100 - Math.max(-100, Math.min(100, t.score))) / 200) * (RMAX - 95) + (hash(t.token + "r") - 0.5) * 50);
        const a = hash(t.token) * Math.PI * 2;
        const x = C + r * Math.cos(a), y = C + r * Math.sin(a);
        const c = t.score >= 0 ? UP : DN;
        const size = 4 + Math.min(8, Math.log10(Math.max(10, t.market_cap_usd ?? 10)) * 1.4);
        return (
          <g key={t.token} className="cursor-pointer" onClick={() => onPick(t)}>
            <circle cx={x} cy={y} r={size} fill={c} style={{ filter: `drop-shadow(0 0 8px ${c})` }} />
            <text x={x + size + 5} y={y + 4} fontSize="13" fill={c} fontFamily="var(--font-mono)">${t.symbol.slice(0, 10)} {t.score > 0 ? '+' : ''}{t.score}</text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r="30" fill="var(--color-bg)" stroke="url(#hx-ring)" strokeWidth="2" />
      <text x={C} y={C + 5} textAnchor="middle" fontSize="13" fontWeight="800" fill="currentColor">HIVE</text>
    </svg>
  );
}

// ---------------------------------------------------------------- Galaxy

export function HiveGalaxy({ scope }: { scope: 'pons' | 'all' }) {
  const [d, setD] = useState<GalaxyTok[] | null>(null);
  const [star, setStar] = useState<{ wallet: string; net: number; trades: number; symbol: string } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${V1}/hive/galaxy?scope=${scope}`).then((r) => r.json() as Promise<{ tokens: GalaxyTok[] }>).then((j) => live && setD(j.tokens)).catch(() => {});
    return () => { live = false; };
  }, [scope]);
  if (!d) return <div className="grid h-full place-items-center text-sm text-muted">Mapping the galaxy…</div>;
  const W = 1200, H = 760;
  const suns = d.map((t, i) => {
    const a = (i / d.length) * Math.PI * 2 + 0.3;
    const rr = i === 0 ? 0 : 250 + (i % 2) * 70;
    return { ...t, x: W / 2 + rr * Math.cos(a) * 1.3, y: H / 2 + rr * Math.sin(a) * 0.82 };
  });
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Galaxy: smart wallets around the tokens they traded in the last 24 hours">
        {Array.from({ length: 140 }, (_, i) => (
          <circle key={i} cx={hash(`bx${i}`) * W} cy={hash(`by${i}`) * H} r={hash(`br${i}`) * 1.1} fill="currentColor" opacity={0.08 + hash(`bo${i}`) * 0.25} />
        ))}
        {suns.map((s) => (
          <g key={s.token}>
            {s.wallets.map((w) => {
              const a = hash(w.wallet + s.token) * Math.PI * 2;
              const r = 46 + Math.min(1, Math.log10(1 + Math.abs(w.net)) / 3.5) * 110;
              const x = s.x + r * Math.cos(a), y = s.y + r * Math.sin(a) * 0.8;
              const c = w.net >= 0 ? '#78bae6' : '#f06ba8';
              return (
                <g key={w.wallet} className="cursor-pointer" onClick={() => setStar({ ...w, symbol: s.symbol })}>
                  <line x1={s.x} y1={s.y} x2={x} y2={y} stroke={c} strokeOpacity=".16" />
                  <circle cx={x} cy={y} r={2 + Math.min(3.5, w.trades / 4)} fill={c} style={{ filter: `drop-shadow(0 0 4px ${c})` }} />
                </g>
              );
            })}
            <Link href={`/token/${s.token}`}>
              <circle cx={s.x} cy={s.y} r={24 + Math.min(16, s.wallets.length / 2)} fill={s.net >= 0 ? 'rgba(120,186,230,.16)' : 'rgba(240,107,168,.16)'} stroke={s.net >= 0 ? '#78bae6' : '#f06ba8'} style={{ filter: `drop-shadow(0 0 22px ${s.net >= 0 ? '#78bae6' : '#f06ba8'})` }} />
              <text x={s.x} y={s.y + 3} textAnchor="middle" fontSize="12.5" fontWeight="800" fill="currentColor">${s.symbol.slice(0, 9)}</text>
              <text x={s.x} y={s.y + 19} textAnchor="middle" fontSize="10.5" fill="currentColor" opacity=".7" fontFamily="var(--font-mono)">{s.buyers}↑ {s.sellers}↓</text>
            </Link>
          </g>
        ))}
      </svg>
      {star && (
        <div className="row-in absolute bottom-4 left-4 w-[320px] rounded-2xl border border-ink/[0.08] bg-surface p-4">
          <div className="flex justify-between font-mono text-[11px] text-muted"><span>SMART WALLET</span><button type="button" onClick={() => setStar(null)}>✕</button></div>
          <div className="mt-1 font-mono text-sm">{short(star.wallet)}</div>
          <div className="mt-1 text-sm">
            {star.net >= 0 ? 'Bought' : 'Sold'} <b>${star.symbol}</b>: <span style={{ color: star.net >= 0 ? UP : DN }}>{star.net >= 0 ? '+' : '-'}{usd(Math.abs(star.net))}</span> net · {star.trades} trades in 24h
          </div>
          <Link href={`/dna/${star.wallet}`} rel="nofollow" prefetch={false} className="mt-3 inline-block text-sm font-semibold underline-offset-4 hover:underline">Wallet DNA →</Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Swipe

export function SwipeDeck({ rows }: { rows: HiveTok[] }) {
  const deck = useMemo(() => [...rows].filter((t) => t.smart_buyers + t.smart_sellers >= 3).sort((a, b) => Math.abs(b.score) * Math.log10(2 + b.smart_buyers + b.smart_sellers) - Math.abs(a.score) * Math.log10(2 + a.smart_buyers + a.smart_sellers)), [rows]);
  const [i, setI] = useState(0);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  const t = deck[i % Math.max(1, deck.length)];
  const next = () => { setDx(0); setI((x) => x + 1); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') next(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  if (!t) return <div className="grid h-full place-items-center text-sm text-muted">Waiting for the hive…</div>;
  const up = t.score >= 0;
  const c = up ? UP : DN;
  const behind = [deck[(i + 2) % deck.length], deck[(i + 1) % deck.length]].filter(Boolean) as HiveTok[];
  return (
    <div className="relative mx-auto h-[min(720px,100%)] w-full max-w-[400px] select-none">
      {behind.map((b, k) => (
        <div key={b.token + k} className="absolute inset-0 rounded-[32px] border border-ink/[0.08] bg-surface" style={{ transform: `translateY(${(2 - k) * 14}px) scale(${0.92 + k * 0.04})`, opacity: 0.35 + k * 0.3 }} />
      ))}
      <div
        key={t.token}
        className="swipe-card absolute inset-0 overflow-hidden rounded-[32px] border border-ink/[0.1] p-7 shadow-[0_40px_80px_-30px_rgba(0,0,0,.8)]"
        style={{ transform: `translateX(${dx}px) rotate(${dx / 25}deg)`, transition: start.current == null ? 'transform .35s cubic-bezier(.16,1,.3,1)' : 'none', background: `linear-gradient(170deg, ${up ? 'rgba(61,220,151,.16)' : 'rgba(255,93,108,.16)'}, var(--color-surface) 55%)` }}
        onPointerDown={(e) => { start.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (start.current != null) setDx(e.clientX - start.current); }}
        onPointerUp={() => { const d = dx; start.current = null; if (Math.abs(d) > 110) next(); else setDx(0); }}
      >
        <div className="flex gap-1.5">{Array.from({ length: 5 }, (_, k) => <span key={k} className="h-[3px] flex-1 rounded bg-ink" style={{ opacity: k <= i % 5 ? 0.9 : 0.2 }} />)}</div>
        <div className="mt-8 grid size-20 place-items-center rounded-3xl text-3xl font-black text-bg" style={{ background: `radial-gradient(circle at 30% 25%, #fff, ${c} 45%, #000)` }}>{t.symbol[0]}</div>
        <div className="mt-5 text-5xl font-black tracking-tight">${t.symbol.slice(0, 10)}</div>
        <div className="mt-1 text-lg text-muted">mcap {usd(t.market_cap_usd)}</div>
        <div className="mt-8 text-[96px] font-black leading-none tracking-tight tabular-nums" style={{ color: c }}>{t.score > 0 ? '+' : ''}{t.score}</div>
        <div className="mt-2 text-muted">hive score · {t.smart_buyers} smart wallets buying, {t.smart_sellers} selling</div>
        <div className="absolute inset-x-7 bottom-7 grid grid-cols-2 gap-3">
          <button type="button" onClick={next} className="rounded-2xl border border-ink/[0.14] py-4 font-bold">✕ Skip</button>
          <Link href={`/token/${t.token}`} className="rounded-2xl bg-go py-4 text-center font-black text-bg">Trade →</Link>
        </div>
      </div>
    </div>
  );
}
