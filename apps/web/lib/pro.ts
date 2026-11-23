'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { auth, useAuth } from './auth';
import { V1 } from './members';

/** Hive Pro: $OVHIVE holders (summed over every wallet on the account) unlock longer hive history. */
export interface ProStatus { pro: boolean; balance: number; threshold: number; wallets: number; token: string }

export const OVHIVE = '0x53d38ba0c217cd4d1f74a36503731023fcd7f358';
export const OVHIVE_BUY_URL = `https://ponsfamily.com/launchpad/${OVHIVE}`;
/** Shown before the first status read (matches the indexer's default). */
export const PRO_MIN_DEFAULT = 1_000_000;

let status: ProStatus | null = null;
let loadedFor: string | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Read (or re-read with refresh) the signed-in user's Hive Pro status. */
export async function loadPro(refresh = false): Promise<void> {
  if (inflight && !refresh) return inflight;
  inflight = (async () => {
    try {
      const token = await auth.getAccessToken();
      if (!token) { status = null; return; }
      const r = await fetch(`${V1}/me/pro${refresh ? '?refresh=1' : ''}`, { headers: { authorization: `Bearer ${token}` } });
      status = r.ok ? ((await r.json()) as ProStatus) : null;
    } catch {
      status = null;
    } finally {
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

/** The current Hive Pro status: null while signed out or unknown. Loads once per signed-in user. */
export function usePro(): ProStatus | null {
  const { ready, authenticated, user } = useAuth();
  const s = useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => status,
    () => null,
  );
  useEffect(() => {
    if (!ready) return;
    const who = authenticated && user ? user.id + (user.externalWallet ?? '') : null;
    if (who === loadedFor) return;
    loadedFor = who;
    if (who) void loadPro(true);
    else { status = null; emit(); }
  }, [ready, authenticated, user]);
  return s;
}
