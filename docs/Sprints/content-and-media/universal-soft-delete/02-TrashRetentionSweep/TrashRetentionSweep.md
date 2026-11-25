# Sprint: TrashRetentionSweep

Sprint 2 of 3 of **Universal Soft Delete & Trash Retention** (roadmap: `backlog/ROADMAP.md`).
Feature brief: `stages/00_ideation/output/feature_brief.md`. Sprint 1 (`UniversalSoftDelete`) has shipped. Its plan, execution log and review are archived in `docs/Sprints/UniversalSoftDelete/`.

Today nothing deletes anything on a timer. Retention is a per-seed `retentionDays` that must be `>= 1`, it has no global value, and `ContentRepository.findExpiredByRetention` has no caller. This sprint enforces retention:
- a global `trashRetentionDays` site setting, default **14**, validated on `PUT /api/settings`;
- a seed's `retentionDays` overrides the global value, and `0` (at either level) means "never purge";
- one core resolver turns seed + global into the effective retention;
- a bounded sweep in the existing `scheduled()` cron purges expired trashed entries through the sprint-1 ledger-first `purge`, with non-blocking R2 media cleanup;
- the trash list response carries the effective `retentionDays`, so sprint 3 can show a correct countdown.

The dashboard is not touched (sprint 3). See SECTION 7.

---

### Pre-Computation Analysis

Graph rebuilt at planning time with `graphify update . --force`: 27 823 nodes, 40 141 edges, 2 741 communities.

**a) God nodes on the path of this sprint (degree from `graphify explain`)**

| Node | Degree | Why it matters here |
|------|--------|---------------------|
| `createBeechApp()` (`apps/api/src/factory.ts:L123`) | 149 | Every route and middleware is wired here. **Not touched.** The trash list handler reads `siteSettingsRepository`, which is already on the context (`repository.middleware.ts`). No middleware is added or reordered. |
| `D1ContentRepository` (`apps/api/src/shared/db/repositories/content.repository.d1.ts:L127`) | ~58 (sprint-1 figure; the node name is ambiguous in the current graph) | Owns `purge` (ledger first, L1117) and `findExpiredByRetention` (L1209), whose signature changes. Constructed in `repository.middleware.ts:L130`, `index.ts:L104` (cron), `queue-consumer.ts:L26` and tests. |
| `D1SiteSettingsRepository` (`site-settings.repository.d1.ts:L31`) | 7 | Gains one key. Consumers: `repository.middleware.ts`, `import-chunk.worker.ts:L141` (precedent: a job reads settings outside a request), `index.ts`, and tests. |
| `ContentRepository` (`packages/core/src/content/content.repository.ts:L237`) | 6 | The core contract. Only `findExpiredByRetention` changes. |

**b) Architectural boundaries affected**

- `@beechcms/core`:
  - new `content/retention.ts`: constants, validator, resolver;
  - `content/content.repository.ts`: the `findExpiredByRetention` signature and JSDoc;
  - `settings/site-settings.repository.ts`: `SiteSettings.trashRetentionDays`;
  - `engine/seeds/seed-validation.ts`: Fatal 13 accepts `0`;
  - `engine/types.ts`: `Seed.retentionDays` JSDoc;
  - `index.ts`: re-export.
- `apps/api`:
  - slice `features/content`: `handlers/trash.ts` (trash list exposes the effective retention) and new `jobs/retention-sweep.ts`;
  - slice `features/settings`: `settings.handler.ts` GET/PUT;
  - shared repositories: `content.repository.d1.ts`, `site-settings.repository.d1.ts`;
  - composition root `index.ts` `scheduled()`;
  - test mock `test/mocks/static-content.repository.ts`.

  No slice imports another slice. The cron wiring lives in `index.ts`, which already imports `features/seeds/seed-media-purge` and `features/automations/engine/cron-runner`.
- `apps/dashboard`: **zero files.**

**c) `graphify affected` impact analysis**

```
affected "D1SiteSettingsRepository" --depth 2
  import-chunk.worker.ts [imports] L1, repository.middleware.ts [imports] L1, index.ts [imports_from],
  factory.ts / createBeechApp() L123, site-settings.repository.d1.test.ts,
  import-chunk.worker.test.ts, content-import.integration.test.ts, content-import.scale.test.ts,
  repository-privacy-middleware.test.ts
affected "trashListHandler" --depth 2
  features/content/index.ts [imports] L1, factory.ts [imports_from]
affected "SiteSettings" --depth 2
  No affected nodes found   (type-only usage is not an AST edge; Grep below fills the gap)
affected "findExpiredByRetention" → no unique code node (only the typedoc page matched)
path "runCronAutomations" "trashListHandler"
  runCronAutomations <-imports- index.ts -imports_from-> factory.ts -imports_from-> features/content/index.ts -imports-> trashListHandler
  (only through the composition root: no slice-to-slice edge)
path "trashListHandler" "D1SiteSettingsRepository"
  trashListHandler <- features/content/index.ts -> types.ts <- repository.middleware.ts -> D1SiteSettingsRepository
  (reached through the AppEnv context variable, not by import)
```

