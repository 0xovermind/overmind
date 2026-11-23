'use client';

// "Explain" under the hive card: a plain-English read of the token written by the AI analyst from
// Overmind's own data (indexer agents/explain.ts). Cached per token for everyone; Hive Pro can ask for
// a fresh read.
import { useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { auth } from '@/lib/auth';
import { V1 } from '@/lib/members';
import { OVHIVE_BUY_URL, usePro } from '@/lib/pro';

interface Read { text: string; at: string; cached: boolean }

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

export function AiExplain({ token }: { token: string }) {
  const pro = usePro();
  const [read, setRead] = useState<Read | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async (fresh: boolean) => {
    setBusy(true);
    setErr(null);
    try {
      const headers: Record<string, string> = {};
      if (fresh) {
        const t = await auth.getAccessToken();
        if (t) headers.authorization = `Bearer ${t}`;
      }
      const r = await fetch(`${V1}/hive/${token}/explain${fresh ? '?fresh=1' : ''}`, { headers });
      const j = (await r.json().catch(() => null)) as (Read & { error?: { message?: string } }) | null;
      if (!r.ok || !j?.text) throw new Error(j?.error?.message ?? 'The AI analyst is unavailable right now.');
      setRead(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const lines = read?.text.split('\n').map((l) => l.trim()).filter(Boolean) ?? [];
  return (
    <div className="mt-4 border-t border-ink/[0.06] pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          <Sparkle size={12} weight="fill" className="text-[#f06ba8]" /> AI read
        </span>
        {!read && (
          <button type="button" onClick={() => void load(false)} disabled={busy} className="pro-buy rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60">
            {busy ? 'Reading…' : 'Explain this token'}
          </button>
        )}
        {read && pro?.pro && (
          <button type="button" onClick={() => void load(true)} disabled={busy} className="rounded-md bg-ink/[0.08] px-2 py-1 text-[11px] hover:bg-ink/[0.14] disabled:opacity-60">
            {busy ? 'Reading…' : 'Fresh read'}
          </button>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-[#ff5d6c]">{err}</p>}
      {read && (
        <div className="mt-2 space-y-1.5 text-xs leading-relaxed">
          {lines.map((l, i) =>
            /^bottom line/i.test(l) ? (
              <p key={i} className="pt-1 font-semibold">{l}</p>
            ) : (
              <p key={i} className="text-ink/85">{l.replace(/^[-•*]\s*/, '• ')}</p>
            ),
          )}
          <p className="pt-1 text-[10px] text-muted">
            Written by AI from Overmind data · {ago(read.at)} · not financial advice
            {read && !pro?.pro && (
              <>
                {' · '}
                <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="ovhive-grad font-semibold">Hive Pro: fresh reads on demand</a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
