// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineConfig } from 'vitest/config'

// Slice-local suites that cross an I/O boundary (real Mailpit + webhook-tester) and therefore
// belong to the Docker-bound flow tier, wherever they live on disk. Pinning them by path keeps
// the unit tier Docker-free without moving a file out of its owning slice (VSA) and without
// losing its coverage: the root-level coverage block below aggregates both projects.
const DOCKER_BOUND_SUITES = ['src/features/automations/executors/action-executors.test.ts']

const SHARED_EXCLUDE = ['**/node_modules/**', '**/dist/**']

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          pool: 'forks',
          include: ['src/**/*.test.ts'],
          // Integration tier is owned by vitest.workers.config.ts (real D1 via workerd).
          exclude: [...SHARED_EXCLUDE, 'src/features/**/test/integration/**', ...DOCKER_BOUND_SUITES],
          silent: 'passed-only',
          reporters: ['verbose'],
        },
      },
      {
        test: {
          name: 'flow',
          pool: 'forks',
          // test/ = cross-slice HTTP flow suites + Docker-backed suites (Sprint 2 layout).
          include: ['test/**/*.test.ts', ...DOCKER_BOUND_SUITES],
          exclude: [...SHARED_EXCLUDE],
          globalSetup: ['./test/docker-precheck.runner.ts', './test/global-setup.ts'],
          silent: 'passed-only',
          reporters: ['verbose'],
        },
      },
    ],
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
        'src/shared/storage/upload.ts',
        // FTS5 route handler — requires live D1 FTS5 tables
        'src/features/search/search.ts',
        // Empty compatibility shim — no runtime statements
        'src/shared/jobs/fts-sync.ts',
        // Demo data TS fixtures definition
        'src/shared/db/fixtures/demo-data.fixtures.ts',
        // Test doubles and helpers used in test suites but not in production
        'src/shared/services/id-generator/sequential-id-generator.ts',
        'src/shared/services/activity-log/in-memory-activity-logger.ts',
        'src/shared/services/notification/in-memory-notification-service.ts',
        // Hono route handlers that require a live D1/R2/email environment
        'src/features/widget/widget.ts',
        'src/features/settings/settings.handler.ts',
        'src/features/setup/**',
        'src/features/password-reset/request.ts',
        'src/features/password-reset/reset.ts',
        'src/features/notifications/notifications.handler.ts',
        'src/features/stats/stats.handler.ts',
        'src/features/rotate-field/rotate-field.handler.ts',
        // External service integrations (Resend HTTP, S3 client, Cloudflare R2)
        'src/shared/email/providers/**',
        'src/shared/email/email.provider.ts',
        'src/shared/email/email.service.ts',
        'src/shared/email/templates/**',
        'src/shared/utils/storage-utils.ts',
        'src/shared/storage/**',
        // Seed definitions
        'src/features/schema/schema.handler.ts',
        // Factory and middleware entry points — Cloudflare binding wrappers
        'src/factory.ts',
        // (removed) src/middleware.ts was deleted by the domain-driven refactor; no replacement.
        'src/middleware/repository.middleware.ts',
        // D1 repository for seed layouts — requires live D1
        'src/shared/db/repositories/seed-layout.repository.d1.ts',
        // Pure database schema mutators and demo data — requires live D1
        'src/shared/db/migrations/schema-mutator.d1.ts',
        'src/shared/db/repositories/demo-data.repository.d1.ts',
        // External orchestrators or empty wrappers
        'src/shared/services/scheduler/execution-context-scheduler.ts',
        'src/public/slug-utils.ts',
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
