You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

Phases 1, 2, 3, and 4 are complete. This prompt covers Phase 5 only.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite), R2, Cloudflare RateLimit bindings
- Dashboard: React + TanStack Query + axios, in-memory token store
- Shared package: @beechcms/core (pure TypeScript, zero HTTP/cloud dependencies)
- Monorepo: Turborepo

==========================================================================
SECTION 1 — WHAT PHASES 1–4 DELIVERED (already in production, do not rewrite)
==========================================================================

PHASE 1: IHashProvider, ITokenService, IUserRepository, ISessionRepository,
         IPasswordResetTokenRepository, IRateLimiter, IRateLimiterRegistry
         — all injected via context or constructor.

PHASE 2: IActivityLogger, IActivityLogRepository, INotificationRepository,
         INotificationService — injected via context or constructor.

PHASE 3: IWidgetRepository, ISearchRepository, IAnalyticsRepository
         — injected via context. widget.ts and search.ts contain zero c.env.DB
         references. analytics recording in factory.ts uses IAnalyticsRepository.

PHASE 4: IClock (packages/core/src/clock.ts + SystemClock + FixedClock)
         IIdGenerator (packages/core/src/id-generator.ts + SystemIdGenerator
         + SequentialIdGenerator) — both constructor-injected into D1* classes.
         IAnalyticsRepository.recordRequest(seedSlug: string) — no dayTimestamp
         parameter; day-bucket computed internally by D1AnalyticsRepository.

Middleware registration order (already in place — DO NOT CHANGE):
  1. repositoryMiddleware
  2. storageMiddleware
  3. authProvidersMiddleware
  4. rateLimiterMiddleware
  5. observabilityMiddleware

