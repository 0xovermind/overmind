import Link from 'next/link';

/** Arena, its copy-portfolio and the caller season: three views of who reads tokens right. */
const TABS = [
  { href: '/arena', label: 'Arena' },
  { href: '/portfolio', label: 'Copy the hive' },
  { href: '/season', label: 'Caller season' },
];

export function ArenaTabs({ active }: { active: string }) {
  return (
    <nav className="flex w-fit gap-1 rounded-xl border border-ink/[0.08] p-1 text-sm">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={`rounded-lg px-3 py-1.5 transition ${t.href === active ? 'bg-ink/[0.08] text-ink' : 'text-muted hover:text-ink'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
