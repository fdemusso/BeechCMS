import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/features/**/*.test.ts'],
    /** Mostra console/stderr solo per test falliti; output pulito per test passati */
    silent: 'passed-only',
    /** Reporter verbose: nome di ogni test + ✓/✗ */
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
        // Hono route handlers that require a live D1/R2 environment
        'src/widget.ts',
        'src/features/settings/settings.handler.ts',
        'src/features/setup/**',
        'src/features/password-reset/request.ts',
        'src/features/password-reset/reset.ts',
        // External service integrations (Resend HTTP, S3 client)
        'src/features/email/providers/**',
        'src/features/email/email.provider.ts',
        'src/features/email/email.service.ts',
        'src/features/email/templates/**',
        'src/shared/storage-utils.ts',
        // Seed definitions non logiche
        'src/features/schema/schema.handler.ts'
      ],
      // Thresholds ricalibrati sul nuovo modello di test flow deterministici.
      // Poiché ora usiamo StaticContentRepository nei flow test, i repository D1 reali 
      // (es. content.repository.d1.ts) non sono coperti dal coverage in questo layer.
      thresholds: {
        statements: 45,
        branches: 55,
        functions: 60,
        lines: 45,
      },
    },
  },
})