Full list of context variables currently in AppEnv Variables
(apps/api/src/types.ts and apps/api/src/middleware/*):
  repository, idempotencyRepository, mediaRepository, systemStatsRepository,
  userRepository, sessionRepository, passwordResetTokenRepository,
  activityLogRepository, notificationRepository, widgetRepository,
  searchRepository, analyticsRepository,
  bucket, hashProvider, tokenService, rateLimiters,
  activityLogger, notificationService,
  getSeed, seedRegistry,
  jwtPayload

==========================================================================
SECTION 2 — WHAT PHASE 5 COVERS
==========================================================================

Phase 5 addresses the three remaining low-priority cleanup items from the
abstraction-interfaces report (§4.9, §4.10, §4.2):

  Item 14 — ISeedRegistry: a façade over the raw Record<string, Seed>
             stored in c.var.seedRegistry. Reduces duplicated
             Object.values()/filter patterns across the codebase.

  Item 16 — IFieldRegistry: a formal interface for the dashboard's
             static field renderer registry. Enables runtime plugin
             registration from external field type packages.

  Item 15 — IIdGenerator dedup: already done in Phase 4. Included here
             only as a reference; no action needed.

Phase 5 also performs two cleanup tasks that have been deferred:

  Cleanup A — upload.ts still uses the old free-function logActivity(c, ...).
              After Phase 2 the function was removed from shared/activity-logger.ts,
              but upload.ts was not updated. It must use c.get("activityLogger").log(...)
              in the same pattern used by the content handler create/update/delete.

  Cleanup B — stats.handler.ts GET /stats/setup-checklist and
              GET /stats/unused-media still call Object.values(c.get("seedRegistry"))
              directly. After ISeedRegistry is introduced (Step 1 of Phase 5),
              these should call c.get("seedRegistry").all() and
              c.get("seedRegistry").visibleInDashboard() instead.
              Also GET /stats/total, GET /stats/breakdown iterate seeds the same way.

==========================================================================
SECTION 3 — CURRENT STATE OF PHASE 5 TARGETS IN DETAIL
==========================================================================

3.1 seedRegistry USAGE PATTERN (API side — apps/api/src/)

  Current state:
    c.var.seedRegistry is Record<string, Seed>, injected in factory.ts:
      const registry: Record<string, Seed> = Object.fromEntries(config.seeds.map(s => [s.slug, s]))
      c.set("seedRegistry", registry)
      c.set("getSeed", (slug: string) => registry[slug] ?? null)

  Usage sites that call Object.values(c.get("seedRegistry")):
    - apps/api/src/features/stats/stats.handler.ts:
        GET /stats/total:          Object.values(c.get("seedRegistry"))
        GET /stats/breakdown:      Object.values(c.get("seedRegistry"))
        GET /stats/setup-checklist: Object.values(c.get("seedRegistry"))
        GET /stats/unused-media:   Object.values(c.get("seedRegistry"))
    - apps/api/src/search.ts:
        const seeds = Object.values(c.get("seedRegistry"))
    - apps/api/src/widget.ts:
        (already migrated in Phase 3; seeds passed to IWidgetRepository methods directly)

  Usage sites that call c.get("seedRegistry")[slug]:
    - apps/api/src/features/stats/stats.handler.ts:
        GET /stats/setup-checklist uses seeds[0]?.slug

  Usage sites that call c.get("getSeed")(slug):
    - Multiple handlers (list.ts, get.ts, create.ts, update.ts, delete.ts,
      facets.ts, widget.ts, search.ts, etc.) — these use getSeed as a lookup
      function and are NOT affected by ISeedRegistry. getSeed remains in c.var.

  Filter patterns duplicated across files:
    - seeds.filter(s => !s.dashboard?.hidden)  — filters dashboard-visible seeds
    - seeds.filter(s => s.allowPublicRead)      — filters public-read seeds
    - seeds.filter(s => s.allowDrafts)          — filters draft-enabled seeds

3.2 dashboard-menu.ts USAGE PATTERN (Dashboard side — apps/dashboard/src/)

  Current state:
    apps/dashboard/src/config/dashboard-menu.ts:
      buildContentMenu(seeds: Seed[], defaultGroupLabel: string): NavGroup[]
        filters with: seeds.filter(s => !s.dashboard?.hidden)
        groups and sorts by: s.dashboard?.group, s.dashboard?.order

  The dashboard does NOT call c.get("seedRegistry"). It receives a Seed[]
  array from its own data-fetching layer (API call to /schema or the
  seed registry loaded at startup). ISeedRegistry on the API side does
  NOT affect dashboard-menu.ts or any dashboard component directly.

3.3 upload.ts USAGE (Cleanup A)

  Current state in apps/api/src/upload.ts:
    import { logActivity } from "./shared/activity-logger"   ← was removed in Phase 2
    ...
    logActivity(c, { action: "upload", entityType: "media", ... })

  This import is now broken. The fix is:
    Remove the import of logActivity.
    Replace with: c.get("activityLogger").log({ ... })
    Extract actor from: c.get("jwtPayload")
    Pattern identical to what Phase 2 introduced in create.ts / update.ts / delete.ts.

3.4 FIELD REGISTRY CURRENT STATE (Dashboard side)

  Current state in apps/dashboard/src/components/fields/registry.ts:
    Two static Map objects:
      const displayRegistry: Map<BranchType, ComponentType<FieldDisplayProps>>
      const editRegistry: Map<BranchType, ComponentType<FieldEditProps>>
    Two export functions:
      export function getDisplayComponent(type: BranchType): ComponentType<FieldDisplayProps> | undefined
      export function getEditComponent(type: BranchType): ComponentType<FieldEditProps> | undefined

  The registry is populated at module load time by calling
  displayRegistry.set(...) and editRegistry.set(...) for each BranchType.
  There is no mechanism for external plugins to register additional types.

==========================================================================
SECTION 4 — INTERFACES TO BUILD IN PHASE 5
==========================================================================

ISeedRegistry (packages/core/src/seed-registry.ts):

  export interface ISeedRegistry {
    /**
     * Returns all seeds as a flat array, preserving insertion order.
     * Equivalent to Object.values(seedRegistry) but without the caller
     * needing to know the internal storage shape.
     */
    all(): Seed[]

    /**
     * Returns the seed with the given slug, or null if not found.
     * Equivalent to seedRegistry[slug] ?? null.
     * Provides a single lookup point that can be overridden in tests
     * without rebuilding the full registry object.
     */
    get(slug: string): Seed | null

    /**
     * Returns seeds that are visible in the dashboard sidebar.
     * A seed is visible when dashboard.hidden is not explicitly true.
     * Eliminates the seeds.filter(s => !s.dashboard?.hidden) pattern
     * that is duplicated across stats.handler.ts and dashboard-menu.ts.
     */
    visibleInDashboard(): Seed[]

    /**
     * Returns seeds that have allowPublicRead enabled.
     * Eliminates the seeds.filter(s => s.allowPublicRead) pattern.
     */
    publicReadable(): Seed[]

    /**
     * Returns seeds that have the draft workflow enabled.
     * Eliminates the seeds.filter(s => s.allowDrafts) pattern.
     */
    draftEnabled(): Seed[]
  }

  Concrete implementation in packages/core/src/seed-registry.ts (same file):

    export class SeedRegistry implements ISeedRegistry {
      private readonly seedMap: Map<string, Seed>
      private readonly orderedSeeds: Seed[]

      constructor(seeds: Seed[]) {
        this.orderedSeeds = seeds
        this.seedMap = new Map(seeds.map(s => [s.slug, s]))
      }

      all(): Seed[] { return this.orderedSeeds }
      get(slug: string): Seed | null { return this.seedMap.get(slug) ?? null }
      visibleInDashboard(): Seed[] { return this.orderedSeeds.filter(s => s.dashboard?.hidden !== true) }
      publicReadable(): Seed[] { return this.orderedSeeds.filter(s => s.allowPublicRead === true) }
      draftEnabled(): Seed[] { return this.orderedSeeds.filter(s => s.allowDrafts === true) }
    }

  Test implementation in packages/core/src/seed-registry.ts (same file):

    export class InMemorySeedRegistry extends SeedRegistry {
      /**
       * A minimal test registry that wraps SeedRegistry so test suites
       * can call new InMemorySeedRegistry([...seeds]) and receive the
       * full ISeedRegistry interface without depending on factory.ts.
       */
    }
    (InMemorySeedRegistry is just a named subclass of SeedRegistry with no
     additional logic. Its sole purpose is to give tests a semantic name.)

  NOTE on getSeed:
    The existing getSeed(slug: string): Seed | null function in c.var is NOT
    removed. It is a convenience shortcut used in dozens of route handlers.
    ISeedRegistry.get() provides the same lookup but getSeed stays in c.var
    for backwards compatibility. Both coexist.

  NOTE on the existing c.var.seedRegistry type:
    After Phase 5, c.var.seedRegistry becomes ISeedRegistry instead of
    Record<string, Seed>. This is a breaking change for any caller that
    does c.get("seedRegistry")[slug] (direct bracket access). Those callers
    must be updated to c.get("seedRegistry").get(slug) instead.
    However, the primary callers use Object.values() which maps to .all().
    Direct bracket access [slug] is rare — document all affected files below.

