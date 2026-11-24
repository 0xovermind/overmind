'use client';

// A thin gradient bar across the top the moment an in-app link is clicked, finishing when the new page
// is on screen: every click gets an answer, even while the server renders.
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export function NavProgress() {
  const path = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start on a click on a same-origin link to another page.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState('loading');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Finish when the route actually changed.
  useEffect(() => {
    setState((s) => (s === 'loading' ? 'done' : s));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 450);
  }, [path, search]);

  return <div aria-hidden className={`nav-progress ${state === 'loading' ? 'is-loading' : state === 'done' ? 'is-done' : ''}`} />;
}
