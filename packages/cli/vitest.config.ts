import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/test/**',
        'src/**/*.test.ts',
        'src/**/index.ts',
        'src/commands/deploy.ts',
        'src/commands/init.ts',
        'src/commands/onboard.ts',
        'src/commands/seed-create.ts',
        'src/commands/seed-load.ts',
        'src/commands/update.ts',
        'src/lib/wrangler.ts',
        'src/lib/schema-diff.ts',
      ],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
})

