import type { Metadata } from 'next';
import { appShare } from '@/lib/share';
import { HiveExplorer } from '@/components/terminal/hive-explorer';

export const metadata: Metadata = appShare(
  'The hive',
  '/hive',
  'What the most profitable wallets on Robinhood Chain are doing right now: as a honeycomb map, a radar, a galaxy of wallets or one card at a time.',
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

const VIEWS = ['map', 'radar', 'galaxy', 'swipe'] as const;

export default async function HivePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const v = (await searchParams).view;
  const initial = (VIEWS as readonly string[]).includes(v ?? '') ? (v as (typeof VIEWS)[number]) : 'map';
  return <HiveExplorer initial={initial} />;
}
