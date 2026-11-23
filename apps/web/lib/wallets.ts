'use client';

// Followed wallets (Hive Pro): /v1/me/wallets. Alerts for them arrive in the bell with the hive alerts.
import { useCallback, useEffect, useState } from 'react';
import { auth, useAuth } from './auth';
import { V1 } from './members';
import { useIsMember } from './watchlist';

export interface FollowedWallet { wallet: string; label: string | null; since: string; lastAlertAt: string | null }

/** Fired after a follow changes, so every follow button and the list refresh. */
const WALLETS_CHANGED = 'overmind:wallets-changed';

async function headers(json = false): Promise<Record<string, string>> {
  const token = await auth.getAccessToken();
  return { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) };
}

// One shared list for every hook on the page (a traders table has a follow button per row).
let shared: { items: FollowedWallet[]; max: number } | null = null;
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();

function fetchShared(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const r = await fetch(`${V1}/me/wallets`, { headers: await headers() });
      if (r.ok) shared = (await r.json()) as { items: FollowedWallet[]; max: number };
    } catch {
      // keep what we have
    } finally {
      loading = null;
      subs.forEach((s) => s());
    }
  })();
  return loading;
}

/** My followed wallets (null while loading or signed out). */
export function useFollowedWallets() {
  const member = useIsMember();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!member) return;
    const on = () => tick((n) => n + 1);
    subs.add(on);
    if (!shared) void fetchShared();
    const changed = () => void fetchShared(true);
    window.addEventListener(WALLETS_CHANGED, changed);
    return () => {
      subs.delete(on);
      window.removeEventListener(WALLETS_CHANGED, changed);
    };
  }, [member]);
  const reload = useCallback(() => fetchShared(true), []);
  return { items: member ? shared?.items ?? null : null, max: shared?.max ?? 25, member, reload };
}

/** Follow or unfollow. Returns an error message (e.g. Pro required) or null. */
export async function setFollow(wallet: string, follow: boolean, label?: string): Promise<string | null> {
  try {
    const r = await fetch(`${V1}/me/wallets/${wallet.toLowerCase()}`, {
      method: follow ? 'POST' : 'DELETE',
      headers: await headers(follow),
      body: follow ? JSON.stringify(label ? { label } : {}) : undefined,
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
      return j?.error?.message ?? `Could not ${follow ? 'follow' : 'unfollow'} (${r.status}).`;
    }
    window.dispatchEvent(new Event(WALLETS_CHANGED));
    return null;
  } catch {
    return 'Network error, try again.';
  }
}

/** One wallet's follow state, for a follow button (asks to sign in when signed out). */
export function useFollowWallet(wallet: string) {
  const { items, member } = useFollowedWallets();
  const session = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const following = !!items?.some((w) => w.wallet === wallet.toLowerCase());
  const toggle = async () => {
    if (!session.authenticated) return auth.login();
    if (!member || busy) return;
    setBusy(true);
    setError(await setFollow(wallet, !following));
    setBusy(false);
  };
  return { following, toggle, busy, error, clearError: () => setError(null) };
}
