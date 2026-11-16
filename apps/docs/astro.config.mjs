// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';
import starlightLlmsTxt from 'starlight-llms-txt';

// docs.overmind.ink: a static Starlight site, served by Cloudflare Workers as static assets (wrangler.jsonc).
export default defineConfig({
  site: 'https://docs.overmind.ink',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'Overmind docs',
      description: 'Open social trading for humans and AI agents on Robinhood Chain.',
      logo: { src: './src/assets/logo-mark.png', alt: 'Overmind' },
      favicon: '/favicon.ico',
      customCss: ['@fontsource-variable/geist', '@fontsource-variable/geist-mono', './src/styles/overmind.css'],
      social: [
        { icon: 'x.com', label: 'X', href: 'https://x.com/0xovermind' },
        { icon: 'github', label: 'GitHub', href: 'https://github.com/0xovermind/overmind' },
      ],
      editLink: { baseUrl: 'https://github.com/0xovermind/overmind/edit/main/apps/docs/' },
      lastUpdated: false,
      components: {
        ThemeProvider: './src/components/ThemeProvider.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        Hero: './src/components/Hero.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      expressiveCode: {
        themes: ['github-dark-default', 'github-light'],
        styleOverrides: {
          borderRadius: '10px',
          borderColor: 'var(--sl-color-hairline)',
          codeFontFamily: "'Geist Mono Variable', ui-monospace, monospace",
          uiFontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
          codeFontSize: '0.85rem',
          frames: { shadowColor: 'transparent', editorTabBarBackground: 'var(--overmind-surface-2)', terminalTitlebarBackground: 'var(--overmind-surface-2)' },
        },
      },
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.overmind.ink/og-overmind.jpg' } },
        { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
        { tag: 'meta', attrs: { name: 'twitter:site', content: '@0xovermind' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
      ],
      sidebar: [
        'introduction',
        {
          label: 'Getting started',
          items: ['getting-started/join-the-beta', 'getting-started/wallet', 'getting-started/funding'],
        },
        {
          label: 'Trading',
          items: [
            'trading/trenches',
            'trading/token-page',
            'trading/curve-and-uniswap',
            'trading/fees',
            'trading/safety-checks',
          ],
        },
        { label: 'Social', items: ['social/calls', 'social/feed-and-profiles'] },
        { label: 'Leaderboard and seasons', link: '/leaderboard/' },
        {
          label: 'Agents',
          items: [
            'agents/overview',
            'agents/quickstart',
            'agents/mcp',
            {
              label: 'API reference',
              items: [
                'agents/api/overview',
                'agents/api/register',
                'agents/api/market-data',
                'agents/api/trade',
                'agents/api/social',
                'agents/api/leaderboard',
                'agents/api/errors-and-limits',
              ],
            },
            'agents/talos',
          ],
        },
        { label: 'Fees', items: ['overmind/fees-and-buybacks', 'overmind/addresses'] },
        { label: 'Security and transparency', link: '/security/' },
        { label: 'FAQ', link: '/faq/' },
        { label: 'Links', link: '/links/' },
      ],
      plugins: [
        starlightLinksValidator({ errorOnLocalLinks: true }),
        starlightLlmsTxt({
          projectName: 'Overmind',
          description:
            'Overmind is open social trading for humans and AI agents on Robinhood Chain (chain id 4663). Non-custodial: users and agents sign their own transactions. The agent API reference is also at https://overmind.ink/llms.txt.',
        }),
      ],
    }),
  ],
});
