import { privyAppId } from '@/lib/auth';

/**
 * Trading UI is off unless NEXT_PUBLIC_SWAP_ENABLED=1 at build time (inlined by Next). Merging and
 * deploying the web app with the flag unset exposes no trade UI. Every trade surface (the /swap test
 * bed, the token-page trade box, trenches quick buy) must check this before rendering.
 */
export function isSwapEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SWAP_ENABLED === '1';
}

/**
 * NEXT_PUBLIC_TRADE_TOKENS: comma-separated token addresses trading is open for (a staged opening, e.g.
 * $OVHIVE only). Unset or empty: every token. Other tokens keep the "Trading opens soon" placeholder.
 */
const ALLOW = (process.env.NEXT_PUBLIC_TRADE_TOKENS ?? '')
  .split(',')
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

/** True when trading is limited to a list of tokens. */
export const tradeAllowlisted = (): boolean => ALLOW.length > 0;

/** Trading needs the flag AND sign-in (a Privy app id), and the token must be on the allowlist when there is one. */
export function tradingAvailable(token?: string | null): boolean {
  if (!isSwapEnabled() || privyAppId().length === 0) return false;
  if (ALLOW.length === 0) return true;
  return !!token && ALLOW.includes(token.toLowerCase());
}
