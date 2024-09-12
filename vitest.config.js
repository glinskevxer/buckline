import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        statements: 97,
        branches: 90,
        functions: 96,
        lines: 97,
      },
    },
  },
});
