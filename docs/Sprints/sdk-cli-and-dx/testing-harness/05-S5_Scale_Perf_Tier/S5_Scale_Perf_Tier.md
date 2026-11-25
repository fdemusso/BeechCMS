# Sprint 5 — `scale-perf-tier`

Feature: Test Harness & Test Suite Redesign (issue #108). Roadmap entry: `stages/01_sprint_planning/output/backlog/ROADMAP.md` § Sprint 5.

---

### Pre-Computation Analysis

**a) God Nodes identified via the CLI**

| Node | Degree | Source | Why it matters here |
|---|---|---|---|
| `TestHarness` | 9 | `packages/testing/src/harness.ts:46` | The central environment provider for integration tests. Adding scale provisioning here directly would pollute the default fast integration tier, necessitating a separate scale seed generator and provisioner. |
| `provisionSeeds()` | 4 | `packages/testing/src/seeds/provision.ts:44` | The primary test D1 database preparation function. |
| `test-coverage-diff.mjs` | 31 | `scripts/test-coverage-diff.mjs:1` | Determines which tests run on push. Must be modified to guarantee `scale` is never implicitly selected. |

**b) Architectural boundaries affected**

- `@beechcms/core` — **untouched**.
- `@beechcms/testing` — Gains `scale.data.ts` and `scale.provision.ts`.
- `apps/api` — Gains `vitest.scale.config.ts`, `package.json` (`test:scale`), and the actual test in `src/features/content/test/scale/content-pagination.scale.test.ts`.
- `scripts/lib/test-tiers.mjs` & `packages/cli/src/commands/test.ts` — Modified to register the `scale` tier but explicitly exclude it from `--diff`.

**c) `graphify affected` impact analysis (breaking-change proof)**

```text
$ graphify affected "TestHarness" --depth 2
- content-management.integration.test.ts [imports] apps/api/src/features/content/test/integration/content-management.integration.test.ts:L14
- provision.ts [imports] packages/testing/src/seeds/provision.ts:L7
- testing/src/index.ts [re_exports] packages/testing/src/index.ts:L6
- seedCanonicalEntries() [calls] packages/testing/src/seeds/provision.ts:L97
```

We will not modify `TestHarness` itself or the default `createTestHarness` setup. Instead, we'll expose a standalone `seedScaleEntries` function.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

**1. RUTHLESS VETO / YAGNI.** We will not introduce a heavy ORM or faker library. We will generate the data deterministically using simple JavaScript math and `D1Database.batch()`.

**2. THE BOTANICAL INVARIANT.** When writing directly to D1 for scale (since HTTP `POST` for 2,000 rows would be too slow), we must strictly use the underlying Botanical schema (`br_01`, `br_02`, etc.) as defined in `CANONICAL_SEEDS`, never physical aliases (`title`, `body`).

**3. VSA ENFORCEMENT.** The scale tests will be placed precisely at `apps/api/src/features/content/test/scale/`. No cross-imports.

**4. CLOUDFLARE PURITY.** Execution remains native via `@cloudflare/vitest-pool-workers`.

VERDICT: APPROVED. HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint establishes an opt-in `scale` testing tier to validate pagination and query performance on datasets representative of actual targets (low-thousands of rows). Running 2,000+ row datasets inside the standard `integration` tier would cause unacceptable thermal and latency overhead, crippling CI and developer feedback loops. By sequestering this into a strict `--tier scale` that never runs on every push, we obtain high-confidence assertions on query performance without blocking routine development velocity.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- The `integration` tier runs against real D1 via `vitest.workers.config.ts`.
- Tier configurations live in `scripts/lib/test-tiers.mjs` and are mirrored in `packages/cli/src/commands/test.ts`.
- `apps/api/src/features/content/test/` only contains `unit` and `integration` directories.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `@beechcms/testing/src/seeds/scale.data.ts`: Deterministic generator.
- `@beechcms/testing/src/seeds/scale.provision.ts`: High-speed `db.batch()` provisioner.
- `apps/api/vitest.scale.config.ts`: Vitest configuration for the scale tier.
- `apps/api/package.json`: New `"test:scale"` script.
- `scripts/lib/test-tiers.mjs`: Registration of `scale` tier.
- `packages/cli/src/commands/test.ts`: CLI passthrough for `scale` tier.
- `apps/api/src/features/content/test/scale/content-pagination.scale.test.ts`: Scale assertion integration test.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### 1. `@beechcms/testing/src/seeds/scale.data.ts`
Create a deterministic data generator.
```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export interface ScaleEntry {
  id: string;
  slug: string;
  status: 'published' | 'draft';
  title: string;
  created_at: number;
  updated_at: number;
  published_at: number | null;
}

/**
 * Deterministically generates entries. No Math.random() allowed.
 */
export function generateScaleEntries(count: number): ScaleEntry[] {
  const entries: ScaleEntry[] = [];
  const baseTime = Date.UTC(2026, 0, 1) / 1000;

  for (let i = 0; i < count; i++) {
    const id = \`00000000-0000-4000-8000-\${i.toString(16).padStart(12, '0')}\`;
    entries.push({
      id,
      slug: \`scale-post-\${i}\`,
      status: 'published',
      title: \`Scale Post \${i}\`,
      created_at: baseTime + i,
      updated_at: baseTime + i,
      published_at: baseTime + i,
    });
  }
  return entries;
}
```

