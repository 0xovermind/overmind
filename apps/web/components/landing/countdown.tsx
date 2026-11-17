'use client';

import { useEffect, useState } from 'react';

const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0');

/** Days / hours / minutes / seconds to the launch; each digit flips when it changes. Reloads at zero. */
export function Countdown({ to }: { to: string }) {
  const target = Date.parse(to);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= target) {
        clearInterval(id);
        setTimeout(() => window.location.reload(), 1500);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  const left = Math.max(0, (target - (now ?? target)) / 1000);
  const parts: [string, string][] = [
    [pad(Math.floor(left / 86400)), 'days'],
    [pad(Math.floor((left % 86400) / 3600)), 'hours'],
    [pad(Math.floor((left % 3600) / 60)), 'minutes'],
    [pad(Math.floor(left % 60)), 'seconds'],
  ];
  return (
    <div className="rise mt-10 flex flex-wrap items-end gap-3 md:mt-14 md:gap-5" style={{ animationDelay: '0.25s' }} aria-live="polite">
      {parts.map(([v, k], i) => (
        <div key={k} className="flex items-end gap-3 md:gap-5">
          <div className="flex flex-col">
            <span className="flex">
              {v.split('').map((d, j) => (
                <span key={`${j}-${d}`} className="cd-digit display inline-block w-[0.62em] text-center text-[64px] leading-none md:text-[120px]">
                  {now == null ? '–' : d}
                </span>
              ))}
            </span>
            <span className="label mt-3 text-muted">{k}</span>
          </div>
          {i < 3 && <span className="display pb-9 text-[40px] text-ink/30 md:pb-12 md:text-[80px]">:</span>}
        </div>
      ))}
    </div>
  );
}
