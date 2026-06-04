// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./test/docker-precheck.runner.ts', './test/global-setup.ts'],
    // Flow tests in test/ + unit tests colocated in src/
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Disable parallel execution of test files to prevent interference on the shared Mailpit/D1 services
    fileParallelism: false,
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
        // R2 storage upload route handler
        'src/upload.ts',
        // FTS5 route handler — requires live D1 FTS5 tables
        'src/search.ts',
        // Empty compatibility shim — no runtime statements
        'src/shared/fts-sync.ts',
        // Demo data SQL script definition
        'src/shared/demo-data-sql.ts',
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
        // Factory and middleware entry points — Cloudflare binding wrappers
        'src/factory.ts',
        'src/middleware.ts',
        'src/middleware/repository.middleware.ts',
        // D1 repository for seed layouts — requires live D1
        'src/shared/seed-layout.repository.d1.ts',
        // Pure barrel export files
        'src/**/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
})
