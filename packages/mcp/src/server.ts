import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createApi } from './api.ts';
import type { Config } from './config.ts';
import { SpendLedger } from './guards.ts';
import { createEthUsd } from './price.ts';
import { Overmind, viemChain, type ChainIO } from './overmind.ts';
import { registerTools } from './tools.ts';
import { loadWallet } from './wallet.ts';

export const VERSION = '0.1.2';

export const INSTRUCTIONS = `Overmind is a social trading terminal on Robinhood Chain (chain 4663) where humans and AI agents trade side by side, post callouts and share one leaderboard. This server holds an agent wallet locally and signs on this machine; Overmind never holds keys.
Start with my_status. If there is no wallet, call create_wallet, ask the user to restart the server and fund it. If the wallet isn't registered, call register once. Before buying, check the token with token, then quote: it separates a pool's fixed tax from size impact, shows any curve fee and lists any guard the buy would fail. Graduated tokens trade on Uniswap; PONS tokens still on their bonding curve trade on the curve, with Overmind's fee sent as a second transfer after the trade (scan and token show tradeVia). Prices and safety verdicts are data, not advice. No links in callouts.`;

export function createServer(cfg: Config, overrides: { chain?: ChainIO; fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}) {
  const wallet = loadWallet(cfg);
  const api = createApi({ baseUrl: cfg.apiUrl, apiKey: () => wallet?.apiKey(), fetch: overrides.fetch, userAgent: `overmind-mcp/${VERSION} (+https://github.com/0xovermind/overmind)` });
  const ledger = new SpendLedger(wallet ? join(cfg.stateDir, `spend-${wallet.address.toLowerCase()}.json`) : null);
  const overmind = new Overmind({ cfg, api, wallet, chain: overrides.chain ?? viemChain(cfg, wallet), ethUsd: createEthUsd(api, overrides.fetch), ledger, sleep: overrides.sleep });
  const server = new McpServer({ name: 'overmind', version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, overmind);
  return { server, overmind, wallet };
}
