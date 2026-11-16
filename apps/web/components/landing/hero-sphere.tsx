'use client';

import { useEffect, useRef } from 'react';

/**
 * The hero sphere: slowly turning gradient, breathing rings, a satellite dot on the outer ring,
 * and a soft pointer parallax (desktop only, off under reduced motion).
 */
export function HeroSphere() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(pointer: fine)').matches) return;
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const onMove = (e: PointerEvent) => {
      tx = (e.clientX / window.innerWidth - 0.5) * 36;
      ty = (e.clientY / window.innerHeight - 0.5) * 28;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(tick) : 0;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute right-[-18vw] top-[8vh] -z-10 sm:right-[-6vw] md:right-[4vw]">
      <div ref={ref} className="sphere-in relative size-[78vw] max-h-[620px] max-w-[620px] will-change-transform sm:size-[58vw]">
        <div className="sphere sphere-spin absolute inset-0" />
        {[1.25, 1.55, 1.9].map((k, i) => (
          <span
            key={k}
            className="rings ring-breathe absolute left-1/2 top-1/2"
            style={{ width: `${k * 100}%`, height: `${k * 100}%`, animationDelay: `${i * 0.9}s` }}
          />
        ))}
        <span className="orbit absolute left-1/2 top-1/2" style={{ width: '155%', height: '155%' }}>
          <span className="absolute left-1/2 top-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1d1d1d]" />
        </span>
        <span className="orbit orbit-rev absolute left-1/2 top-1/2" style={{ width: '190%', height: '190%' }}>
          <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1d1d1d]" />
        </span>
      </div>
    </div>
  );
}
