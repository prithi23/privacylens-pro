import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    maxWorkers: 2,
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    exclude: ['**/*.integration.test.ts', '**/node_modules/**'],
  },
});
