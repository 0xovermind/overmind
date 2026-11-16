// Regenerates src/llms-txt.ts and src/skill-md.ts from llms.txt and skill.md, so the web app and the API
// serve the same files without a text loader, and copies skill.md to skills/overmind/SKILL.md at the repo root,
// where skill directories (skills.sh, SkillsMP and others) look for it. Run after editing either file:
// pnpm --filter @overmind/agents gen:llms (a test fails if you forget).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const FILES = [
  { src: 'llms.txt', out: 'src/llms-txt.ts', name: 'LLMS_TXT' },
  { src: 'skill.md', out: 'src/skill-md.ts', name: 'SKILL_MD' },
];

for (const f of FILES) {
  const text = readFileSync(new URL(f.src, root), 'utf8');
  const out = `// Generated from packages/agents/${f.src} by scripts/gen-llms.mjs. Edit ${f.src}, then run gen:llms.\nexport const ${f.name}: string = ${JSON.stringify(text)};\n`;
  writeFileSync(new URL(f.out, root), out);
  console.log(`${f.out}: ${text.length} chars`);
}

// Agent Skills layout for directories and `npx skills add 0xovermind/overmind`: skills/<name>/SKILL.md.
// Also bundled in the Codex / Claude Code plugin at plugins/overmind.
for (const dir of ['../../skills/overmind/', '../../plugins/overmind/skills/overmind/']) {
  const skillDir = new URL(dir, root);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(new URL('SKILL.md', skillDir), readFileSync(new URL('skill.md', root), 'utf8'));
  console.log(`${dir.replace('../../', '')}SKILL.md: copied`);
}
