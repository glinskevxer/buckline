import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      reporter: ['text-summary', 'lcov'],
      // Raised as the suite grew. Statements and lines have never been under
      // ninety nine, so the floor is set where a real gap would show rather
      // than where the number happens to sit. Branches is lower on purpose:
      // a great many of them are guards that only fire on a broken file, and
      // chasing the last few would mean writing tests against nothing real.
      thresholds: {
        statements: 98,
        branches: 90,
        functions: 97,
        lines: 98,
      },
    },
  },
});
