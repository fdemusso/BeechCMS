### Pre-Computation Analysis

a) God Nodes:
- `packages_client_src_query_builder` (The core builder logic)
- `packages_client_src_types` (The client type definitions)

b) Architectural Boundaries Affected:
- `@beechcms/client` (packages/client)
- Strictly isolated to the client boundary. No backend (`@beechcms/core`, `apps/api`) changes required in this sprint.

c) `graphify affected` Impact Analysis:
```text
Affected nodes for src/query-builder.ts (Depth: 2)
- client/src/index.ts [re_exports] 
- browser/client.ts [imports_from] 
- src/query-builder.test.ts [imports_from] 
- server/client.ts [imports_from] 
- browser/index.ts [re_exports] 
- server/index.ts [re_exports] 
```
The impact is confined strictly to the internal API surface of `@beechcms/client`. We must update `browser/client.ts` and `server/client.ts` to expose the new fluent API.

### VETO Audit

- **Vertical Slice Architecture (VSA):** PASS. This sprint operates entirely within the `@beechcms/client` boundary. There are no cross-imports with `apps/api` or `apps/dashboard`.
- **The Botanical Invariant:** PASS. The client only constructs HTTP requests against the Public API. It does not bypass `@beechcms/core` or speak SQL directly.
- **Cloudflare Purity:** PASS. The client remains environment-agnostic, usable in any JS runtime (browser, Node, Workers).

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
The `@beechcms/client` currently forces consumers to manually encode filter objects (e.g. `.list({ filter: { ... } })`) with no compile-time safety and no fluent chain. Worse, it lacks a mechanism to detect runtime schema drift. Building this typed fluent builder is essential to fulfill the core value proposition of BeechCMS as a headless CMS: allowing external consumers to query content ergonomically and safely.

This sprint implements the fluent chain, integrates the generated `SeedRegistryTypes` and schema fingerprint (built in Sprints 3a/4) into the client generic boundaries, and enforces a runtime drift check (`X-Schema-Revision` header vs build-time fingerprint).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- `packages/client/src/query-builder.ts`: Exports `buildSearchParams(query: ListQuery<...>)`. It takes a single query object and compiles it to `URLSearchParams`.
- `packages/client/src/types.ts`: `BeechBrowserClient` and `BeechServerClient` use `content(seed)` returning a `{ list, get }` object. The registry defaults to `Record<string, unknown>`.
- `packages/client/src/browser/client.ts` and `server/client.ts`: Construct the HTTP requests using `buildSearchParams`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `packages/client/src/types.ts`: Update `BeechBrowserClient` and `BeechServerClient` interfaces to expose `.collection(seed)` returning a `FluentQueryBuilder` interface. Replace `Record<string, unknown>` generic default with `SeedRegistryTypes` (assuming generated types integration). Define the `BeechProblem` shape for stale types mismatch.
- `packages/client/src/query-builder.ts`: Refactor into a `FluentQueryBuilder` class/interface supporting `.where()`, `.include()`, `.select()`, `.first()`, and `.list({ validate?: boolean })`.
- `packages/client/src/browser/client.ts` & `packages/client/src/server/client.ts`: Update to implement the `.collection()` method, execute requests via the fluent builder, and perform the `X-Schema-Revision` fingerprint check on response.
- `packages/client/src/query-builder.test.ts` (unit tier): Tests for the new fluent builder and the fingerprint validation logic.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
1. **Types Refactoring (`packages/client/src/types.ts`)**
   - Import the generated `SeedRegistryTypes` and `SCHEMA_FINGERPRINT` (as stubs/placeholders if not running in a context where they exist, or assuming they are provided via a generic).
   - Define the `FluentQuery` interface:
     ```typescript
     export interface FluentQuery<TRow> {
       where(filter: Record<string, FieldFilter>): this;
       include(relations: string[]): this;
       select(fields: Extract<keyof TRow, string>[]): this;
       first(options?: RequestOptions): Promise<BeechResult<Single<TRow>>>;
       list(options?: RequestOptions & { validate?: boolean }): Promise<BeechResult<Listable<TRow>>>;
     }
     ```
   - Update `BeechBrowserClient<TRegistry>` and `BeechServerClient<TRegistry>`:
     - Replace `content(seed)` with `collection<K extends keyof TRegistry & string>(seed: K): FluentQuery<TRegistry[K]>`.

2. **Fluent Builder Implementation (`packages/client/src/query-builder.ts`)**
   - Create a `FluentQueryBuilder<TRow>` class implementing `FluentQuery<TRow>`.
   - Store the accumulated query state internally (e.g. `filters`, `includes`, `fields`).
   - Implement `.where()`, `.include()`, `.select()` to mutate state and return `this`.
   - Expose an internal method `build(): URLSearchParams` that outputs the same logic as the old `buildSearchParams`.
   - The `.first()` and `.list()` methods will need a reference to an executor function (passed in the constructor) that actually performs the `fetch` call.

3. **Client Integration & Fingerprint Check (`packages/client/src/browser/client.ts` & `server/client.ts`)**
   - Implement `.collection(seed)` to instantiate `FluentQueryBuilder` with an executor.
   - The executor must check the response headers:
     ```typescript
     const revision = response.headers.get('X-Schema-Revision');
     if (expectedFingerprint && revision && revision !== expectedFingerprint) {
       return { data: null, error: { type: 'schema_drift', title: 'Stale Types', status: 409, detail: 'Client types stale, regenerate with `beech types generate`' } };
     }
     ```
   - Make sure runtime validation is triggered if `.list({ validate: true })` is called (stub the zod parsing or validation logic for now, leaving room for integration).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- Validate types: `npx tsc --noEmit` in `packages/client/`
- Build client: `pnpm run build` in `packages/client/`
- Run tests: `pnpm beech test --diff`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `packages/client/src/query-builder.ts` implements a fluent chain API (`where`, `include`, `select`, `list`, `first`).
- [ ] `packages/client/src/types.ts` is strongly typed over a generic `TRegistry`.
- [ ] A mismatch between `X-Schema-Revision` header and the client's expected fingerprint returns a 409 `BeechProblem` instead of throwing implicitly.
- [ ] Client HTTP requests (in browser and server variants) are constructed accurately from the fluent chain state.
- [ ] Unit tests for `query-builder.ts` pass and strictly mock only network/fetch layers. No `any` types.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Do NOT implement subqueries or arbitrary `JOIN` operations (belongs to Sprint 6).
- Do NOT implement server-side `include` logic in `apps/api` (this was Sprint 4).
- Do NOT modify the core CLI schema tools or type generator (Sprints 3a/3b).
- Do NOT rewrite or alter the dashboard UI.
