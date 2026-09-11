import { defineConfig } from 'vitest/config';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/database/src/**/*.integration.test.ts'],
  },
});
