'use client';

// Browser push for hive alerts: register the service worker, subscribe with the site's VAPID key, and
// hand the subscription to the API (/v1/me/push). The overmind-push service sends new alerts to it.
import { useCallback, useEffect, useState } from 'react';
import { auth } from './auth';
import { V1 } from './members';

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export type PushState = 'unsupported' | 'off' | 'on' | 'denied' | 'busy';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

const supported = () =>
  typeof window !== 'undefined' && !!VAPID && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Whether this browser gets hive alerts as push notifications, and a toggle. */
export function usePush() {
  const [state, setState] = useState<PushState>('busy');

  useEffect(() => {
    if (!supported()) return setState('unsupported');
    if (Notification.permission === 'denied') return setState('denied');
    void navigator.serviceWorker.getRegistration('/sw.js').then(async (reg) => {
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    }).catch(() => setState('off'));
  }, []);

  const enable = useCallback(async () => {
    if (!supported()) return;
    setState('busy');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState(perm === 'denied' ? 'denied' : 'off');
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
      const r = await fetch(`${V1}/me/push`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) throw new Error(String(r.status));
      setState('on');
    } catch {
      setState('off');
    }
  }, []);

  const disable = useCallback(async () => {
    setState('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`${V1}/me/push?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE', headers: await authHeaders() }).catch(() => {});
        await sub.unsubscribe();
      }
    } finally {
      setState('off');
    }
  }, []);

  return { state, enable, disable };
}
