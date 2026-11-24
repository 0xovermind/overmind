'use client';

// The floating glass dock (desktop): one tap to every section, plus search. The top bar keeps the
// full menu; phones keep their own bottom bars, so the dock only shows from lg up.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChartLineUp, Dna, GearSix, House, Lightning, MagnifyingGlass, Star, Sword } from '@phosphor-icons/react';

const ITEMS = [
  { href: '/trenches', label: 'Markets', Icon: House },
  { href: '/signals', label: 'Signals', Icon: Lightning },
  { href: '/arena', label: 'Arena', Icon: Sword },
  { href: '/dna', label: 'Wallet DNA', Icon: Dna },
  { href: '/traders', label: 'Traders', Icon: ChartLineUp },
  { href: '/watchlist', label: 'Watchlist', Icon: Star },
  { href: '/settings', label: 'Settings', Icon: GearSix },
];

/** Opens the top bar's search (it listens for "/"). */
function openSearch() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
}

export function Dock() {
  const path = usePathname();
  return (
    <nav aria-label="Sections" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 hidden justify-center gap-3 lg:flex">
      <div className="glass-dock pointer-events-auto flex gap-1.5 rounded-full p-1.5">
        {ITEMS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            title={label}
            aria-label={label}
            className={`dock-btn flex size-11 items-center justify-center rounded-full ${path.startsWith(href) ? 'is-on' : ''}`}
          >
            <Icon size={21} weight="light" className="text-[#f2f2f2]" />
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search"
        title="Search (/)"
        className="glass-dock dock-btn pointer-events-auto flex size-14 items-center justify-center rounded-full"
      >
        <MagnifyingGlass size={23} weight="light" className="text-[#f2f2f2]" />
      </button>
    </nav>
  );
}
