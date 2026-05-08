import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Flow tests in test/ + unit tests colocated in src/
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    /** Show console/stderr only for failing tests */
    silent: 'passed-only',
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        '**/*.d.ts',
        // Pure type definitions — no runtime statements to cover
        'src/types.ts',
        // Cloudflare Worker entry point — dynamic seed import, not unit-testable
        'src/index.ts',
        // FTS5 route handler — requires live D1 FTS5 tables
        'src/search.ts',
        // Empty compatibility shim — no runtime statements
        'src/shared/fts-sync.ts',
        // Test doubles and helpers used in test suites but not in production
        'src/shared/fixed-clock.ts',
        'src/shared/sequential-id-generator.ts',
        'src/shared/in-memory-activity-logger.ts',
        'src/shared/in-memory-notification-service.ts',
        // Hono route handlers that require a live D1/R2/email environment
        'src/widget.ts',
        'src/features/settings/settings.handler.ts',
        'src/features/setup/**',
        'src/features/password-reset/request.ts',
        'src/features/password-reset/reset.ts',
        'src/features/notifications/notifications.handler.ts',
        'src/features/stats/stats.handler.ts',
        'src/features/rotate-field/rotate-field.handler.ts',
        // External service integrations (Resend HTTP, S3 client, Cloudflare R2)
        'src/features/email/providers/**',
        'src/features/email/email.provider.ts',
        'src/features/email/email.service.ts',
        'src/features/email/templates/**',
        'src/shared/storage-utils.ts',
        'src/shared/storage/**',
        // Seed definitions
        'src/features/schema/schema.handler.ts',
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
