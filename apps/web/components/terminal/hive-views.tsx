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

/** Tint for a score: green or red, stronger the further from 0; quiet grey near 0. */
function tint(score: number) {
  const s = Math.max(-100, Math.min(100, score)) / 100;
  const a = Math.abs(s);
  if (a < 0.08) return { fill: 'rgba(255,255,255,.045)', edge: 'rgba(255,255,255,.12)', text: 'currentColor', glow: '' };
  const rgb = s > 0 ? '61,220,151' : '255,93,108';
  return { fill: `rgba(${rgb},${(0.1 + a * 0.32).toFixed(2)})`, edge: `rgba(${rgb},${(0.25 + a * 0.55).toFixed(2)})`, text: s > 0 ? UP : DN, glow: a >= 0.6 ? `drop-shadow(0 0 14px rgba(${rgb},.45))` : '' };
}

export function HiveMap({ rows, onPick, picked }: { rows: HiveTok[]; onPick: (t: HiveTok) => void; picked: string | null }) {
  // Biggest tokens in the middle.
  const sorted = useMemo(() => [...rows].sort((a, b) => (b.market_cap_usd ?? 0) - (a.market_cap_usd ?? 0)), [rows]);
  const pos = spiral(sorted.length);
  const R = 44;
  const pts = pos.map(([q, r]) => [R * Math.sqrt(3) * (q + r / 2), R * 1.5 * r] as const);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = R + 10;
  const vb = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + pad * 2} ${Math.max(...ys) - Math.min(...ys) + pad * 2}`;
  const hex = (cx: number, cy: number, r: number) => Array.from({ length: 6 }, (_, k) => { const a = (Math.PI / 3) * k - Math.PI / 2; return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  return (
    <svg viewBox={vb} className="h-full w-full" role="img" aria-label="Hive map: every token as a cell, coloured by the hive score">
      <defs>
        <linearGradient id="hx-ring" x1="0" x2="1"><stop offset="0" stopColor="#facb0e" /><stop offset=".5" stopColor="#f06ba8" /><stop offset="1" stopColor="#78bae6" /></linearGradient>
        <linearGradient id="hx-sheen" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".09" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      {sorted.map((t, i) => {
        const [cx, cy] = pts[i]!;
        const on = picked === t.token;
        const c = tint(t.score);
        return (
          <g key={t.token} className={`hex-cell cursor-pointer ${Math.abs(t.score) >= 60 ? 'hex-strong' : ''}`} style={{ animationDelay: `${Math.min(i, 40) * 16}ms`, filter: c.glow || undefined }} onClick={() => onPick(t)}>
            <title>{`$${t.symbol} · hive ${t.score > 0 ? '+' : ''}${t.score} · ${t.smart_buyers} buying, ${t.smart_sellers} selling`}</title>
            {/* A fat stroke in the fill colour rounds the corners. */}
            <polygon points={hex(cx, cy, R - 9)} fill={c.fill} stroke={c.fill} strokeWidth={10} strokeLinejoin="round" />
            <polygon points={hex(cx, cy, R - 4)} fill="none" stroke={on ? 'url(#hx-ring)' : c.edge} strokeWidth={on ? 2.6 : 1} strokeLinejoin="round" />
            <polygon points={hex(cx, cy, R - 9)} fill="url(#hx-sheen)" stroke="none" pointerEvents="none" />
            <text x={cx} y={cy - 1} textAnchor="middle" fontSize={t.symbol.length > 8 ? 8.5 : 10.5} fontWeight={650} fill="currentColor" pointerEvents="none" letterSpacing=".02em">
              {t.symbol.slice(0, 10)}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fontWeight={600} fill={c.text} fontFamily="var(--font-mono)" pointerEvents="none" opacity=".95">
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
  const S = 1000, C = S / 2, RMAX = 430;
  const blips = rows.map((t) => {
    const s = Math.max(-100, Math.min(100, t.score));
    const r = 70 + ((100 - s) / 200) * (RMAX - 70) + (hash(t.token + 'r') - 0.5) * 36;
    const a = hash(t.token) * Math.PI * 2;
    return { t, s, x: C + r * Math.cos(a), y: C + r * Math.sin(a), size: 3 + Math.min(5, Math.log10(Math.max(10, t.market_cap_usd ?? 10)) * 0.9) };
  });
  // Labels for the strongest reads only, placed right or left of the blip, never on top of another label.
  const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const labelled = new Map<string, { x: number; anchor: 'start' | 'end' }>();
  for (const b of [...blips].sort((p, q) => Math.abs(q.s) - Math.abs(p.s)).slice(0, 12)) {
    const w = (b.t.symbol.length + 5) * 7.6;
    for (const side of ['right', 'left'] as const) {
      const x0 = side === 'right' ? b.x + b.size + 6 : b.x - b.size - 6 - w;
      const box = { x0, x1: x0 + w, y0: b.y - 9, y1: b.y + 9 };
      if (boxes.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) continue;
      if (blips.some((o) => o !== b && o.x > box.x0 - 4 && o.x < box.x1 + 4 && Math.abs(o.y - b.y) < 10)) continue;
      boxes.push(box);
      labelled.set(b.t.token, side === 'right' ? { x: box.x0, anchor: 'start' } : { x: box.x1, anchor: 'end' });
      break;
    }
  }
  const TRAIL = 26;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-full w-full" role="img" aria-label="Hive radar: tokens the smart wallets buy hardest sit closest to the centre">
      <defs>
        <radialGradient id="rd-bg"><stop offset="0" stopColor="#f06ba8" stopOpacity=".06" /><stop offset="1" stopColor="#f06ba8" stopOpacity="0" /></radialGradient>
        <linearGradient id="rd-ring" x1="0" x2="1"><stop offset="0" stopColor="#facb0e" /><stop offset=".5" stopColor="#f06ba8" /><stop offset="1" stopColor="#78bae6" /></linearGradient>
      </defs>
      <circle cx={C} cy={C} r={RMAX} fill="url(#rd-bg)" />
      {[0.2, 0.45, 0.72, 1].map((f, i) => (
        <circle key={f} cx={C} cy={C} r={RMAX * f} fill="none" stroke="currentColor" strokeOpacity={i === 3 ? 0.14 : 0.07} />
      ))}
      <text x={C + 6} y={C - RMAX * 0.2 - 6} fontSize="10" fill="currentColor" opacity=".35" fontFamily="var(--font-mono)">BUYING</text>
      <text x={C + 6} y={C - RMAX + 14} fontSize="10" fill="currentColor" opacity=".35" fontFamily="var(--font-mono)">SELLING</text>
      {/* The sweep: a thin bright line with a fading trail behind it. */}
      <g className="radar-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
        {Array.from({ length: TRAIL }, (_, k) => {
          const a0 = -(k + 1) * (Math.PI / 180) * 1.6, a1 = -k * (Math.PI / 180) * 1.6;
          return <path key={k} d={`M${C},${C} L${C + RMAX * Math.cos(a0)},${C + RMAX * Math.sin(a0)} A${RMAX},${RMAX} 0 0,1 ${C + RMAX * Math.cos(a1)},${C + RMAX * Math.sin(a1)} Z`} fill="#f06ba8" opacity={0.16 * (1 - k / TRAIL)} />;
        })}
        <line x1={C} y1={C} x2={C + RMAX} y2={C} stroke="#f06ba8" strokeOpacity=".7" strokeWidth="1.2" />
      </g>
      {blips.map((b, bi) => {
        const c = b.s >= 0 ? UP : DN;
        const lab = labelled.get(b.t.token);
        return (
          <g key={b.t.token} className="blip-in cursor-pointer" style={{ animationDelay: `${bi * 45}ms` }} onClick={() => onPick(b.t)}>
            <title>{`$${b.t.symbol} · hive ${b.t.score > 0 ? '+' : ''}${b.t.score}`}</title>
            {Math.abs(b.s) >= 60 && <circle className="radar-ping" cx={b.x} cy={b.y} r={b.size + 2} fill="none" stroke={c} strokeWidth="1.5" style={{ animationDelay: `${(hash(b.t.token) * 2.4).toFixed(2)}s` }} />}
            <circle cx={b.x} cy={b.y} r={b.size} fill={c} />
            {lab && (
              <text x={lab.x} y={b.y + 4} textAnchor={lab.anchor} fontSize="12" fill="currentColor" fontFamily="var(--font-mono)">
                <tspan opacity=".9">${b.t.symbol.slice(0, 12)}</tspan>
                <tspan fill={c}> {b.t.score > 0 ? '+' : ''}{b.t.score}</tspan>
              </text>
            )}
          </g>
        );
      })}
      <circle cx={C} cy={C} r="26" fill="var(--color-bg)" stroke="url(#rd-ring)" strokeWidth="1.6" />
      <text x={C} y={C + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" letterSpacing=".12em">HIVE</text>
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
  const W = 1200, H = 780;
  // A 3 x 3 field, busiest token in the middle, the rest around it.
  const slots = [[0.5, 0.47], [0.16, 0.2], [0.5, 0.13], [0.84, 0.2], [0.86, 0.62], [0.64, 0.8], [0.36, 0.8], [0.14, 0.62], [0.5, 0.47]];
  const suns = d.slice(0, 8).map((t, i) => ({ ...t, x: slots[i]![0]! * W, y: slots[i]![1]! * H }));
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="Galaxy: smart wallets around the tokens they traded in the last 24 hours">
        <defs>
          <radialGradient id="sun-buy" cx="35%" cy="30%"><stop offset="0" stopColor="#fff" /><stop offset=".25" stopColor="#bfe3ff" /><stop offset=".7" stopColor="#78bae6" stopOpacity=".55" /><stop offset="1" stopColor="#78bae6" stopOpacity="0" /></radialGradient>
          <radialGradient id="sun-sell" cx="35%" cy="30%"><stop offset="0" stopColor="#fff" /><stop offset=".25" stopColor="#ffc7df" /><stop offset=".7" stopColor="#f06ba8" stopOpacity=".55" /><stop offset="1" stopColor="#f06ba8" stopOpacity="0" /></radialGradient>
        </defs>
        {Array.from({ length: 90 }, (_, i) => (
          <circle key={i} cx={hash(`bx${i}`) * W} cy={hash(`by${i}`) * H} r={0.4 + hash(`br${i}`) * 0.8} fill="currentColor" opacity={0.06 + hash(`bo${i}`) * 0.16} />
        ))}
        {suns.map((s) => {
          const buying = s.net >= 0;
          const ws = s.wallets.slice(0, 18);
          const R0 = 34 + Math.min(10, s.wallets.length / 4);
          return (
            <g key={s.token}>
              {[R0 + 30, R0 + 60].map((r) => (
                <ellipse key={r} cx={s.x} cy={s.y} rx={r} ry={r * 0.78} fill="none" stroke="currentColor" strokeOpacity=".07" strokeDasharray="2 5" />
              ))}
              <g>
                <animateTransform attributeName="transform" type="rotate" from={`0 ${s.x} ${s.y}`} to={`${hash(s.token + 'd') > 0.5 ? 360 : -360} ${s.x} ${s.y}`} dur={`${Math.round(70 + hash(s.token + 'o') * 50)}s`} repeatCount="indefinite" />
              {ws.map((w, k) => {
                const ring = k % 2 ? R0 + 60 : R0 + 30;
                const a = (k / ws.length) * Math.PI * 2 + hash(s.token) * 6 + (hash(w.wallet) - 0.5) * 0.3;
                const x = s.x + ring * Math.cos(a), y = s.y + ring * 0.78 * Math.sin(a);
                const c = w.net >= 0 ? '#78bae6' : '#f06ba8';
                return (
                  <g key={w.wallet} className="cursor-pointer" onClick={() => setStar({ ...w, symbol: s.symbol })}>
                    <title>{`${short(w.wallet)} · ${w.net >= 0 ? 'bought' : 'sold'} $${Math.abs(Math.round(w.net))}`}</title>
                    <line x1={s.x} y1={s.y} x2={x} y2={y} stroke={c} strokeOpacity=".09" />
                    <circle cx={x} cy={y} r={1.8 + Math.min(2.4, Math.log10(1 + Math.abs(w.net)) * 0.8)} fill={c} />
                  </g>
                );
              })}
              </g>
              <Link href={`/token/${s.token}`}>
                <circle className="sun-breathe" cx={s.x} cy={s.y} r={R0 + 14} fill={`url(#${buying ? 'sun-buy' : 'sun-sell'})`} opacity=".35" />
                <circle cx={s.x} cy={s.y} r={R0 * 0.62} fill={`url(#${buying ? 'sun-buy' : 'sun-sell'})`} />
                <text x={s.x} y={s.y + (R0 + 60) * 0.78 + 20} textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">${s.symbol.slice(0, 10)}</text>
                <text x={s.x} y={s.y + (R0 + 60) * 0.78 + 35} textAnchor="middle" fontSize="10.5" fill="currentColor" opacity=".55" fontFamily="var(--font-mono)">
                  {s.buyers} buying · {s.sellers} selling
                </text>
              </Link>
            </g>
          );
        })}
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
