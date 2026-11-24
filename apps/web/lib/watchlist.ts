'use client';

// Watchlist (starred tokens) and hive alerts for the signed-in member: /v1/me/watchlist and /v1/me/alerts.
import { useCallback, useEffect, useState } from 'react';
import { auth, useAuth } from './auth';
import { useMe, V1 } from './members';

export type HiveSide = 'buying' | 'selling' | 'split';

export interface WatchItem {
  token: { address: string; symbol: string | null; name: string | null; imageUrl: string | null; marketCapUsd: number | null };
  hive: { side: HiveSide; score: number | null; voters: number; at: string } | null;
  starredAt: string;
}

export interface HiveAlert {
  id: string;
  kind?: 'hive';
  token: { address: string; symbol: string | null; imageUrl: string | null };
  side: 'buying' | 'selling';
  score: number | null;
  from: { side: HiveSide | null; score: number | null };
  createdAt: string;
  read: boolean;
}

/** A followed wallet bought, sold, sent or received a token (Hive Pro, lib/wallets.ts). */
export interface WalletAlert {
  id: string;
  kind: 'wallet';
  token: { address: string; symbol: string | null; imageUrl: string | null };
  wallet: { address: string; label: string | null };
  action: 'buy' | 'sell' | 'in' | 'out' | 'coexit';
  amount: number;
  usd: number | null;
  counterparty: string | null;
  tx: string;
  at: string;
  createdAt: string;
  read: boolean;
}

export type AnyAlert = HiveAlert | WalletAlert;

/** Fired after a star changes, so the watchlist page and other stars refresh. */
const WATCH_CHANGED = 'overmind:watch-changed';
const ALERTS_POLL_MS = 60_000;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Signed in and registered: the only state where watchlist calls make sense. */
export function useIsMember(): boolean {
  const session = useAuth();
  const me = useMe();
  return session.authenticated && me?.status === 'registered';
}

/** The star on a token page: whether it's starred, and a toggle (asks to sign in when signed out). */
export function useWatching(token: string) {
  const member = useIsMember();
  const session = useAuth();
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member) return setWatching(false);
    let live = true;
    const load = async () => {
      try {
        const r = await fetch(`${V1}/me/watchlist/${token}`, { headers: await authHeaders() });
        if (r.ok && live) setWatching(((await r.json()) as { watching: boolean }).watching);
      } catch {
        // leave as is
      }
    };
    void load();
    const on = () => void load();
    window.addEventListener(WATCH_CHANGED, on);
    return () => {
      live = false;
      window.removeEventListener(WATCH_CHANGED, on);
    };
  }, [member, token]);

  const toggle = async () => {
    if (!session.authenticated) return auth.login();
    if (!member || busy) return;
    const next = !watching;
    setWatching(next);
    setBusy(true);
    try {
      const r = await fetch(`${V1}/me/watchlist/${token}`, { method: next ? 'POST' : 'DELETE', headers: await authHeaders() });
      if (!r.ok) throw new Error(String(r.status));
      window.dispatchEvent(new Event(WATCH_CHANGED));
    } catch {
      setWatching(!next);
    } finally {
      setBusy(false);
    }
  };
  return { watching, toggle, member, signedIn: session.authenticated };
}

/** My starred tokens with the hive's last reading. */
export function useWatchlist() {
  const member = useIsMember();
  const [items, setItems] = useState<WatchItem[] | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${V1}/me/watchlist`, { headers: await authHeaders() });
      if (r.ok) setItems(((await r.json()) as { items: WatchItem[] }).items);
    } catch {
      // keep what we have
    }
  }, []);
  useEffect(() => {
    if (!member) return;
    void load();
    const on = () => void load();
    window.addEventListener(WATCH_CHANGED, on);
    const t = setInterval(on, ALERTS_POLL_MS);
    return () => {
      window.removeEventListener(WATCH_CHANGED, on);
      clearInterval(t);
    };
  }, [member, load]);
  return { items, member };
}

/** My hive alerts, polled every minute, with mark-all-read. */
export function useAlerts() {
  const member = useIsMember();
  const [items, setItems] = useState<AnyAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`${V1}/me/alerts`, { headers: await authHeaders() });
      if (!r.ok) return;
      const j = (await r.json()) as { items: AnyAlert[]; unread: number };
      setItems(j.items);
      setUnread(j.unread);
    } catch {
      // keep what we have
    }
  }, []);
  useEffect(() => {
    if (!member) return;
    void load();
    const t = setInterval(() => void load(), ALERTS_POLL_MS);
    return () => clearInterval(t);
  }, [member, load]);
  const markRead = async () => {
    if (!unread) return;
    setUnread(0);
    setItems((cur) => cur.map((a) => ({ ...a, read: true })));
    try {
      await fetch(`${V1}/me/alerts/read`, { method: 'POST', headers: await authHeaders() });
    } catch {
      // the next poll corrects it
    }
  };
  return { items, unread, markRead, member };
}

export const SIDE_LABEL: Record<HiveSide, string> = { buying: 'Buying', selling: 'Selling', split: 'Split' };
