'use client';

// Crowd vote under the hive card: one click, bullish or bearish, no account needed (indexer
// agents/votes.ts). Shown as its own bar; it never moves the hive score.
import { useEffect, useState } from 'react';
import { ArrowFatDown, ArrowFatUp } from '@phosphor-icons/react';
import { auth } from '@/lib/auth';
import { V1 } from '@/lib/members';

interface Tally { bullish: number; bearish: number; total: number; mine: 'bullish' | 'bearish' | null }

async function headers(json = false): Promise<Record<string, string>> {
  const t = await auth.getAccessToken().catch(() => null);
  return { ...(t ? { authorization: `Bearer ${t}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) };
}

export function CrowdVote({ token }: { token: string }) {
  const [t, setT] = useState<Tally | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(`${V1}/tokens/${token}/votes`, { headers: await headers() });
        if (r.ok && live) setT((await r.json()) as Tally);
      } catch {
        // keep what we have
      }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { live = false; clearInterval(id); };
  }, [token]);

  const vote = async (stance: 'bullish' | 'bearish') => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`${V1}/tokens/${token}/votes`, { method: 'POST', headers: await headers(true), body: JSON.stringify({ stance }) });
      const j = (await r.json().catch(() => null)) as (Tally & { error?: { message?: string } }) | null;
      if (!r.ok || !j) throw new Error(j?.error?.message ?? 'Could not record your vote.');
      setT(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not record your vote.');
    } finally {
      setBusy(false);
    }
  };

  const bullPct = t && t.total ? Math.round((t.bullish / t.total) * 100) : 50;
  const btn = (stance: 'bullish' | 'bearish') => {
    const on = t?.mine === stance;
    const up = stance === 'bullish';
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void vote(stance)}
        aria-pressed={on}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${
          on
            ? up ? 'border-[#3ddc97]/50 bg-[#3ddc97]/15 text-[#3ddc97]' : 'border-[#ff5d6c]/50 bg-[#ff5d6c]/15 text-[#ff5d6c]'
            : 'border-ink/[0.1] text-muted hover:border-ink/25 hover:text-ink'
        }`}
      >
        {up ? <ArrowFatUp size={13} weight={on ? 'fill' : 'regular'} /> : <ArrowFatDown size={13} weight={on ? 'fill' : 'regular'} />}
        {up ? 'Bullish' : 'Bearish'}
      </button>
    );
  };

  return (
    <div className="mt-4 border-t border-ink/[0.06] pt-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Crowd vote · 24h</span>
        <span className="font-mono text-[11px] text-muted">{t ? `${t.total} vote${t.total === 1 ? '' : 's'}` : '—'}</span>
      </div>
      <div className="mt-2 flex gap-2">{btn('bullish')}{btn('bearish')}</div>
      {t && t.total > 0 && (
        <>
          <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
            <span className="bg-[#3ddc97] transition-all duration-500" style={{ width: `${bullPct}%` }} />
            <span className="bg-[#ff5d6c] transition-all duration-500" style={{ width: `${100 - bullPct}%` }} />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px]">
            <span className="text-[#3ddc97]">{bullPct}% bullish</span>
            <span className="text-[#ff5d6c]">{100 - bullPct}% bearish</span>
          </div>
        </>
      )}
      {err && <p className="mt-1.5 text-xs text-[#ff5d6c]">{err}</p>}
      <p className="mt-1.5 text-[10px] text-muted">One click, no account. Separate from the hive score.</p>
    </div>
  );
}
