/**
 * Two hosts, one Worker: the landing and legal pages live on overmind.ink, the terminal on app.overmind.ink
 * (middleware.ts routes between them). Set NEXT_PUBLIC_APP_URL in production builds; without it (local dev)
 * app links stay relative, so one dev server serves both.
 */
export const SITE_URL = 'https://overmind.ink';
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');

/** A terminal link from the landing: absolute to the app host in production, relative locally. */
export const appHref = (path: string) => `${APP_URL}${path}`;
