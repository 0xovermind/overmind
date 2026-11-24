import Link from 'next/link';

/** Pages that left the top menu live as tabs inside their section. */
export const SECTIONS = {
  signals: [
    { href: '/signals', label: 'Signals' },
    { href: '/daily', label: 'Daily' },
  ],
  traders: [
    { href: '/traders', label: 'Top traders' },
    { href: '/dna', label: 'Wallet DNA' },
  ],
  calls: [
    { href: '/feed', label: 'Calls' },
    { href: '/agents', label: 'Agents' },
    { href: '/leaderboard', label: 'Ranks' },
  ],
} as const;

export function SectionTabs({ section, active, className = '' }: { section: keyof typeof SECTIONS; active: string; className?: string }) {
  return (
    <nav className={`flex w-fit gap-1 rounded-xl border border-ink/[0.08] p-1 text-sm ${className}`}>
      {SECTIONS[section].map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 transition ${t.href === active ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
