'use client';

// /hive: Map, Radar, Galaxy and Swipe over the same live hive board.
import { useState } from 'react';
import { HiveGalaxy, HiveMap, HiveRadar, SwipeDeck, TokenCard, useHive, type HiveTok } from './hive-views';

const VIEWS = [
  { id: 'map', label: 'Map', note: 'Every token a cell. Green: the best wallets are buying. Red: they are leaving. Biggest in the middle.' },
  { id: 'radar', label: 'Radar', note: 'The harder smart money buys a token, the closer it sits to the centre. Sellers drift out.' },
  { id: 'galaxy', label: 'Galaxy', note: 'Tokens are suns, smart wallets are stars: blue buying, pink selling, last 24 hours. Tap a star.' },
  { id: 'swipe', label: 'Swipe', note: 'One token at a time, strongest reads first. Swipe or press ← → to skip.' },
] as const;
type View = (typeof VIEWS)[number]['id'];

export function HiveExplorer({ initial }: { initial: View }) {
  const [view, setView] = useState<View>(initial);
  const [scope, setScope] = useState<'pons' | 'all'>('pons');
  const rows = useHive(scope);
  const [picked, setPicked] = useState<HiveTok | null>(null);
  const meta = VIEWS.find((v) => v.id === view)!;
  const go = (v: View) => {
    setView(v);
    window.history.replaceState(null, '', `/hive?view=${v}`);
  };
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">The hive</div>
          <h1 className="text-2xl font-extrabold tracking-tight">What the best wallets are doing, live</h1>
        </div>
        <nav className="ml-auto flex rounded-xl border border-ink/[0.08] p-1 text-sm">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => go(v.id)} className={`rounded-lg px-3.5 py-1.5 transition ${v.id === view ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}>
              {v.label}
            </button>
          ))}
        </nav>
        <nav className="flex rounded-xl border border-ink/[0.08] p-1 font-mono text-xs">
          {(['pons', 'all'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={`rounded-lg px-3 py-1.5 ${s === scope ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}>
              {s === 'pons' ? 'Pons' : 'Whole chain'}
            </button>
          ))}
        </nav>
      </div>
      <p className="mt-1 text-sm text-muted">{meta.note}</p>
      <div className="relative mt-3 min-h-0 flex-1">
        {view === 'galaxy' ? (
          <HiveGalaxy scope={scope} />
        ) : !rows ? (
          <div className="grid h-full place-items-center text-sm text-muted">Reading the hive…</div>
        ) : view === 'swipe' ? (
          <div className="flex h-full items-center justify-center"><SwipeDeck rows={rows} /></div>
        ) : (
          <div className="grid h-full gap-4 lg:grid-cols-[1fr_320px]">
            <div className="min-h-[420px]">{view === 'map' ? <HiveMap rows={rows} onPick={setPicked} picked={picked?.token ?? null} /> : <HiveRadar rows={rows} onPick={setPicked} />}</div>
            <aside className="flex flex-col gap-3 overflow-y-auto">
              {picked ? (
                <TokenCard t={picked} onClose={() => setPicked(null)} />
              ) : (
                <Strongest rows={rows} onPick={setPicked} />
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function Strongest({ rows, onPick }: { rows: HiveTok[]; onPick: (t: HiveTok) => void }) {
  const buying = [...rows].sort((a, b) => b.score - a.score).slice(0, 5);
  const selling = [...rows].sort((a, b) => a.score - b.score).slice(0, 5);
  const list = (title: string, xs: HiveTok[], color: string) => (
    <section className="rounded-2xl border border-ink/[0.08] bg-surface p-4">
      <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color }}>{title}</div>
      <ul className="mt-2 space-y-1">
        {xs.map((t) => (
          <li key={t.token}>
            <button type="button" onClick={() => onPick(t)} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm transition hover:bg-ink/[0.05]">
              <span className="font-semibold">${t.symbol.slice(0, 12)}</span>
              <span className="font-mono" style={{ color }}>{t.score > 0 ? '+' : ''}{t.score}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <>
      {list('Smart money buying', buying, '#3ddc97')}
      {list('Smart money leaving', selling, '#ff5d6c')}
    </>
  );
}
