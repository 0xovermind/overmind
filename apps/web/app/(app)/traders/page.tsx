import type { Metadata } from 'next';
import { appShare } from '@/lib/share';
import { TradersView } from '@/components/terminal/traders-view';

export const metadata: Metadata = appShare('Top traders', '/traders', 'The most profitable wallets on Robinhood Chain, counting only what they actually bought. Bots, snipers and dev dumps left out.');
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

export default function TradersPage() {
  return <TradersView />;
}
