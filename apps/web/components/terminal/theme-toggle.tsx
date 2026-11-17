'use client';

import { useState } from 'react';
import { Moon, Sun } from '@phosphor-icons/react';

/** Dark glass (default) or light paper for the terminal. Stored in a cookie so the server renders it. */
export function ThemeToggle({ initial }: { initial: 'dark' | 'light' }) {
  const [theme, setTheme] = useState(initial);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.querySelector('.terminal-ui')?.setAttribute('data-theme', next);
    document.cookie = `om-theme=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
      className="theme-flip grid size-9 place-items-center rounded-lg border border-ink/[0.08] text-muted transition hover:text-ink"
    >
      <span key={theme} className="theme-icon">{theme === 'dark' ? <Sun size={16} weight="bold" /> : <Moon size={16} weight="bold" />}</span>
    </button>
  );
}
