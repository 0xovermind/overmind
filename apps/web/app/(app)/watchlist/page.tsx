import type { Metadata } from 'next';
import { appShare } from '@/lib/share';
import { WatchlistView } from '@/components/terminal/watch';

export const metadata: Metadata = appShare('Watchlist', '/watchlist', 'Star tokens on Overmind and get an alert when the hive flips from selling to buying, or back.');
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

export default function WatchlistPage() {
  return <WatchlistView />;
}
