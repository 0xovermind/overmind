import type { MetadataRoute } from 'next';

/**
 * Crawlers: the landing, token pages and the public boards are welcome. Per-wallet pages, launch replays and
 * raw APIs are not: they link to each other without end and each one is a heavy read (Caddy also turns known
 * AI bots away from them).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dna/', '/token/*/replay', '/idx/', '/api/', '/me', '/settings', '/watchlist', '/u/'],
      },
    ],
    sitemap: undefined,
  };
}
