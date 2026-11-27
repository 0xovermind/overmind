import type { Metadata } from 'next';
import { appShare } from '@/lib/share';
import { ProView } from '@/components/terminal/pro-view';

export const metadata: Metadata = appShare(
  'Hive Pro',
  '/pro',
  'Hold 1,000,000 $OVHIVE and see the hive first: real-time signals, 30-day history, wallet alerts and Overmind AI on demand.',
);
// Per request so the CSP nonce (middleware.ts) reaches Next's inline scripts.
export const dynamic = 'force-dynamic';

export default function ProPage() {
  return <ProView />;
}
