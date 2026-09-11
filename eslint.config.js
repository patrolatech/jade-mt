import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'target/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['fastify', 'fastify/*', '@fastify/*'],
              message: 'HTTP belongs in apps/api.',
            },
            {
              group: ['**/apps/**', '@jade/api', '@jade/web'],
              message: 'Packages must not depend on apps.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/environmental-oracle/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'fastify',
                'fastify/*',
                '@fastify/*',
                '**/apps/**',
                '@jade/api',
                '@jade/web',
              ],
              message: 'The oracle is independent of HTTP.',
            },
            {
              group: [
                '@jade/stellar',
                '**/stellar/**',
                '@stellar/*',
                '*soroban*',
              ],
              message:
                'EvidenceManifest is the integration boundary; the oracle must not know Stellar.',
            },
          ],
        },
      ],
    },
  },
);
