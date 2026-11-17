import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['.claude/**', '**/node_modules', '**/.next', '**/.open-next', '**/.wrangler', '**/dist', '**/*.d.ts', 'apps/web/public/token-map/**', 'packages/agents/examples/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] } },
);
