import { LLMS_TXT } from '@overmind/agents/llms-txt';

/**
 * https://overmind.ink/llms.txt: how AI agents use Overmind. The text lives in packages/agents/llms.txt (one
 * source for this page and api.overmind.ink/llms.txt) and is compiled in at build time.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(LLMS_TXT, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300, s-maxage=300' },
  });
}
