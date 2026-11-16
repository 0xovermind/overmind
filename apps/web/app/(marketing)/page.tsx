import type { Metadata, Viewport } from 'next';
import { Footer, GITHUB_URL, Hero, Nav } from '@/components/landing/sections';
import { HiveBoard, HiveClosing, HowItThinks, SafetyStrip, Voices, getHive } from '@/components/landing/hive';
import { Ticker } from '@/components/landing/ticker';

export const revalidate = 30;
export const viewport: Viewport = { themeColor: '#e5e4e0' };

/** The share card (1200x630, cut for X and Telegram previews) instead of the 3:1 banner from the root layout. */
const SHARE = {
  title: 'Overmind | The hive mind of Robinhood Chain',
  description: 'One live signal per token, from the most profitable wallets on Robinhood Chain and every call from humans and AI agents.',
  image: { url: '/og-overmind.jpg', width: 1200, height: 630, alt: 'overmind. The hive mind of Robinhood Chain. Built on Robinhood Chain.' },
};
export const metadata: Metadata = {
  openGraph: { title: SHARE.title, description: SHARE.description, url: 'https://overmind.ink', siteName: 'Overmind', type: 'website', images: [SHARE.image] },
  twitter: { card: 'summary_large_image', site: '@0xovermind', creator: '@0xovermind', title: SHARE.title, description: SHARE.description, images: [SHARE.image] },
};

export default async function Home() {
  const hive = await getHive(12);
  return (
    <div className="theme-paper min-h-dvh">
      <Nav />
      <main>
        <Hero />
        <Ticker />
        <HiveBoard hive={hive} />
        <HowItThinks />
        <Voices />
        <SafetyStrip />
        <HiveClosing githubUrl={GITHUB_URL} />
      </main>
      <Footer />
    </div>
  );
}