### 2. `@beechcms/testing/src/seeds/scale.provision.ts`
Implement a high-throughput D1 bulk insert respecting Botanical boundaries.
```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { generateScaleEntries } from './scale.data';

export async function seedScaleEntries(db: D1Database, count: number = 2000): Promise<void> {
  const entries = generateScaleEntries(count);
  const statements: D1PreparedStatement[] = [];

  // MUST respect Botanical Branch IDs ('br_01' for title).
  const stmt = db.prepare(
    \`INSERT INTO content_posts (id, status, slug, created_at, updated_at, published_at, br_01) VALUES (?, ?, ?, ?, ?, ?, ?)\`
  );

  for (const entry of entries) {
    statements.push(
      stmt.bind(entry.id, entry.status, entry.slug, entry.created_at, entry.updated_at, entry.published_at, entry.title)
    );
  }

  // Batch insert in chunks of 100 to avoid D1 limits
  for (let i = 0; i < statements.length; i += 100) {
    await db.batch(statements.slice(i, i + 100));
  }
}
```

### 3. Expose exports in `@beechcms/testing/src/index.ts`
Append to `packages/testing/src/index.ts`:
```ts
export { generateScaleEntries } from './seeds/scale.data'
export { seedScaleEntries } from './seeds/scale.provision'
```

### 4. `apps/api/vitest.scale.config.ts`
```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrations = await readD1Migrations(path.join(dirname, 'migrations'))

export default defineConfig({
  test: {
    name: 'scale',
    include: ['src/features/**/test/scale/**/*.scale.test.ts'],
    setupFiles: ['./test/harness/apply-migrations.ts'],
    reporters: ['verbose'],
    silent: 'passed-only',
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2026-02-13',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
})
```

### 5. `scripts/lib/test-tiers.mjs`
Update the constants:
```javascript
export const TIERS = ['unit', 'flow', 'integration', 'e2e', 'scale']
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration', 'e2e', 'scale']
// Leave DIFF_SELECTABLE_TIERS and DEFAULT_DIFF_TIERS as is.
export const NEVER_SELECTED_PREFIXES = ['e2e/']
```
Add `scale` to the `apps/api` workspace:
```javascript
    tiers: {
      unit:  { mode: 'related', project: 'unit', config: null, coverage: true },
      flow:  { mode: 'related', project: 'flow', config: null, coverage: true },
      integration: { mode: 'all', project: null, config: 'vitest.workers.config.ts', coverage: false },
      scale: { mode: 'all', project: null, config: 'vitest.scale.config.ts', coverage: false },
    },
```

### 6. `packages/cli/src/commands/test.ts`
```ts
export const RUNNABLE_TIERS = ['unit', 'flow', 'integration', 'e2e', 'scale'] as const
```
Update the diff check:
```ts
  if (args.diff && (tiers.includes('e2e') || tiers.includes('scale'))) {
    console.log(pc.red('  ✗ The e2e and scale tiers are never selected by --diff.'))
    process.exit(1)
    return
  }
```

### 7. `apps/api/package.json`
Add to `scripts`:
```json
"test:scale": "vitest run --config vitest.scale.config.ts",
```

### 8. `apps/api/src/features/content/test/scale/content-pagination.scale.test.ts`
```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, seedScaleEntries, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

describe('content slice — scale tier', () => {
  let harness: TestHarness
  let admin: TestClient

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    
    // Provision 2,000 items rapidly
    await seedScaleEntries(harness.db, 2000)
  })

  describe('GET /api/content/posts pagination performance', () => {
    it('returns the first page and completes within performance bounds (< 150ms)', async () => {
      const start = performance.now()
      const response = await admin.get('/api/content/posts?limit=50')
      const end = performance.now()

      expect(response.status).toBe(200)
      const body = await response.json<{ data: unknown[], meta: { next_cursor: string | null } }>()
      
      expect(body.data).toHaveLength(50)
      expect(body.meta.next_cursor).not.toBeNull()
      expect(end - start).toBeLessThan(150)
    })
  })
})
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm beech test --tier scale`
- `npx tsc --noEmit` in `packages/testing/`
- `npx tsc --noEmit` in `apps/api/`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] The `scale` tier runs exclusively when requested via `--tier scale`.
- [ ] Push/PR `--diff` runs automatically exclude the `scale` tier.
- [ ] Test file placement complies exactly with Vertical Slice Architecture (`features/content/test/scale/`).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Do not migrate any existing mocked tests to the scale tier.
- Do not modify `createTestHarness` to include scale seeds by default.
