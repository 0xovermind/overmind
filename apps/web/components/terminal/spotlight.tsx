'use client';

import { useEffect } from 'react';

const PANELS = '.rounded-2xl.bg-surface, .rounded-xl.bg-surface, section.bg-surface';

/** A soft light that follows the pointer across the glass panels (sets --mx / --my on the panel under it). */
export function Spotlight() {
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let last: HTMLElement | null = null;
    let raf = 0;
    let ev: PointerEvent | null = null;
    const apply = () => {
      raf = 0;
      if (!ev) return;
      const el = (ev.target as Element | null)?.closest?.(PANELS) as HTMLElement | null;
      if (last && last !== el) last.classList.remove('spot-on');
      if (el) {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${ev.clientX - r.left}px`);
        el.style.setProperty('--my', `${ev.clientY - r.top}px`);
        el.classList.add('spot-on');
      }
      last = el;
    };
    const onMove = (e: PointerEvent) => {
      ev = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
