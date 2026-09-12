import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['index.js'],
      reporter: ['text'],
      // The same bar AgentRQ itself holds. An extension runs with the
      // privileges of the process it is in; "mostly tested" is not a standard
      // that belongs anywhere near that.
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