Grep fallback for the edges graphify missed:
- `SiteSettings` object literals that must gain the new required key: `apps/api/src/shared/localization/locale-config.test.ts:L17`, `apps/api/src/public/localization/public-language.test.ts:L103`, `apps/api/src/features/content/handlers/update.test.ts:L32`, `site-settings.repository.d1.ts:L8` (`DEFAULTS`). `settings.handler.test.ts:L17` mocks `getAll` with a partial object; update it only if a GET assertion compares the whole body.
- `findExpiredByRetention` callers: **none in production**. Implementations: `content.repository.d1.ts:L1209` and `apps/api/test/mocks/static-content.repository.ts:L279`. Test: `content.repository.d1.test.ts:L1022`.
- `retentionDays` readers outside core: `apps/dashboard/.../lib/retention.ts` and `ContentTrashView.tsx:L88`. Both read `seed.retentionDays` from the schema and are left unchanged (sprint 3).

Breaking-change conclusions:
1. The new `findExpiredByRetention` signature breaks only its two implementations and one unit test. All three are updated here.
2. Making `SiteSettings.trashRetentionDays` required breaks 3 test fixtures at type level. Each gets `trashRetentionDays: 14`. Making the key optional instead would push `?? 14` into every consumer, so it stays required.
3. Allowing `retentionDays: 0` widens validation. No existing seed holds `0`, because Fatal 13 rejected it. No stored definition changes meaning.
4. Changes in **behaviour**, not type:
   - Before: an expired trashed entry stayed until a human purged it.
   - After: it is purged within one sweep interval of expiry. With the 14-day default this covers every seed that declares no `retentionDays`.

   This is the brief's requirement. Docs that state "no scheduler" must change (Task 9).

---

### VETO Audit

| Check (`_config/ponytail_arch.md`) | Verdict |
|---|---|
| **YAGNI (rule 1)** | Pass. One setting key, one resolver, one validator, one sweep function, and one additive field on an existing response. Nothing else is added: no new route, no new migration (`site_settings` is key/value, `0000_v040_base.sql:L247`), no new ledger `reason`, no queue job, no per-seed cursor table, no new permission. The sweep reuses `purge`, `findExpiredByRetention`, `deleteR2Objects` and `extractMediaKeysFromData` unchanged. A fairness rotation across seeds was considered and rejected: the budget drains a backlog within hours, so starvation is bounded. |
| **Botanical invariant (rule 2)** | Pass. The sweep issues no SQL. It calls `ContentRepository.findExpiredByRetention` and `ContentRepository.purge`, and the table name comes from `getTableName(seed.slug)` inside the repository. `deleted_at` is a system column, not a branch alias. Media keys come from `extractMediaKeysFromData`, which walks `seed.branches`, so no field name is hardcoded. Retention resolution lives in core, so API (and dashboard in sprint 3) share one definition. |
| **VSA (rule 3)** | Pass. `features/content/jobs/retention-sweep.ts` imports only `@beechcms/core` and `shared/*` (`shared/storage/upload`, `shared/utils/media-utils`). `features/settings` and `features/content` each read settings through the `siteSettingsRepository` context variable or the shared `D1SiteSettingsRepository`. Neither imports the other. `index.ts` is the composition root and already imports two slice jobs. |
| **Cloudflare purity (rule 4)** | Pass. The sweep runs in the existing Workers Cron Trigger (`wrangler.jsonc:L93`, `* * * * *`). It is stateless: each run re-queries D1 and keeps no lease, no cursor and no job row. It is bounded by `RETENTION_SWEEP_MAX_PURGES` per invocation to stay within the subrequest budget. There is no schema change, so the migration workflow is not involved. |
| **Minimal blueprint (rule 5)** | Pass. Core contract (constants + resolver + signature), then API (setting, sweep, trash payload), then docs. The dashboard is deferred to sprint 3, as the roadmap states. |

No violation found. No plan adjustment needed.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 3 (instant delete + undo toast, settings field, Trash countdown) needs two server contracts that do not exist yet. It needs the global retention key on `GET/PUT /api/settings`, and it needs the effective retention per seed in the trash list. A countdown that does not match what the server actually purges would be worse than no countdown. Retention must therefore be resolved and enforced on the server first, from one core definition, before any UI shows it.

Sprint 1 made this sprint safe:
- `deleted_at` is stamped from `IClock` on every seed;
- `purge` defaults to trashed-only, so the sweep cannot erase a live row even if a bug handed it a live id;
- the ledger is written before the row is deleted.

The sweep is a thin loop over those primitives.

VSA: the sweep lives in the `content` slice, which owns the Trash and purge. The setting lives in the `settings` slice. They share data only through core types and shared repositories. Botanical Engine: no SQL outside the repository, and retention resolution is a pure core function.

Interim state: the feature branch `feature/universal-soft-delete` is not merged to `master` until sprint 3. Until then the dashboard countdown still reads `seed.retentionDays`, so it shows `—` for seeds that will be purged at the 14-day global default. Sprint 3 switches it to the payload field added here.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Retention today**
- `Seed.retentionDays?: number`, documented as "positive integer >= 1" (`packages/core/src/engine/types.ts:L274-278`). Seed-validation Fatal 13 rejects non-integers and values `<= 0` (`seed-validation.ts:L318-329`). Its test is at `seed-validation.test.ts:L546-563`.
- `ContentRepository.findExpiredByRetention(seed, now, limit)` (`content.repository.ts:L434-441`). D1 implementation at `content.repository.d1.ts:L1205-1222`:
  - it returns `[]` when `!seed.retentionDays`;
  - otherwise it runs `SELECT id … WHERE deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at ASC LIMIT ?` with `cutoff = now - days * 86400`;
  - both JSDocs say "deliberately NOT wired to any scheduler". There are no production callers.
