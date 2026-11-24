'use client';

// Small Overmind AI pieces (indexer agents/explain.ts): the Hive Daily recap as a ready-to-post tweet,
// "Why?" on a hive signal, and "Ask the hive" for Hive Pro.
import { useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { auth } from '@/lib/auth';
import { V1 } from '@/lib/members';
import { OVHIVE_BUY_URL, usePro } from '@/lib/pro';

async function get<T>(path: string, init: RequestInit = {}, authed = false): Promise<T> {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (authed) {
    const t = await auth.getAccessToken().catch(() => null);
    if (t) headers.authorization = `Bearer ${t}`;
  }
  const r = await fetch(`${V1}${path}`, { ...init, headers });
  const j = (await r.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!r.ok || !j) throw new Error(j?.error?.message ?? 'The AI analyst is unavailable right now.');
  return j;
}

function Lines({ text }: { text: string }) {
  return (
    <div className="space-y-1 text-xs leading-relaxed">
      {text.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) =>
        /^bottom line/i.test(l) ? <p key={i} className="pt-0.5 font-semibold">{l}</p> : <p key={i} className="text-ink/85">{l.replace(/^[-•*]\s*/, '• ')}</p>,
      )}
    </div>
  );
}

/** Hive Daily as a tweet, written by AI from the board, with a copy button. */
export function DailyRecap({ scope }: { scope: 'pons' | 'all' }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = async () => {
    setBusy(true); setErr(null);
    try { setText((await get<{ text: string }>(`/ai/daily?scope=${scope}`)).text); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="pro-banner mt-5 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
          <Sparkle size={12} weight="fill" className="text-[#f06ba8]" /> AI recap · ready to post
        </span>
        {!text ? (
          <button type="button" onClick={() => void load()} disabled={busy} className="pro-buy rounded-md px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
            {busy ? 'Writing…' : 'Write today’s recap'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
            className="rounded-md bg-ink/[0.1] px-3 py-1.5 text-xs font-semibold hover:bg-ink/[0.16]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {text && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{text}</p>}
      {err && <p className="mt-2 text-xs text-[#ff5d6c]">{err}</p>}
      <p className="mt-2 text-[10px] text-muted">Written by AI (DeepSeek) from the board above · not financial advice</p>
    </section>
  );
}

/** "Why?" under a hive signal: the smart flows behind it, explained. */
export function SignalWhy({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = async () => {
    if (text) return setText(null);
    setBusy(true); setErr(null);
    try { setText((await get<{ text: string }>(`/hive/signals/${id}/why`, {}, true)).text); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="px-3 pb-2 pl-[68px]">
      <button type="button" onClick={() => void load()} disabled={busy} className="flex items-center gap-1 text-[11px] text-muted transition hover:text-ink disabled:opacity-60">
        <Sparkle size={11} weight="fill" className="text-[#f06ba8]" /> {busy ? 'Reading the flows…' : text ? 'Hide' : 'Why?'}
      </button>
      {text && <div className="mt-1.5 rounded-lg bg-ink/[0.03] p-2.5"><Lines text={text} /></div>}
      {err && <p className="mt-1 text-[11px] text-[#ff5d6c]">{err}</p>}
    </div>
  );
}

/** Ask the hive (Hive Pro): a question about this token, answered from Overmind's data. */
export function AskHive({ token }: { token: string }) {
  const pro = usePro();
  const [q, setQ] = useState('');
  const [a, setA] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!pro?.pro) {
    return (
      <p className="mt-3 text-[11px] text-muted">
        Ask the hive your own question about this token with{' '}
        <a href={OVHIVE_BUY_URL} target="_blank" rel="noopener noreferrer" className="ovhive-grad font-semibold">Hive Pro</a>.
      </p>
    );
  }
  const ask = async () => {
    if (q.trim().length < 3 || busy) return;
    setBusy(true); setErr(null);
    try {
      setA((await get<{ text: string }>(`/hive/${token}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q.trim() }) }, true)).text);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={240} placeholder="Ask the hive: did the dev sell? who are the top holders?"
          className="min-w-0 flex-1 rounded-lg border border-ink/[0.08] bg-bg px-2.5 py-1.5 text-xs outline-none focus:border-ink/20" />
        <button type="submit" disabled={busy || q.trim().length < 3} className="pro-buy rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{busy ? '…' : 'Ask'}</button>
      </form>
      {a && <div className="mt-2 rounded-lg bg-ink/[0.03] p-2.5"><Lines text={a} /></div>}
      {err && <p className="mt-1 text-[11px] text-[#ff5d6c]">{err}</p>}
    </div>
  );
}
