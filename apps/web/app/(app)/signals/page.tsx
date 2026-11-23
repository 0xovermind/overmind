import type { Metadata } from 'next';
import { appShare } from '@/lib/share';
import { SignalsView } from '@/components/terminal/signals-view';

export const metadata: Metadata = appShare('Hive signals', '/signals', 'When the most profitable wallets on Robinhood Chain turn on a token together, and what the token did after.');
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

export default function SignalsPage() {
  return <SignalsView />;
}
