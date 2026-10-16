import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/**/*.integration.test.ts'],
    fileParallelism: false,
    setupFiles: ['apps/api/src/test/integration-guard.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