- Static mock: `apps/api/test/mocks/static-content.repository.ts:L279-286`.

**Purge path (sprint 1, reused unchanged)**
- `D1ContentRepository.purge(seed, id, options?: PurgeOptions)` (`content.repository.d1.ts:L1117-1167`):
  - trashed-only by default;
  - runs `beforeDelete`, reads the row, appends the ledger event (`actorId: options?.actor?.id ?? null`, `reason: 'purge'`), deletes, then runs `afterDelete`;
  - it skips the ledger **only** when the repository was built without one (`if (this.deletionLedger)`, L1143).
- `DeletionLedgerEvent.actorId` is documented as "`null` for a system/reconciliation purge" (`packages/core/src/content/deletion-ledger.ts:L17-18`).
- R2 cleanup after a purge happens in the handler, not the repository: `delete.ts:L55-64`, `trash.ts:L140-148`. Both use `extractMediaKeysFromData(seed, row, cdnUrl)` and then `deleteR2Objects(ctx, keys).catch(warn)`.
- `deleteR2Objects` takes a structural `DeleteR2ObjectsContext` = `{ var: { bucket, mediaRepository, systemStatsRepository } }` (`apps/api/src/shared/storage/upload.ts:L10-20, L41`). It works outside Hono.
- HTTP wiring of the ledger: `repository.middleware.ts:L126-130` builds `new R2DeletionLedger(createBucketProvider(env, baseUrl))` and passes it as the 5th constructor argument of `D1ContentRepository` (signature at `content.repository.d1.ts:L130-137`: `database, hooks?, privacyService?, queue?, deletionLedger?, clock = SystemClock`).

**Cron entry point**: `apps/api/src/index.ts:L95-143` `scheduled()`. Order:
1. Builds `D1ContentRepository(env.DB)` (**no ledger**, L104) for automations.
2. Lists active seeds into a tolerant registry (L105-109, `registry.all()` exists on `ISeedRegistry`, `seed-registry.ts:L15`).
3. Builds `bucket = createBucketProvider(env, env.MEDIA_BASE_URL ?? '')` (L113). `NullBucket` is the fallback when no storage is configured (`factory.ts:L176`).
4. Fans out seed-media-purge steps with `ctx.waitUntil`, each wrapped in try/catch with a `[seed-purge]` log (L117-129).
5. Calls `ctx.waitUntil(runCronAutomations(...))` (L131-142).

The deps-object + explicit-time pattern to copy is `SeedMediaPurgeDependencies` / `runSeedMediaPurgeStep` (`features/seeds/seed-media-purge.ts:L19-28`).

**Settings**
- `SiteSettings` (`packages/core/src/settings/site-settings.repository.ts:L4-20`) and `ISiteSettingsRepository.getAll/setMany`.
- `D1SiteSettingsRepository` (`site-settings.repository.d1.ts`):
  - `DEFAULTS` L8;
  - `getAll` L34-52 reads `key → value` TEXT pairs, with `parseLocales` L21 as the "malformed reads as never configured" precedent;
  - `setMany` L54-67 binds `Array.isArray(v) ? JSON.stringify(v) : (v ?? '')`.
- `GET /api/settings` at `settings.handler.ts:L41-66`. `PUT /api/settings` at L72-159:
  - validation returns problem JSON `{ type, title, status, detail }` 400 before any write (L118-132);
  - `fieldsToUpdate` is built at L135-155.
- Permissions (`permission.middleware.ts`): `GET /api/settings` is `AUTHED` (L84). `PUT /api/settings` requires `perm('manage_users', 'global')` (L85). `GET /api/content/:slug/trash` requires `perm('content:read', 'capture1')` (L130). **No row changes.**

**Trash list**: `trashListHandler` (`features/content/handlers/trash.ts:L53-86`) returns `{ items, total, page, limit }`. `siteSettingsRepository` is available as `context.get('siteSettingsRepository')`, the same way `settings.handler.ts:L42` reads it.

