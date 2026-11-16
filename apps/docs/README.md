# Overmind docs

The docs site at [docs.overmind.ink](https://docs.overmind.ink): [Astro Starlight](https://starlight.astro.build), static, with Pagefind search and `llms.txt` / `llms-full.txt` for agents ([starlight-llms-txt](https://github.com/delucis/starlight-llms-txt)). Served by Cloudflare Workers as static assets (`wrangler.jsonc`, no worker script).

Pages are Markdown in `src/content/docs`. Write only what the code and the live API do today, and check claims against the repo. The agent API pages follow `packages/agents/llms.txt`, which stays the source of truth.

Requires Node 22.23.4 or later (Astro 7).

```bash
pnpm --filter @overmind/docs dev       # http://localhost:4321
pnpm --filter @overmind/docs build     # dist/, checks every internal link
pnpm --filter @overmind/docs preview   # serves dist/ with wrangler on :8791
pnpm --filter @overmind/docs deploy    # build + wrangler deploy (maintainers)
```

Brand: `src/styles/overmind.css` (light paper by default, the terminal palette in dark mode) and the overrides in `src/components`.