IFieldRegistry (apps/dashboard/src/components/fields/field-registry.ts):

  import type { BranchType } from "@beechcms/core"
  import type { ComponentType } from "react"
  import type { FieldDisplayProps, FieldEditProps } from "./types"

  export interface IFieldRegistry {
    /**
     * Registers a display renderer for a branch type.
     * Called at startup by the static registry and can be called at runtime
     * by external plugins to add support for custom branch types.
     * Later registrations overwrite earlier ones for the same type.
     */
    registerDisplay(type: BranchType, component: ComponentType<FieldDisplayProps>): void

    /**
     * Registers an edit renderer for a branch type.
     * Same semantics as registerDisplay.
     */
    registerEdit(type: BranchType, component: ComponentType<FieldEditProps>): void

    /**
     * Returns the display component for the given branch type,
     * or undefined if no renderer has been registered.
     * Callers are responsible for rendering a fallback when undefined.
     */
    getDisplay(type: BranchType): ComponentType<FieldDisplayProps> | undefined

    /**
     * Returns the edit component for the given branch type,
     * or undefined if no renderer has been registered.
     */
    getEdit(type: BranchType): ComponentType<FieldEditProps> | undefined
  }

==========================================================================
SECTION 5 — INJECTION STRATEGY
==========================================================================