**Test precedents**
- Cron with no HTTP surface, integration tier, where the act is the runner call: `features/automations/test/integration/cron-runner.integration.test.ts:L1-10, L59-70`.
- Real R2 binding for the ledger: `soft-delete.integration.test.ts:L72-77` (`env: { MEDIA_BUCKET }`) and L103-106 (`ledgerObject` reads `_deletion-ledger/<seed>/<id>.json`).
- `site_settings` must be cleared per test: `settings-locales.integration.test.ts:L44-46`.
- Settings matrix rejection test: `settings-locales.integration.test.ts:L73-85`.
- `FixedClock` via `harness.clock` (`packages/testing/src/harness.ts:L49, L61`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**Create**
- `packages/core/src/content/retention.ts`
- `packages/core/src/content/retention.test.ts`
- `apps/api/src/features/content/jobs/retention-sweep.ts`
- `apps/api/src/features/content/jobs/retention-sweep.test.ts`
- `apps/api/src/features/content/test/integration/trash-retention.integration.test.ts`
- `apps/api/src/features/settings/test/integration/settings-trash-retention.integration.test.ts`

**Edit**
- `packages/core/src/index.ts`: re-export `./content/retention.js`.
- `packages/core/src/content/content.repository.ts`: `findExpiredByRetention` signature + JSDoc.
- `packages/core/src/settings/site-settings.repository.ts`: `trashRetentionDays`.
- `packages/core/src/engine/seeds/seed-validation.ts` and `seed-validation.test.ts`: Fatal 13.
- `packages/core/src/engine/types.ts`: `Seed.retentionDays` JSDoc.
- `apps/api/src/shared/db/repositories/content.repository.d1.ts` and `content.repository.d1.test.ts`.
- `apps/api/src/shared/db/repositories/site-settings.repository.d1.ts` and `site-settings.repository.d1.test.ts`.
- `apps/api/test/mocks/static-content.repository.ts`.
- `apps/api/src/features/settings/settings.handler.ts`.
- `apps/api/src/features/content/handlers/trash.ts`.
- `apps/api/src/index.ts`: `scheduled()`.
- Type-only fixture updates: `apps/api/src/shared/localization/locale-config.test.ts`, `apps/api/src/public/localization/public-language.test.ts`, `apps/api/src/features/content/handlers/update.test.ts` (+ `settings.handler.test.ts` only if a whole-body assertion breaks).
- Docs: `docs/features/trash.md`, `docs/build/schema-modeling.md`, `docs/build/schema-manifest.md`.

**Excluded:** every file under `apps/dashboard`, `factory.ts`, `permission.middleware.ts`, migrations, and `packages/cli`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Core retention building blocks (`packages/core/src/content/retention.ts`)

Approach: one pure module next to `slug-utils.ts` (same MIT header, same style). The API settings handler, seed validation, the D1 settings repository and the sweep all need the same three facts. Putting them in core keeps a single definition, and sprint 3's dashboard imports it too.

Verbatim building blocks:

```ts
/** Global Trash retention when the setting was never configured (feature brief §2). */
export const DEFAULT_TRASH_RETENTION_DAYS = 14

/** Upper bound for any retention value: ~100 years. Keeps `days * 86400` far inside safe-integer range. */
export const MAX_RETENTION_DAYS = 36500

/** True for an integer in [0, MAX_RETENTION_DAYS]. `0` means "never purge". Rejects NaN, floats, strings, null. */
export function isValidRetentionDays(value: unknown): value is number

/**
 * Effective retention for one seed: the seed's own `retentionDays` when it is a number (including 0),
 * otherwise `globalRetentionDays`. `0` = never purge. Pure; never throws.
 */
export function resolveRetentionDays(seed: Pick<Seed, 'retentionDays'>, globalRetentionDays: number): number
```

Rules:
- `resolveRetentionDays` treats `undefined` **and** `null` as "absent". Canonical JSON can carry `null` (`schema/canonical.test.ts:L68`). It does not re-validate. Callers hand it already-validated values.
- Import `Seed` as a type from `../engine/types.js`.
- Re-export from `packages/core/src/index.ts` next to `./content/slug-utils.js` (L23).

### Task 2 — Seed validation and type docs

- `seed-validation.ts:L318-329` (Fatal 13): replace the inline predicate with `seed.retentionDays !== undefined && !isValidRetentionDays(seed.retentionDays)`. New message: ``retentionDays must be an integer between 0 and ${MAX_RETENTION_DAYS} (0 = never purge; got ${seed.retentionDays}).`` Keep the fatal flag and the section comment number.
- `types.ts:L274-278`: rewrite the JSDoc. The value is the days a **trashed** entry is kept before the retention sweep purges it. It overrides the global `trashRetentionDays` site setting. `0` means never purge. Absent means use the global value. Integer `0..36500`.

### Task 3 — `ContentRepository.findExpiredByRetention` takes the effective value

Approach: the caller resolves retention, and the repository only queries. The repository must not read site settings: that would couple the content repository to the settings store, and the call would become impure.

Verbatim signature (`content.repository.ts:L434-441`):

```ts
/**
 * Pure query, no side effects: ids of trashed entries whose retention window has elapsed
 * (`deleted_at + retentionDays * 86400 <= now`), oldest deletion first, at most `limit`.
 * `retentionDays` is the EFFECTIVE value (`resolveRetentionDays`); `0` = never purge → [] without querying.
 * `now` is unix seconds supplied by the caller's `IClock`; never read the clock here.
 */
findExpiredByRetention(seed: Seed, retentionDays: number, now: number, limit: number): Promise<string[]>
```

- D1 (`content.repository.d1.ts:L1205-1222`): replace `seed.retentionDays` with the parameter. Return `[]` with no `prepare` call when `retentionDays <= 0` or `limit <= 0`. The SQL text, the bind order `(cutoff, limit)` and `ORDER BY deleted_at ASC` stay unchanged. Update the JSDoc: it is now called by the retention sweep, so drop "NOT wired".
- Static mock (`static-content.repository.ts:L279-286`): same signature and the same `<= 0` guard.

### Task 4 — `SiteSettings.trashRetentionDays`

- Core `SiteSettings` (`site-settings.repository.ts:L4-20`): add

  ```ts
  /** Global Trash retention in days; a seed's `retentionDays` overrides it. `0` = never purge. Default 14. */
  trashRetentionDays: number
  ```

- `D1SiteSettingsRepository`:
  - `DEFAULTS.trashRetentionDays = DEFAULT_TRASH_RETENTION_DAYS` (import from `@beechcms/core`).
  - In `getAll`, an absent key reads as the default. A present key is parsed with `Number(raw)`. If the parsed value passes `isValidRetentionDays` it is returned. Otherwise the default is returned, following the `parseLocales` precedent: malformed reads as never configured. Do **not** use the `map.get(k) || DEFAULT` idiom: the stored string `'0'` is a meaningful value.
  - `setMany`: widen the entries cast to include `number` and bind numbers as `String(value)`. Arrays and strings keep today's behaviour.
- Add `trashRetentionDays: 14` to the 3 `SiteSettings` test fixtures listed in Pre-Computation (c).

### Task 5 — `GET/PUT /api/settings` (`features/settings/settings.handler.ts`)

- GET (L44-65): add the top-level `trashRetentionDays: s.trashRetentionDays`, next to `currency`.
- PUT:
  - Validate when `payload.trashRetentionDays !== undefined`. If `!isValidRetentionDays(payload.trashRetentionDays)`, return 400 **before** any write, in the existing problem shape: `{ type: 'settings-invalid-trash-retention', title: 'Bad Request', status: 400, detail: \`trashRetentionDays must be an integer between 0 and ${MAX_RETENTION_DAYS} (0 = never purge)\` }`. `null` is rejected too: there is no "reset to default" value (brief §5: no special values other than `0`).
  - On success, set `fieldsToUpdate.trashRetentionDays`.
  - Place the check after the locale checks (L112-133) and before `fieldsToUpdate` (L135).
- Error code (new, contract): `settings-invalid-trash-retention`, HTTP 400.
- Permissions unchanged: PUT stays `manage_users` global (`permission.middleware.ts:L85`), which matches the existing "General settings" gate.

### Task 6 — Trash list exposes the effective retention (`features/content/handlers/trash.ts`)

- In `trashListHandler` (L53-86), inside the existing `try`, read `context.get('siteSettingsRepository').getAll()` and compute `resolveRetentionDays(seed, settings.trashRetentionDays)`.
- The response becomes:

  ```ts
  { items, total, page, limit, retentionDays: number }   // effective value for this seed; 0 = never purge
  ```

- The field is additive. The dashboard's `TrashListResponse` (`apps/dashboard/.../api/trash.api.ts:L13`) is **not** edited here (sprint 3).
- A settings read failure falls into the existing `catch` → `handleContentDatabaseError`. Never substitute the default on failure: a wrong countdown is a lie to the user.

### Task 7 — Retention sweep (`features/content/jobs/retention-sweep.ts`)

Approach: a deps-object function with explicit time, shaped like `runSeedMediaPurgeStep` (`features/seeds/seed-media-purge.ts:L19-28`). It is called from `scheduled()` every `RETENTION_SWEEP_INTERVAL_MINUTES`. It is stateless and bounded: each run re-queries D1, so a crash, a timeout or a skipped tick loses nothing.

Verbatim building blocks:

```ts
import type { ContentRepository, ISiteSettingsRepository, Seed } from '@beechcms/core'
import type { DeleteR2ObjectsContext } from '../../../shared/storage/upload'

/** Sweep cadence on the every-minute cron (wrangler.jsonc). Retention is day-granular; 5 min is plenty. */
export const RETENTION_SWEEP_INTERVAL_MINUTES = 5

/** Purge ATTEMPTS per run, across all seeds. Each purge costs ~3 subrequests + ~4 per media key;
 *  25 keeps one invocation well inside the Workers subrequest budget and drains ~7 200 entries/day. */
export const RETENTION_SWEEP_MAX_PURGES = 25

export interface RetentionSweepDependencies {
  /** MUST be built with a deletion ledger: the sweep relies on purge's ledger-first write. */
  repository: ContentRepository
  siteSettingsRepository: ISiteSettingsRepository
  /** Active, non-quarantined seeds, in the order they are swept. */
  seeds: Seed[]
  /** Same structural context `deleteR2Objects` takes in the HTTP handlers. */
  media: DeleteR2ObjectsContext
  cdnUrl?: string
}

export interface RetentionSweepResult {
  purged: Array<{ seedSlug: string; id: string }>
  /** `id: null` = the seed's expiry query itself failed. */
  failed: Array<{ seedSlug: string; id: string | null; reason: string }>
}

/** True when the cron tick at `scheduledTimeMs` (UTC) falls on a sweep minute. */
export function isRetentionSweepTick(scheduledTimeMs: number): boolean

export async function runRetentionSweep(
  deps: RetentionSweepDependencies,
  nowSeconds: number,
): Promise<RetentionSweepResult>
```

Behaviour of `runRetentionSweep`:
1. Read `siteSettingsRepository.getAll()` **once**. If it rejects, the rejection propagates and nothing is purged. Never fall back to `DEFAULT_TRASH_RETENTION_DAYS` on a failed read: an admin who chose `0` (never) would lose data because of a transient D1 error.
2. Seeds are processed in the given order with a shared budget `remaining = RETENTION_SWEEP_MAX_PURGES`. Stop as soon as `remaining === 0`.
3. Per seed:
   - Compute `days = resolveRetentionDays(seed, settings.trashRetentionDays)`. If `days === 0`, skip the seed with **no** repository call.
   - Call `findExpiredByRetention(seed, days, nowSeconds, remaining)`. If it throws, push `{ seedSlug, id: null, reason }` and continue with the next seed.
4. Per id (oldest deletion first, as the query returns them):
   - Decrement `remaining`, then call `repository.purge(seed, id)` with **no options**. That means no actor (ledger `actorId: null` = system purge) and the trashed-only default.
   - `EntryNotFoundError` means the entry was restored or purged by a user between the query and the purge. It is neither purged nor failed: skip it silently.
   - Any other error goes to `failed` with `reason = error.message`, and the loop continues.
   - On success, push to `purged`. Then extract media keys with `extractMediaKeysFromData(seed, result.row, deps.cdnUrl)`. If there are any, `await deleteR2Objects(deps.media, keys)` and `.catch` → `console.warn('[retention-sweep] R2 cleanup failed (orphaned files)', …)`. This is non-blocking: the id stays in `purged` (brief §4: orphan files are possible).
5. The sweep **does not**:
   - write the activity log (there is no actor);
   - dispatch the `delete` automation (it already fired at soft delete, `delete.ts:L52`);
   - run lifecycle hooks (the sweep repository is built without hooks: `afterDelete` already ran at soft delete, so the search vector is gone, and the cron has no queue-backed hook context).
6. Log one summary line, `[retention-sweep] purged N, failed M`, only when `N + M > 0`. Log each failure with seed, id and reason.
7. Return the result. Same inputs and the same D1 state give the same result.

`isRetentionSweepTick`: `new Date(scheduledTimeMs).getUTCMinutes() % RETENTION_SWEEP_INTERVAL_MINUTES === 0`.

### Task 8 — Cron wiring (`apps/api/src/index.ts` `scheduled()`)

After the seed-media-purge loop (L117-129) and before `runCronAutomations` (L131):
- If `isRetentionSweepTick(scheduledTime)`, call `ctx.waitUntil(async IIFE)` that:
  - builds `new D1ContentRepository(env.DB, undefined, undefined, undefined, new R2DeletionLedger(bucket), SystemClock)`. Reuse the `bucket` built at L113, the same provider the HTTP ledger uses (`repository.middleware.ts:L127`), so both paths write to one ledger;
  - builds `new D1SiteSettingsRepository(env.DB)`;
  - passes `seeds: registry.all()`;
  - passes `media: { var: { bucket, mediaRepository: new D1MediaRepository(env.DB), systemStatsRepository: new D1SystemStatsRepository(env.DB) } }`;
  - passes `cdnUrl: env.MEDIA_CDN_URL`;
  - passes `nowSeconds = Math.floor(scheduledTime / 1000)`;
  - wraps everything in try/catch → `console.error('[retention-sweep] run failed; next sweep tick retries', error)`. This mirrors L118-128.
- Do **not** reuse the ledger-less `contentRepository` at L104. Without a ledger, `purge` would erase with nothing recorded, which violates brief §4.
- With no storage configured (`NullBucket`), the ledger `append` throws, so every purge fails per id and the rows stay trashed. This is the intended fail-closed behaviour and needs no special case.
- Imports go through the existing repository modules (`./shared/db/repositories/media.repository.d1`, `./shared/db/repositories/system-stats.repository.d1`, `./shared/db/repositories/site-settings.repository.d1`, `./shared/storage/deletion-ledger`, `./features/content/jobs/retention-sweep`). Check the class names against `repository.middleware.ts:L132-133`.

### Task 9 — Documentation

- `docs/features/trash.md`:
  - L22: replace the bullet "Retention as an interface, not a job" with: retention is enforced by a sweep; default 14 days; seed override; `0` = never.
  - L38: example comment.
  - Rewrite the **Retention Windows** section (L149-157):
    - global setting `trashRetentionDays` on `GET/PUT /api/settings` (`manage_users` global; error `settings-invalid-trash-retention`);
    - seed `retentionDays` precedence and `0`;
    - the sweep: every 5 minutes on the cron, at most 25 purges per run, oldest first, ledger first, `actorId: null`, R2 cleanup non-blocking, no hooks / automations / activity log;
    - a failed settings read purges nothing;
    - the trash list's `retentionDays` field.
  - Delete the "No scheduler is wired up" note.
- `docs/build/schema-modeling.md:L59` and `docs/build/schema-manifest.md:L99`: `retentionDays` is an integer `0..36500`, overrides the global setting, `0` = never purge, and enforced by the sweep.
- Do not hand-edit `docs/api/**`. Regenerate it with `pnpm docs:generate` if the executor runs it; otherwise it is left stale for the release pipeline.

### Task 10 — Tests

All files open with the SPDX header. Single quotes (`apps/api`, `packages/*`). No fake timers: time is `FixedClock` / explicit `nowSeconds`.

**`packages/core/src/content/retention.test.ts`** — unit. Fixtures are inline literals (pure function, deliberately-shaped input).
- `describe('isValidRetentionDays')`: matrix — accepts `0`, `1`, `14`, `36500`; rejects `-1`, `1.5`, `NaN`, `Infinity`, `36501`, `'14'`, `null`, `undefined`.
- `describe('resolveRetentionDays')`:
  - a seed with no `retentionDays` gets the global value;
  - a seed's `retentionDays: 30` wins over global `14`;
  - a seed's `retentionDays: 0` stays `0` even when global is `14` (never purge is an override, not "absent");
  - `retentionDays: null` reads as absent and yields the global value;
  - global `0` with no seed override yields `0`.

**`packages/core/src/engine/seeds/seed-validation.test.ts`** — unit, edit L546-563.
- `fatal: rejects non-integer, negative or out-of-range retentionDays`: matrix `-1, 1.5, NaN, 36501`. Each is fatal, and the message contains `retentionDays must be an integer between 0 and`.
- `accepts retentionDays 0 (never purge) and 30`: no fatal for either.

**`apps/api/src/shared/db/repositories/content.repository.d1.test.ts`** — unit, edit the `findExpiredByRetention` describe (L1022). The existing `makeMockDb` boundary is the fixture.
- `returns an empty list without querying when the effective retention is 0`.
- `binds now - days*86400 as the cutoff and the limit, oldest deletion first`: asserts the bound args `(2_000_000 - 14*86400, 10)` and that the SQL contains `ORDER BY deleted_at ASC`.

**`apps/api/src/shared/db/repositories/site-settings.repository.d1.test.ts`** — unit, extend the existing describes.
- `getAll`:
  - `returns trashRetentionDays 14 when the key was never stored`;
  - `reads a stored '0' as 0, not as the default`;
  - `reads a malformed stored value as the default`: stored `'abc'` → `14`.
- `setMany`: `stores a numeric trashRetentionDays as its decimal string` (bound value `'30'`).

**`apps/api/src/features/content/jobs/retention-sweep.test.ts`** — unit, next to the source. The repository, the settings repository and the media context are `vi.fn()` boundary objects (Rule 3.10). Seeds are `defineSeed` literals with a `file` branch where media matters. `EntryNotFoundError` comes from `@beechcms/core`.
- `isRetentionSweepTick is true at minutes 0 and 5 and false at minute 3` (matrix, UTC ms literals).
- `a seed with no retentionDays is queried with the global retention from settings`.
- `a seed with retentionDays 0 is skipped without any repository call`.
- `global retention 0 skips every seed without an override and still sweeps a seed with retentionDays 30`.
- `purges each expired id with no actor and no trashed override`: asserts `purge` called with `(seed, id)` and no third argument.
- `a failing purge is reported in failed and the next id is still purged`.
- `an expiry query that throws is reported with id null and the next seed is still swept`.
- `an id restored between query and purge (EntryNotFoundError) is neither purged nor failed`.
- `stops after RETENTION_SWEEP_MAX_PURGES attempts, passing the remaining budget as the next seed's limit`: first seed returns 20 ids, so the second seed is queried with limit `5`, and a third seed is not queried.
- `hands the purged row's media keys to the R2 cleanup`: the `media.var.bucket.delete` mock receives the key extracted from the row's file value.
- `an R2 cleanup failure leaves the id in purged`.
- `a settings read failure rejects and purges nothing`.

**`apps/api/src/features/content/test/integration/trash-retention.integration.test.ts`** — integration (real D1, real R2 via `env.MEDIA_BUCKET`, only `FixedClock` faked). The docblock states that the cron has no HTTP surface, so the act for the sweep cases is the `runRetentionSweep` call (precedent: `cron-runner.integration.test.ts:L1-10`). It also states that media deletion is covered in the unit file because uploads need the forks tier.
- Harness setup:
  - `env: { MEDIA_BUCKET }` as in `soft-delete.integration.test.ts:L72-77`;
  - three `defineSeed` seeds: `ret_default` (no `retentionDays`), `ret_override` (`retentionDays: 30`) and `ret_never` (`retentionDays: 0`). The harness does not run `validateSeeds`; Fatal 13 is covered in `seed-validation.test.ts`;
  - `DELETE FROM site_settings` in `beforeEach` (comment the reason, as at `settings-locales.integration.test.ts:L44-46`).
- Entries are created and trashed through `POST` / `DELETE /api/content/:slug/...` in ARRANGE.
- Local helper `runSweep(atSeconds)`:
  - builds `D1ContentRepository(env.DB, undefined, undefined, undefined, new R2DeletionLedger(new R2BucketAdapter(MEDIA_BUCKET, '')), harness.clock)`, `D1SiteSettingsRepository(env.DB)` and the real media/system-stats repositories;
  - calls `runRetentionSweep`.
- Local helper `ledgerEvent(seed, id)` reads and parses `_deletion-ledger/<seed>/<id>.json`.
- Time is passed as `harness.clock.nowSeconds() + N * 86400`. **Do not** `advance` the harness clock: the fake tokens would expire.
- `describe('GET /api/content/:slug/trash')`:
  - `exposes retentionDays 14 for a seed with no override when retention was never configured`;
  - `exposes the global value set through PUT /api/settings`: PUT `trashRetentionDays: 7` → `7`;
  - `exposes the seed's own retentionDays over the global value`: `ret_override` → `30`, and `ret_never` → `0`.
- `describe('runRetentionSweep')`:
  - `purges an entry trashed 15 days ago on a seed with no override, writing the ledger with actorId null first`:
    - result `purged` has the id;
    - `SELECT COUNT(*)` for the id is `0`;
    - the ledger event has `actorId: null` and `reason: 'purge'`.
  - `keeps an entry trashed 13 days ago`: the row is still there with `deleted_at` set; the ledger object is `null`.
  - `never purges on a seed with retentionDays 0, even 1000 days later`.
  - `uses the seed override: kept at day 20, purged at day 31` (two `it()`s, one act each).
  - `global 0 set through PUT /api/settings keeps every non-overridden entry`: `ret_default` is kept at day 400 (one act).
  - `never touches a live entry whose created_at is older than the window`: a live row on `ret_default`, sweep at day 400, row still live.

**`apps/api/src/features/settings/test/integration/settings-trash-retention.integration.test.ts`** — integration. Same harness setup as `settings-locales.integration.test.ts:L35-47`.
- `describe('GET /api/settings')`: `exposes trashRetentionDays 14 when it was never configured`.
- `describe('PUT /api/settings')`:
  - `persists trashRetentionDays 30`: GET returns `30` and the `site_settings` row value is `'30'`;
  - `persists 0 (never purge) and reads it back as 0`;
  - `refuses malformed trashRetentionDays with 400 settings-invalid-trash-retention and stores nothing`: matrix `-1, 1.5, '14', null, 36501`. Per case, status 400 and `type`, and `COUNT(*) WHERE key = 'trashRetentionDays'` stays `0` (Rule 5.6).

**Not tested here (comment where relevant):** ledger-write failure leaving the row intact. That is `purge` behaviour from sprint 1, unchanged and covered by the existing `content.repository.d1.test.ts` purge cases. `index.ts` wiring has no unit seam; the integration file exercises the exact deps shape it builds.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core test
npx tsc --noEmit                                  # in apps/api — error set must equal the 69-error baseline (test files only, see docs/Sprints/UniversalSoftDelete/review_report.md)
pnpm --filter ./apps/api test                     # unit + flow, then workers integration tier
npx tsc --noEmit                                  # in apps/dashboard — must stay at 0 (no dashboard edits; guards core type changes)
pnpm --filter ./apps/dashboard test
pnpm lint
pnpm beech test --diff                            # changed-line coverage gate
node scripts/check-test-placement.mjs
node scripts/docs-fact-check.mjs
rg -n "No scheduler is wired|NOT wired to any scheduler|positive integer >= 1" packages/core/src apps/api/src docs --glob '!docs/Sprints/**' --glob '!docs/api/**'   # must print nothing
graphify update . --force
```

No `pnpm beech db:migrate` / `db:reset` step: the sprint adds no migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `DEFAULT_TRASH_RETENTION_DAYS = 14`, `MAX_RETENTION_DAYS = 36500`, `isValidRetentionDays` and `resolveRetentionDays` are exported from `@beechcms/core`. The module is pure and imports only core types.
- [ ] Seed validation accepts `retentionDays: 0` and rejects negative, non-integer and `> 36500` values.
- [ ] `ContentRepository.findExpiredByRetention(seed, retentionDays, now, limit)` is the only signature. Effective `0` returns `[]` without a query. Both implementations match.
- [ ] `SiteSettings.trashRetentionDays` is required. D1 reads an absent key as 14, a stored `'0'` as 0 and a malformed value as 14.
- [ ] `GET /api/settings` returns `trashRetentionDays`. `PUT /api/settings` persists valid values and answers 400 `settings-invalid-trash-retention` with nothing stored for invalid ones, including `null`.
- [ ] `GET /api/content/:slug/trash` returns `retentionDays` = the effective retention for that seed.
- [ ] `runRetentionSweep`:
  - purges only trashed entries past their effective retention, oldest first;
  - attempts at most 25 per run;
  - skips effective-`0` seeds without querying;
  - isolates failures per seed and per id;
  - treats `EntryNotFoundError` as a no-op.
- [ ] Every sweep purge goes through `ContentRepository.purge` on a repository built **with** `R2DeletionLedger`, and the ledger event carries `actorId: null`.
- [ ] R2 media of a swept entry is deleted through `deleteR2Objects`. A cleanup failure never marks the id failed.
- [ ] A failed settings read purges nothing (no fallback to the default).
- [ ] `scheduled()` runs the sweep only on ticks where `getUTCMinutes() % 5 === 0`, inside `ctx.waitUntil` with its own try/catch. Seed-media-purge and cron automations are unaffected.
- [ ] Hand-written docs describe the sweep, the global setting, the seed override and `0`. No doc or JSDoc still says retention is unwired.
- [ ] No file under `apps/dashboard`, `factory.ts`, `permission.middleware.ts` or `apps/api/migrations` changed.
- [ ] No cross-slice import was added (`features/content` ↔ `features/settings`). The sweep issues no SQL of its own.
- [ ] All SECTION 5 commands pass. `apps/api` `tsc` stays at the baseline error set.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT:
- Touch `apps/dashboard`. The Trash countdown keeps reading `seed.retentionDays`, and `TrashListResponse` gains no field. This includes the Settings retention field, the countdown switch to the payload's `retentionDays`, the instant delete + undo toast and the bulk modal → **ROADMAP §3 `InstantDeleteUndo`**.
- Decide or build Seed Builder exposure of `retentionDays` → **ROADMAP §3**.
- Add a new ledger `reason` (e.g. `'retention'`). `actorId: null` already marks a system purge.
- Add a route to trigger the sweep manually, a queue job, a lease/cursor table, a per-seed sweep schedule, or fairness rotation across seeds.
- Run lifecycle hooks, automations or activity logging from the sweep.
- Change `purge`, `bulkPurge`, `reconcilePurgesHandler`, `deleteR2Objects`, the permission table, `factory.ts` middleware order, or `wrangler.jsonc` crons.
- Add retention per role or per user, or any special retention value other than `0` (brief §5).
- Write a migration. `site_settings` is key/value; there is no data migration (brief §5).
- Fix the sprint-1 review leftovers (`useContentTrash` `enabled` option, the three-act hooks test in `soft-delete.integration.test.ts`, the `d1-test-database.ts` regex), unless a file is already open for this sprint's change.
- Hand-edit `docs/api/**`.
