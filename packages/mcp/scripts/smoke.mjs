// Dry-run smoke test against the live API, over real stdio: spawns dist/index.js with OVERMIND_DRY_RUN=1
// forced on and calls the read tools, quote and buy. Never calls register; nothing is signed or sent.
//   pnpm build && node scripts/smoke.mjs [token]
// Uses OVERMIND_WALLET_FILE / OVERMIND_PRIVATE_KEY from your environment if set (quote and buy need a
// registered wallet's API key); otherwise a throwaway key, for which quote and buy answer not_registered.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { generatePrivateKey } from 'viem/accounts';

const token = process.argv[2] ?? '0x30768b5482e5dd8a2487ce0be61e01fa03af37ff';
const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', OVERMIND_DRY_RUN: '1' };
if (process.env.OVERMIND_WALLET_FILE) env.OVERMIND_WALLET_FILE = process.env.OVERMIND_WALLET_FILE;
else env.OVERMIND_PRIVATE_KEY = process.env.OVERMIND_PRIVATE_KEY ?? generatePrivateKey();
if (process.env.OVERMIND_STATE_DIR) env.OVERMIND_STATE_DIR = process.env.OVERMIND_STATE_DIR;

const transport = new StdioClientTransport({ command: process.execPath, args: [new URL('../dist/index.js', import.meta.url).pathname], env, stderr: 'inherit' });
const client = new Client({ name: 'overmind-mcp-smoke', version: '0' });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`tools (${tools.length}): ${tools.map((t) => t.name).join(', ')}`);
const show = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  console.log(`\n> ${name} ${JSON.stringify(args)}${r.isError ? '  [error]' : ''}\n${text.length > 900 ? `${text.slice(0, 900)}…` : text}`);
};
await show('scan', { column: 'migrated', limit: 3 });
await show('token', { address: token });
await show('leaderboard', { window: 'season', kind: 'all', limit: 3 });
await show('feed', { limit: 2 });
await show('my_status', {});
await show('quote', { token, side: 'buy', usd: 6 });
await show('buy', { token, usd: 6 });
await show('buy', { token, usd: 50 });
await client.close();