ISeedRegistry — API side:
  Replace the current c.var.seedRegistry: Record<string, Seed> with
  c.var.seedRegistry: ISeedRegistry.
  The SeedRegistry instance is constructed in factory.ts (or in the Hono
  app middleware that currently sets seedRegistry).
  The existing getSeed function in c.var continues to delegate to
  the SeedRegistry instance:
    c.set("getSeed", (slug: string) => seedRegistry.get(slug))
  No new middleware is needed. The change is purely in the type of the
  variable and the construction site in factory.ts / createBeechApp.

IFieldRegistry — Dashboard side:
  The fieldRegistry singleton is instantiated once at module load in
  apps/dashboard/src/components/fields/registry.ts.
  It registers all built-in renderers at startup (identical to the
  current displayRegistry.set / editRegistry.set calls).
  The existing getDisplayComponent and getEditComponent export functions
  are updated to delegate to the singleton:
    export function getDisplayComponent(type) { return fieldRegistry.getDisplay(type) }
    export function getEditComponent(type)    { return fieldRegistry.getEdit(type) }
  A new export is added:
    export { fieldRegistry }  ← the singleton, for plugins to call .registerDisplay/.registerEdit

  NO React Context. NO middleware. The registry is a module-level singleton.
  External plugins import { fieldRegistry } from "@beechcms/dashboard/fields"
  and call fieldRegistry.registerDisplay(...) before the app mounts.

==========================================================================
SECTION 6 — GOLD STANDARD PATTERN (same rules as phases 1–4)
==========================================================================

Rules (unchanged):
1. One interface per contract. No abstract base classes (exception: InMemorySeedRegistry
   is a named subclass of SeedRegistry for semantic clarity only).
2. Concrete implementations in the same file as the interface for cross-cutting
   utilities (clock.ts, id-generator.ts, seed-registry.ts, field-registry.ts).
3. Zero Hono/HTTP coupling inside registry implementations.
4. ISeedRegistry exported from packages/core/src/index.ts.
5. IFieldRegistry lives in apps/dashboard — it is NOT exported from core,
   since it depends on React ComponentType.

==========================================================================
SECTION 7 — CODE QUALITY CONVENTIONS (non-negotiable)
==========================================================================

NAMING:
  Full descriptive English words. Zero abbreviations.
    BAD:  seedReg, fieldReg, dispComp, editComp
    GOOD: seedRegistry, fieldRegistry, displayComponent, editComponent

  Constants: SCREAMING_SNAKE_CASE.
  Files: kebab-case, full words.

COMMENTS (English only):
  JSDoc on every exported interface method explaining WHY.
  Inline comments only where intent cannot be inferred from the code alone.

CODE STRUCTURE:
  - No nested ifs beyond 2 levels. Guard clauses.
  - No chained ternary expressions.
  - No 3+ inline && chains. Extract to named booleans.
  - One responsibility per function. Split at ~20 lines.
  - Magic numbers are named constants at the top of the file.

==========================================================================
SECTION 8 — YOUR OPERATING RULES
==========================================================================

1. Work ONE step at a time. Never start step N+1 before the user confirms step N.

2. Before writing any file, state:
   - FILES TO CREATE: list with full paths
   - FILES TO MODIFY: list with full paths and one-line change description
   - FILES TO DELETE: list (if any)

3. After writing each file, stop and ask: "Ready for the next file?"

4. Never touch files not listed in the current step.

==========================================================================
SECTION 9 — CURRENT TASK: PHASE 5 — SEED REGISTRY, FIELD REGISTRY, CLEANUP
==========================================================================

Execute the following steps in order.

--------------------------------------------------------------------------
PHASE 5 — STEP 1: ISeedRegistry and SeedRegistry in packages/core
--------------------------------------------------------------------------

