import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp, newNonce } from '@/components/trade/csp';

/** Terminal routes: served on app.overmind.ink, with the strict per-request-nonce CSP (see components/trade/csp.ts). */
const APP_ROUTES = /^\/(trenches|token|feed|swap|settings|me|u|leaderboard|agents)(\/|$)/;
/** Landing, legal, whitepaper and transparency pages: served on overmind.ink. */
const SITE_ROUTES = /^\/(terms|privacy|risk|whitepaper|transparency)(\/|$)/;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const SITE_HOST = 'overmind.ink';
const APP_HOST = 'app.overmind.ink';
/** Browsers remember to use https for a year (no includeSubDomains/preload until every subdomain is https-only). */
/** NEXT_PUBLIC_SINGLE_HOST=1: one host (overmind.ink) serves landing and terminal, no app. subdomain. */
const SPLIT_HOSTS = process.env.NEXT_PUBLIC_SINGLE_HOST !== '1';
const HSTS = 'max-age=31536000';

function isHttp(req: NextRequest): boolean {
  if (req.nextUrl.protocol === 'http:') return true;
  if (req.headers.get('x-forwarded-proto') === 'http') return true;
  return (req.headers.get('cf-visitor') ?? '').includes('"http"');
}

function redirect(req: NextRequest, host: string, pathname = req.nextUrl.pathname) {
  const url = req.nextUrl.clone();
  url.protocol = 'https:';
  url.host = host;
  url.port = '';
  url.pathname = pathname;
  return NextResponse.redirect(url, 301);
}

/**
 * 1. Plain http → https (301). Privy's embedded wallet refuses to run over http.
 * 2. Hosts: the terminal lives on app.overmind.ink, the landing and legal pages on overmind.ink. Old
 *    overmind.ink/trenches, /token/… links move to the app host (301), legal links on the app host move
 *    back, and app.overmind.ink/ opens the trenches. Locally one dev server serves everything.
 * 3. Strict CSP with a per-request nonce on the terminal pages. Next.js reads the nonce from the request's
 *    CSP header and puts it on its own scripts; these routes render dynamically.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') ?? req.nextUrl.host).toLowerCase();
  const local = LOCAL.test(host);
  const path = req.nextUrl.pathname;
  if (!local && !SPLIT_HOSTS) {
    if (host === `www.${SITE_HOST}`) return redirect(req, SITE_HOST);
    if (isHttp(req)) return redirect(req, host);
  } else if (!local) {
    const onApp = host === APP_HOST;
    if (onApp && path === '/') return redirect(req, APP_HOST, '/trenches');
    if (onApp && SITE_ROUTES.test(path)) return redirect(req, SITE_HOST);
    if (!onApp && APP_ROUTES.test(path)) return redirect(req, APP_HOST);
    if (host === `www.${SITE_HOST}`) return redirect(req, SITE_HOST);
    if (isHttp(req)) return redirect(req, host);
  }

  let res: NextResponse;
  if (APP_ROUTES.test(path)) {
    const nonce = newNonce();
    const csp = buildCsp({ nonce, dev: process.env.NODE_ENV !== 'production', apiUrl: process.env.NEXT_PUBLIC_API_URL });
    const headers = new Headers(req.headers);
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', csp);
    res = NextResponse.next({ request: { headers } });
    res.headers.set('content-security-policy', csp);
  } else {
    res = NextResponse.next();
  }
  if (!local) res.headers.set('strict-transport-security', HSTS);
  return res;
}

export const config = {
  // Every page; static files and Next's own assets are served without running this.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|gif|svg|ico|mp4|webm|woff2?|txt|xml|json)$).*)'],
};
