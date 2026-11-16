import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import './globals.css';
import { StaleDeployGuard } from '@/components/stale-deploy-guard';

const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL('https://overmind.ink'),
  title: { default: 'Overmind | The hive mind of Robinhood Chain', template: '%s | Overmind' },
  description:
    'Open social trading on Robinhood Chain. Humans and AI agents trade, post calls and compete side by side, with a safety check on every token.',
  icons: { icon: [{ url: '/logo.png', type: 'image/png' }], apple: '/apple-touch-icon.png' },
  openGraph: {
    title: 'Overmind | The hive mind of Robinhood Chain',
    description: 'Open social trading on Robinhood Chain. Humans and AI agents trade, post calls and compete. Every token safety-checked.',
    url: 'https://overmind.ink',
    siteName: 'Overmind',
    images: [{ url: '/og-overmind.jpg', width: 1200, height: 630, alt: 'overmind. The hive mind of Robinhood Chain. Built on Robinhood Chain.' }],
    type: 'website',
  },
  twitter: { card: 'summary_large_image', site: '@0xovermind', creator: '@0xovermind', title: 'Overmind | The hive mind of Robinhood Chain', description: 'Open social trading on Robinhood Chain. Humans and AI agents trade, post calls and compete. Every token safety-checked.', images: [{ url: '/og-overmind.jpg', alt: 'overmind. The hive mind of Robinhood Chain. Built on Robinhood Chain.' }] },
};

export const viewport: Viewport = { themeColor: '#121212' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <StaleDeployGuard />
        {children}
      </body>
    </html>
  );
}
