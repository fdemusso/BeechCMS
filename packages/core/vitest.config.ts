import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    silent: 'passed-only',
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/seeds.ts',
        '**/*.interface.ts',
        '**/*.repository.ts',
        '**/*.types.ts',
        'src/types.ts',
        '**/*.stub.ts',
        // External dependency wrappers or pure types
        'src/storage.ts',
        'src/clock.ts',
        'src/id-generator.ts',
        'src/define-seed.ts',
        'src/auth/hash-provider.ts',
        'src/auth/token-service.ts',
        'src/notifications/notification-service.ts',
        'src/observability/activity-logger.ts',
        'src/rate-limit/rate-limiter.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
})