FILES TO CREATE:
  packages/core/src/seed-registry.ts
    Define ISeedRegistry (5 methods with JSDoc as per Section 4).
    Define SeedRegistry implements ISeedRegistry (constructor takes Seed[]).
    Define InMemorySeedRegistry extends SeedRegistry (no-op subclass, JSDoc only).
    All three exported from this file.

FILES TO MODIFY:
  packages/core/src/index.ts
    Export ISeedRegistry, SeedRegistry, InMemorySeedRegistry.

--------------------------------------------------------------------------
PHASE 5 — STEP 2: Update AppEnv Variables type for seedRegistry
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/types.ts
    Change: seedRegistry: Record<string, Seed>
    To:     seedRegistry: ISeedRegistry
    Import ISeedRegistry from "@beechcms/core".
    NOTE: getSeed: (slug: string) => Seed | null — keep this unchanged.

--------------------------------------------------------------------------
PHASE 5 — STEP 3: Update factory.ts (packages/api) to construct SeedRegistry
--------------------------------------------------------------------------

CONTEXT:
  The file apps/api/src/factory.ts (the Hono middleware at the root of the app)
  currently sets:
    const registry: Record<string, Seed> = Object.fromEntries(config.seeds.map(s => [s.slug, s]))
    c.set("seedRegistry", registry)
    c.set("getSeed", (slug: string) => registry[slug] ?? null)

FILE TO MODIFY:
  apps/api/src/factory.ts
    1. Import SeedRegistry from "@beechcms/core".
    2. Replace:
         const registry = Object.fromEntries(config.seeds.map(s => [s.slug, s]))
         c.set("seedRegistry", registry)
         c.set("getSeed", (slug: string) => registry[slug] ?? null)
       With:
         const seedRegistry = new SeedRegistry(config.seeds)
         c.set("seedRegistry", seedRegistry)
         c.set("getSeed", (slug: string) => seedRegistry.get(slug))
    3. No other changes.

ALSO MODIFY:
  packages/api/src/factory.ts  (the PUBLIC API package factory, if it exists separately)
    Same change as above, if this file also sets seedRegistry.
    If it does not set seedRegistry, skip this file.

--------------------------------------------------------------------------
PHASE 5 — STEP 4: Update stats.handler.ts to use ISeedRegistry methods
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/features/stats/stats.handler.ts

    For every occurrence of Object.values(c.get("seedRegistry")):
      Replace with c.get("seedRegistry").all()

    For every occurrence where seeds are filtered to visible-only:
      Replace with c.get("seedRegistry").visibleInDashboard()
      (Currently: seeds.filter(s => !s.dashboard?.hidden))

    For GET /stats/setup-checklist:
      Replace seeds[0]?.slug (if seeds was previously Object.values(seedRegistry))
      with c.get("seedRegistry").all()[0]?.slug or
      c.get("seedRegistry").visibleInDashboard()[0]?.slug (whichever was the intent).
      Based on the current code context (setup-checklist checks if content tables
      exist and if they have content), use .all()[0]?.slug — setup needs all seeds,
      not just visible ones.

    After migration: no direct Object.values(c.get("seedRegistry")) calls remain.

--------------------------------------------------------------------------
PHASE 5 — STEP 5: Update search.ts to use ISeedRegistry
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/search.ts

    Replace: const seeds = Object.values(c.get("seedRegistry"))
    With:    const seeds = c.get("seedRegistry").all()

    After migration: no Object.values(c.get("seedRegistry")) call in search.ts.

--------------------------------------------------------------------------
PHASE 5 — STEP 6: Fix upload.ts (Cleanup A — broken logActivity import)
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/api/src/upload.ts

    1. Remove the broken import: import { logActivity } from "./shared/activity-logger"
    2. Replace the logActivity(c, { ... }) call with:
         const jwtPayload = c.get("jwtPayload")
         if (jwtPayload) {
           c.get("activityLogger").log({
             action: "upload",
             entityType: "media",
             entityId: objectKey,
             details: { name: file.name, size: file.size, type: file.type },
             actor: {
               id: jwtPayload.sub,
               email: jwtPayload.email ?? jwtPayload.sub,
               name: jwtPayload.name ?? null,
             },
           })
         }
    3. The log call is fire-and-forget (IActivityLogger.log returns void | Promise<void>).
       It should be placed after the upload succeeds, in the same position as
       the original logActivity call.
    4. No other changes to upload.ts.

  NOTE: The jwtPayload may not always be present (unauthenticated upload paths,
  though in practice upload requires auth). The guard `if (jwtPayload)` prevents
  a runtime crash if the middleware chain is misconfigured.

