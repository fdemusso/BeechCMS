### Pre-Computation Analysis
a) **God Nodes:** `ContentRepository`, `BeechHooks`, `Env` (API context variables).
b) **Architectural Boundaries:**
   - `apps/api/src/shared/db/repositories`: Implement `D1VectorRepository`.
   - `apps/api/src/features/search`: New `semantic-search.hooks.ts` to trigger on content mutation, `compile-manifest.worker.ts` for Queue handling, and `public-search.router.ts`.
   - `apps/api/src/index.ts`: Hook registration into `createBeechApp`.
c) **Impact Analysis:** 
   - Modifying `createBeechApp` to accept `hooks` is a safe injection.
   - Using `BeechHooks` natively isolates the `apps/api` feature from needing to alter the core `ContentRepository`.

### VETO Audit
- **Botanical Dialect:** The plan strictly respects `resolvePolicies` by utilizing the existing `extractIndexableText` utility created in Sprint 1, preventing confidential data leakage. 
- **Vertical Slice Architecture:** All vector logic (queues, routers, compilation) is fully contained inside `apps/api/src/features/search/`, ensuring zero cross-slice imports.
- **Cloudflare Purity:** The plan enforces edge-native execution utilizing Cloudflare Workers AI (`Env.AI`) and Cloudflare Queues (`Env.QUEUE`) rather than stateful background processes.
- **Status:** Approved. HANDOFF -> caveman_coder.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
With the internal schema and Botanical text extraction logic established in Sprint 1 (`beech_vectors`, `extractIndexableText`), the Edge Pipeline must be wired up to actually generate and store these embeddings. Without this asynchronous pipeline, no vectors are generated on content mutations. Furthermore, the compiled static binaries must be pushed to R2 so the future Client SDK (Sprint 3) can download them.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **Core Layer:** `packages/core/src/search/vector-extractor.ts` provides text extraction. `IVectorRepository` exists as an interface.
- **API Environment:** `apps/api/src/types.ts` provides `Env` with `QUEUE?: Queue`, but currently lacks `AI?: any` and `SEARCH_R2?: R2Bucket`.
- **API Factory:** `createBeechApp({ seeds: [], jobs })` inside `apps/api/src/index.ts` does not yet instantiate or pass `BeechHooks`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `apps/api/src/types.ts`: Update `Env` to include `AI?: any` and `SEARCH_R2?: R2Bucket`.
- `apps/api/src/shared/db/repositories/d1-vector.repository.ts`: Implementation of `IVectorRepository` using D1.
- `apps/api/src/features/search/semantic-search.hooks.ts`: Defines `afterCreate`, `afterUpdate`, `afterDelete` hooks to enqueue vector generation and R2 compilation jobs.
- `apps/api/src/features/search/semantic-search.worker.ts`: A Cloudflare Queue worker (`JobRegistry` entry) that calls Cloudflare Workers AI (`@cf/baai/bge-small-en-v1.5`), stores the result via `D1VectorRepository`, and compiles the per-Seed `.bin`/`.json` manifests to `SEARCH_R2`.
- `apps/api/src/features/search/public-search.router.ts`: Exposes `GET /api/v1/public/search/embed` with a Token Bucket rate limiter.
- `apps/api/src/index.ts`: Registers `semantic-search.hooks.ts` into `createBeechApp` and wires the new router.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
**1. Environment Bindings (`apps/api/src/types.ts`):**
Add `AI?: any` (for Workers AI) and `SEARCH_R2?: R2Bucket` to the `Env` interface.

**2. D1 Vector Repository (`apps/api/src/shared/db/repositories/d1-vector.repository.ts`):**
Implement `IVectorRepository` interface:
```typescript
import type { Seed } from '@beechcms/core'
import type { IVectorRepository } from '@beechcms/core/src/search/vector.repository'
import { vectorTableName } from '@beechcms/core/src/engine/ddl'

export class D1VectorRepository implements IVectorRepository {
  constructor(private readonly db: D1Database) {}

  async saveVector(seed: Seed, entryId: string, vector: Float32Array): Promise<void> {
    const table = vectorTableName(seed)
    const blob = new Uint8Array(vector.buffer)
    await this.db.prepare(`INSERT INTO ${table} (entry_id, vector) VALUES (?, ?) ON CONFLICT(entry_id) DO UPDATE SET vector = ?`)
      .bind(entryId, blob, blob)
      .run()
  }

  async deleteVector(seed: Seed, entryId: string): Promise<void> {
    const table = vectorTableName(seed)
    await this.db.prepare(`DELETE FROM ${table} WHERE entry_id = ?`).bind(entryId).run()
  }

  async getAllVectors(seed: Seed): Promise<{ entryId: string; vector: Float32Array }[]> {
    const table = vectorTableName(seed)
    const { results } = await this.db.prepare(`SELECT entry_id, vector FROM ${table}`).all<{ entry_id: string; vector: ArrayBuffer }>()
    return results.map(row => ({
      entryId: row.entry_id,
      vector: new Float32Array(row.vector)
    }))
  }
}
```

**3. Hook Registration (`apps/api/src/features/search/semantic-search.hooks.ts`):**
Export a `semanticSearchHooks` object implementing `BeechHooks`.
- On `afterCreate` / `afterUpdate`: if it's a publish mutation (e.g. status changes to published or public fields are updated), enqueue a `compute_vector` job.
- On `afterDelete`: call `deleteVector` and enqueue an `update_r2_manifest` job.

**4. App Injection (`apps/api/src/index.ts`):**
```typescript
import { semanticSearchHooks } from './features/search/semantic-search.hooks'

const app = createBeechApp({ 
  seeds: [], 
  jobs: { ... }, 
  hooks: semanticSearchHooks 
})
```

**5. Public Embedding Endpoint (`apps/api/src/features/search/public-search.router.ts`):**
Build a simple Hono router exposing `GET /embed`. Check rate limit (`PUBLIC_READ_RATE_LIMITER`), validate query string, call `c.env.AI.run('@cf/baai/bge-small-en-v1.5', { text: query })`, and return `Float32Array` response with `Edge-Control: s-maxage=604800` caching.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm run build` in `apps/api/`
- `pnpm beech test` in `apps/api/`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] Hooks trigger only on valid publish/unpublish/delete events.
- [ ] Cloudflare AI binding correctly returns vectors using `@cf/baai/bge-small-en-v1.5`.
- [ ] D1 repository correctly serializes `Float32Array` into SQLite BLOBs and deserializes them back.
- [ ] Rate limits are strictly enforced on `GET /api/v1/public/search/embed`.
- [ ] R2 Compilation worker writes a valid `.bin` (concatenated Float32Arrays) and `.json` (array of Entry IDs) strictly for public use.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Do NOT build the client-side UI or the `@beechcms/search-client` SDK.
- Do NOT run queries against the R2 index in the API layer. The API's job is purely to compile the index; the client will download and parse it.
