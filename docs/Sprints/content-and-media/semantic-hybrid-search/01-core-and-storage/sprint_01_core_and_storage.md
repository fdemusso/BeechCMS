### Pre-Computation Analysis
a) **God Nodes:** `ContentRepository`, `Seed`, `ISearchRepository`.
b) **Architectural Boundaries:**
   - `@beechcms/core`: A new utility module (`packages/core/src/search/vector-extractor.ts`) to extract and concatenate text strictly from `public` text fields via `resolvePolicies`. Updates to `packages/core/src/engine/ddl.ts` to manage the `vector_${seed.slug}` tables. New `IVectorRepository` interface.
   - `apps/api`: Unaffected in this sprint (deferred to Sprint 2).
   - `apps/dashboard`: Unaffected (Internal Search out of scope).
c) **Impact Analysis:** 
   - `ContentRepository` affects `hooks.ts`, `demo-data.repository.ts`, and `queue.interface.ts`. 
   - Modifying `packages/core/src/engine/ddl.ts` affects the DB schema generator, but adding a new optional vector table won't break existing content tables.

### VETO Audit
- **Botanical Dialect:** The plan introduces `vector-extractor.ts` in `@beechcms/core` to enforce privacy/classification limits directly at the Botanical Engine level, avoiding API-layer leakage. D1 logic is routed through standard DDL migrations.
- **Vertical Slice Architecture:** No cross-imports are introduced. Core interfaces are strictly defined for downstream API implementation.
- **Cloudflare Purity:** Uses SQLite BLOB (or standard columns) for the `vector_${seed.slug}` tables without heavy ORM extensions.
- **Status:** Approved. HANDOFF -> caveman_coder.


==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
The Zero-Cost Serverless Edge Vector Search feature fundamentally alters how published data is processed and stored. Before the Edge Pipeline (API layer) can compute embeddings or interact with Cloudflare Workers AI (Sprint 2), the Core layer must possess the determinism to safely extract text (adhering to privacy policies) and a D1 SQLite schema to persist these embeddings internally. This sprint enforces the Botanical Invariant by trapping text extraction rules inside `@beechcms/core` and establishing the required schema structures without introducing heavy API dependencies.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- **Domain Context:** `packages/core/src/engine/types.ts` defines `Seed` and `Branch`. Privacy resolution is handled by `resolvePolicies()` in `packages/core/src/engine/policies.ts`.
- **Database Schema:** `packages/core/src/engine/ddl.ts` dynamically generates SQLite tables for each Seed (e.g., `content_${slug}`, `fts_${slug}`). There is currently no schema representation for vector embeddings.
- **Search Context:** `packages/core/src/search/search.repository.ts` defines `ISearchRepository` focusing exclusively on FTS5 queries.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `packages/core/src/engine/ddl.ts`: Modification to generate and drop `vector_${seed.slug}` tables.
- `packages/core/src/search/vector-extractor.ts`: New utility containing `extractIndexableText(seed: Seed, entry: any)`.
- `packages/core/src/search/vector-extractor.test.ts`: Strict unit tests for the extractor enforcing privacy constraints.
- `packages/core/src/search/vector.repository.ts`: New `IVectorRepository` interface (pure contract, no D1 implementation yet).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
**1. Schema Generation (`packages/core/src/engine/ddl.ts`):**
Add functions to manage per-Seed vector tables (analogous to `ftsTableName`):
```typescript
export function vectorTableName(seed: Seed): string {
  return `vector_${seed.slug}`
}

export function generateVectorTable(seed: Seed): string | null {
  const rtBranches = indexableSearchBranches(seed)
  if (rtBranches.length === 0) return null
  const table = vectorTableName(seed)
  // SQLite doesn't have native vectors, so we store it as a serialized BLOB or TEXT (JSON array).
  // E.g., a Float32Array serialized to JSON TEXT or a raw BLOB.
  return [
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    `  entry_id TEXT NOT NULL PRIMARY KEY REFERENCES content_${seed.slug}(id) ON DELETE CASCADE,`,
    `  vector   BLOB NOT NULL`,
    `);`
  ].join('\\n')
}
```
Update `generateDropTable(seed: Seed)` to include `DROP TABLE IF EXISTS ${vectorTableName(seed)};`.

**2. Vector Extractor (`packages/core/src/search/vector-extractor.ts`):**
```typescript
import { Seed } from '../engine/types.js'
import { indexableSearchBranches } from '../engine/ddl.js'

export function extractIndexableText(seed: Seed, entry: Record<string, any>): string | null {
  const branches = indexableSearchBranches(seed)
  if (branches.length === 0) return null

  const texts: string[] = []
  for (const branch of branches) {
    const val = entry[branch.alias]
    if (val && typeof val === 'string') {
      texts.push(val)
    }
  }
  
  const combined = texts.join(' ').trim()
  return combined.length > 0 ? combined : null
}
```

**3. Vector Repository Contract (`packages/core/src/search/vector.repository.ts`):**
```typescript
import { Seed } from '../engine/types.js'

export interface IVectorRepository {
  /** Saves or updates the embedding vector for an entry */
  saveVector(seed: Seed, entryId: string, vector: Float32Array): Promise<void>;
  
  /** Removes the embedding vector (used when unpublished/deleted) */
  deleteVector(seed: Seed, entryId: string): Promise<void>;
  
  /** Retrieves all vectors for a given seed to compile to R2 */
  getAllVectors(seed: Seed): Promise<{ entryId: string, vector: Float32Array }[]>;
}
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm run build` in `packages/core/`
- `pnpm beech test` in `packages/core/`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `generateVectorTable` successfully creates `vector_${slug}` SQL schema strictly for Seeds that have indexable fields.
- [ ] `extractIndexableText` uses `indexableSearchBranches` to ensure internal/confidential fields are never concatenated.
- [ ] Zero dependencies are added to `@beechcms/core` `package.json` (no heavy ORMs or ML runtimes).
- [ ] `generateDropTable` removes the vector table.
- [ ] TypeScript build passes in `packages/core`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Do NOT implement Cloudflare Workers AI bindings. (See Roadmap Sprint 2).
- Do NOT implement the API `ContentRepository` event hooks or Queue bindings.
- Do NOT implement the R2 Compilation logic or `.bin` generation.
- Do NOT implement `D1VectorRepository` in the API layer.
- Do NOT create the `@beechcms/search-client` SDK.