--------------------------------------------------------------------------
PHASE 5 — STEP 7: IFieldRegistry interface and FieldRegistryImpl
--------------------------------------------------------------------------

FILES TO CREATE:
  apps/dashboard/src/components/fields/field-registry.ts
    Define IFieldRegistry interface (4 methods with JSDoc as per Section 4).
    Define class FieldRegistryImpl implements IFieldRegistry:
      Two private Maps: displayMap and editMap.
      registerDisplay(type, component): this.displayMap.set(type, component)
      registerEdit(type, component): this.editMap.set(type, component)
      getDisplay(type): return this.displayMap.get(type)
      getEdit(type): return this.editMap.get(type)
    Do NOT populate the maps here — that happens in registry.ts.
    Export IFieldRegistry and FieldRegistryImpl.

--------------------------------------------------------------------------
PHASE 5 — STEP 8: Refactor registry.ts to use IFieldRegistry singleton
--------------------------------------------------------------------------

FILE TO MODIFY:
  apps/dashboard/src/components/fields/registry.ts

    1. Import FieldRegistryImpl from "./field-registry".
    2. Create module-level singleton:
         const fieldRegistry: IFieldRegistry = new FieldRegistryImpl()
    3. Register all built-in renderers by calling:
         fieldRegistry.registerDisplay(type, component)
         fieldRegistry.registerEdit(type, component)
       for every BranchType that was previously handled by displayRegistry.set
       and editRegistry.set.
    4. Update the existing export functions to delegate to the singleton:
         export function getDisplayComponent(type: BranchType) {
           return fieldRegistry.getDisplay(type)
         }
         export function getEditComponent(type: BranchType) {
           return fieldRegistry.getEdit(type)
         }
    5. Add a new named export for the singleton:
         export { fieldRegistry }
    6. Remove the old displayRegistry and editRegistry Map constants.
    7. Keep the existing re-exports of component types if any exist.

    After this step:
    - The public API of registry.ts (getDisplayComponent, getEditComponent)
      is unchanged for all existing callers.
    - External plugins can now call fieldRegistry.registerDisplay(...) at startup.
    - The two internal Map constants are gone.

==========================================================================
SECTION 10 — PHASE 5 COMPLETION CHECKLIST
==========================================================================

Before marking Phase 5 complete, verify every produced file:

  [ ] No abbreviations in names
  [ ] JSDoc on every exported interface method (WHY, not the obvious WHAT)
  [ ] No ifs nested beyond 2 levels — guard clauses used
  [ ] No chained ternary expressions
  [ ] No 3+ inline && chains
  [ ] ISeedRegistry, SeedRegistry, InMemorySeedRegistry exported from packages/core/index.ts
  [ ] c.var.seedRegistry is typed as ISeedRegistry (not Record<string, Seed>)
  [ ] getSeed in c.var unchanged and still functional
  [ ] stats.handler.ts contains no Object.values(c.get("seedRegistry")) calls
  [ ] search.ts contains no Object.values(c.get("seedRegistry")) calls
  [ ] upload.ts contains no import of the deleted logActivity function
  [ ] upload.ts calls c.get("activityLogger").log(...) with actor extracted from jwtPayload
  [ ] IFieldRegistry and FieldRegistryImpl created in field-registry.ts (dashboard)
  [ ] registry.ts uses fieldRegistry singleton; old Map constants removed
  [ ] getDisplayComponent / getEditComponent public API unchanged
  [ ] fieldRegistry exported from registry.ts for plugin use
  [ ] No circular imports introduced

Begin with Step 1. List the files you will create and modify, then proceed file by file.
After each file, stop and ask: "Ready for the next file?"
