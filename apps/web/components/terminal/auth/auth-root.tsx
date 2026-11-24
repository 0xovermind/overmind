'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { onAuthLoadRequest, privyAppId, setAuthState } from '@/lib/auth';
import { setMe, type MeResult } from '@/lib/members';
import { readHint } from '@/lib/session-hint';
import { MemberGate } from './onboarding';

const PrivyHost = dynamic(() => import('./privy-host'), { ssr: false });

/** Someone signed in last time: load Privy this long after the page has fully loaded. */
const MEMBER_DELAY_MS = 2_500;

/**
 * Loads Privy (a big SDK) only when it's needed: for someone who was signed in here before, a little after
 * the page is on screen (it restores their session); for visitors, only when they ask to sign in or
 * trade. Without NEXT_PUBLIC_PRIVY_APP_ID, sign-in stays off and nothing loads.
 */
export function AuthRoot() {
  const [load, setLoad] = useState(false);
  useEffect(() => {
    // Privy's embedded wallet throws over plain http (and took the whole page down). The middleware
    // redirects http → https; if a page still arrives insecure, switch to https and never mount Privy here.
    if (!window.isSecureContext) {
      if (window.location.protocol === 'http:') window.location.replace(window.location.href.replace(/^http:/, 'https:'));
      setAuthState({ ready: true });
      return;
    }
    if (!privyAppId()) {
      setAuthState({ ready: true });
      return;
    }
    const stop = onAuthLoadRequest(() => setLoad(true));
    // Someone was signed in here last time: paint their member at once and load the SDK now
    // (it restores the session) instead of after the usual delay.
    const hint = readHint();
    if (hint) {
      const me = hint.me as MeResult | null;
      if (me && (me.status === 'registered' || me.status === 'unregistered')) setMe(me);
    }
    const idle = (cb: () => void, timeout: number) =>
      typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(cb, { timeout }) : window.setTimeout(cb, 0);
    if (hint) {
      // A little after the page is fully in and the main thread is free, so the SDK (~700 KB with the
      // wallet modules) doesn't compete with the page itself. The member is painted from the hint meanwhile.
      let cancelled = false;
      let t: number | undefined;
      const go = () => { t = window.setTimeout(() => idle(() => !cancelled && setLoad(true), 3_000), MEMBER_DELAY_MS); };
      if (document.readyState === 'complete') go();
      else window.addEventListener('load', go, { once: true });
      return () => {
        cancelled = true;
        stop();
        window.clearTimeout(t);
        window.removeEventListener('load', go);
      };
    }
    // Visitors: nothing loads until they ask to sign in (or press a trade button), via onAuthLoadRequest.
    // Until then the session is known to be signed out.
    setAuthState({ ready: true });
    return stop;
  }, []);
  return (
    <>
      {load && <PrivyHost />}
      <MemberGate />
    </>
  );
}
