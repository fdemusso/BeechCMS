# Sprint 04-pre — Foundation Fixes (Branch IDs + Auth Type Unification)

> **Audience:** an AI coding agent. Everything needed is inline.
>
> **Run this BEFORE Sprint 04a.** It fixes two pre-existing inconsistencies
> that 04a–04c would otherwise inherit and amplify. After this sprint nothing
> visible changes for end users.

---

## 0. WHY THIS EXISTS

Two doc-vs-code divergences surfaced while planning Sprint 04. Both are
small to fix individually but compound badly the longer they sit:

### Divergence A — "Stable branch IDs" are documented but not implemented

`CLAUDE.md` states as a hard invariant of the Botanical Engine:

> **Branch policies invariant** — *"Branch IDs (`br_XX`) are the only stable
> DB keys. Never hard-code aliases or branch IDs in queries."*

But the live `Branch` interface in `packages/core/src/types.ts:57` has **no
`id` field**. Searches in the actual seeds (`packages/core/src/seeds.ts`)
return **zero** `br_` occurrences. The only places where `{ id: 'br_01' }`
appears are two test fixtures (`policies.test.ts:9`,
`seed-registry.test.ts:141`), and both force the shape with `as Branch`.

Consequence: today `alias` is the **de facto** stable key for every
persisted reference (FTS triggers, drafts, soon: layouts). Any future alias
rename silently breaks those references. We are one rename away from a
production incident.

### Divergence B — `JwtPayload` duplicates and narrows `JwtClaims`

`packages/core/src/auth/token-service.ts:4` exports:

```ts
export interface JwtClaims {
  sub: string
  email?: string
  name?: string
  [key: string]: unknown
}
```

`apps/api/src/middleware.ts:10` redefines a **narrower** local type:

```ts
export type JwtPayload = {
  sub: string
  email?: string
  name?: string
}
```

and the `authMiddleware` sets it on the Hono context as `'jwtPayload'`.
Two problems:

1. Every additional claim (e.g. `surname` already issued by `factory.ts`,
   and `role` coming in 04a) is **type-erased** at the route boundary.
   Handlers read `context.get('jwtPayload')?.role` and TypeScript silently
   returns `undefined` — even though the runtime value exists. This is an
   RBAC trap.
2. Two types for the same thing in two packages — every future claim has
   to be added twice and stay in sync by hand.

---

## 1. SCOPE

1. Introduce `Branch.id: string` as a **required** field. Match `^br_[A-Za-z0-9]+$`.
2. Assign a `br_XX` id to every branch in every seed in `seeds.ts`.
3. Add a boot-time validation in `SeedRegistry` constructor that enforces
   uniqueness of ids within a Seed and rejects malformed ids.
4. Add a "stable-id-only" assertion helper used by code paths that resolve
   a branch reference from a persisted JSON (FTS triggers, soon: layouts).
5. Delete the duplicate `JwtPayload` type. Have `authMiddleware` set the
   core `JwtClaims` onto the context under the same key `'jwtPayload'`
   (no behavior change — only the type widens). Update `Variables` in
   `apps/api/src/types.ts` accordingly.
6. Add `role?: string` to the core `JwtClaims` explicitly (so it shows up
   in IDE completions; the index signature already lets it pass at runtime).

**Out of scope:** wiring `role` into JWT issuance and dashboard auth
context — that's in Sprint 04a.

---

## 2. PART A — STABLE BRANCH IDS

### A1. Extend the `Branch` interface
`packages/core/src/types.ts:57` — add `id` as a required string field
at the top of the interface:

```ts
export interface Branch {
  /**
   * STABLE id of the branch, e.g. 'br_01', 'br_title'.
   * Format: ^br_[A-Za-z0-9]+$ — enforced by SeedRegistry at boot.
   *
   * USED by every persistence layer that needs a reference that survives
   * alias renames (FTS triggers, drafts indexing, layout JSON, future
   * automations). NEVER use the alias for that purpose.
   *
   * The Botanical Engine still emits the alias as the SQL column name.
   * `id` is a logical handle, not a column name.
   */
  id: string
  alias: string
  /* …existing fields… */
}
```

> **Naming convention.** Use sequential `br_01`, `br_02`, … inside a Seed
> for compactness, OR a `br_<alias>` style. The format check is permissive
> (`^br_[A-Za-z0-9]+$`) so either works. The default generator in this
> sprint uses **sequential**.

### A2. Assign ids in `seeds.ts`
Walk every Seed in `packages/core/src/seeds.ts`. For each Seed:

1. Iterate branches in declaration order.
2. Assign `id: 'br_NN'` where `NN` is a zero-padded 2-digit counter
   starting at `01`. (Three digits if a Seed has > 99 branches — none does
   today.)
3. Preserve declaration order (the Botanical Engine and tests rely on it).

Keep the changes mechanical and reviewable. Do not reorder, rename, or
otherwise touch existing branch fields.

### A3. Boot validation in `SeedRegistry`
`packages/core/src/seed-registry.ts:43` — extend the constructor's existing
loop with two checks per branch:

```ts
const BRANCH_ID_RE = /^br_[A-Za-z0-9]+$/
// inside the loop already validating AUTOMATION_RESERVED_WORDS:
if (!branch.id || !BRANCH_ID_RE.test(branch.id)) {
  throw new Error(
    `Seed "${seed.slug}" branch "${branch.alias}" has invalid id "${branch.id}". ` +
    `Expected format ^br_[A-Za-z0-9]+$.`,
  )
}
if (idsInSeed.has(branch.id)) {
  throw new Error(
    `Seed "${seed.slug}" has duplicate branch id "${branch.id}".`,
  )
}
idsInSeed.add(branch.id)
```

Where `idsInSeed` is a `Set<string>` created at the start of each seed's
inner loop. Failing fast at boot is by design — a Worker that fails to
construct its registry surfaces immediately in `wrangler dev` and the
deploy log.

### A4. Lookup helper
Add to `packages/core/src/seed-registry.ts`:

```ts
/** Finds a branch by its stable id within a Seed. Returns null if missing. */
export function findBranchById(seed: Seed, id: string): Branch | null {
  return seed.branches.find(b => b.id === id) ?? null
}
```

Export from the core barrel. Sprint 04a's `validateLayoutAgainstSeed`
will use it instead of an alias lookup once layouts migrate to `branchId`
(see §A6).

### A5. Audit existing persisted references
Even though no production data uses the layout system yet, two places
already persist a branch handle and should be checked:

- **FTS triggers** (`packages/core/src/engine.ts` / FTS section): grep for
  any string that captures `branch.alias` into a persisted artifact and
  document each one in a comment as "uses alias — pre-stable-id". Do not
  migrate them in this sprint; just label them so the follow-up sprint
  can find them.
- **Drafts table column mapping**: same audit — currently mirrors live
  table columns by alias. Label only.

Output of this step: a short list at the top of
`packages/core/src/STABLE_ID_AUDIT.md` (new file) listing every persisted
reference to a branch alias that still needs migration to `branch.id`,
with the file:line. This is the working backlog for the follow-up "Stable
ID Migration" sprint that will land after Sprint 04.

> **Why not migrate everything now:** changing FTS triggers requires a D1
> migration and a re-index. We isolate that risk to its own sprint.

### A6. Sprint 04a coordination
Sprint 04a's `LayoutField.branchAlias` stays named `branchAlias` for now —
but the **stable id is available**. Add a note inline in 04a's data shape
to use `branchId` from day one instead:

> **Update to 04a §4 (CORE TYPES)** — after this sprint runs, rename
> `branchAlias` → `branchId`. The field stores `branch.id` (e.g. `'br_03'`),
> not the alias. The default-layout generator reads `branch.id`. The
> renderer (04b) looks branches up via `findBranchById(seed, field.branchId)`
> instead of the alias map.

This change is mechanical and removes 04a's only remaining tech-debt note.

### A7. Tests to add
- `seed-registry.test.ts`: a seed with two branches sharing the same `id`
  throws at construction. A seed with `id: 'invalid'` (no `br_` prefix)
  throws. A seed missing `id` throws.
- `seeds.test.ts` (or equivalent): every seed exported from `seeds.ts` has
  a unique, valid `id` on every branch — assert by iterating
  `SEED_REGISTRY`.

### A8. CLAUDE.md cleanup
The "Branch policies invariant" paragraph in `CLAUDE.md` is now actually
enforced. Append one line at the end:

> *Enforced by `SeedRegistry` at boot (sprint 04-pre). Branch ids match
> `^br_[A-Za-z0-9]+$` and are unique within a Seed. Use `findBranchById`
> to resolve references stored in persisted JSON.*

---

## 3. PART B — UNIFY `JwtClaims` / `JwtPayload`

### B1. Add `role` to the core type
`packages/core/src/auth/token-service.ts`:

```ts
export interface JwtClaims {
  sub: string
  email?: string
  name?: string
  surname?: string     // ← also missing today, even though factory.ts already issues it
  role?: string        // ← new in this sprint
  [key: string]: unknown
}
```

The `surname?: string` addition closes another pre-existing type-erasure
bug (Sprint 03 added surname to JWT issuance but never added it to the
claim type — confirm by grepping `factory.ts:224`/`264`).

### B2. Delete the local `JwtPayload`
`apps/api/src/middleware.ts`:

```ts
// BEFORE
import type { Env, Variables } from './types'
export type JwtPayload = { sub: string; email?: string; name?: string }
//…
c.set('jwtPayload', claims as JwtPayload)

// AFTER
import type { JwtClaims } from '@beechcms/core'
import type { Env, Variables } from './types'
//…
c.set('jwtPayload', claims)
```

No cast needed — `tokenService.verify()` already returns `JwtClaims | null`,
and we've already null-checked. Remove the `JwtPayload` type entirely.

### B3. Re-type the context variable
`apps/api/src/types.ts` — find the `Variables` declaration. The slot is
likely typed as `jwtPayload: JwtPayload` (importing from `./middleware`).
Change it to:

```ts
import type { JwtClaims } from '@beechcms/core'
// …
interface Variables {
  // …existing entries…
  jwtPayload: JwtClaims
  // …
}
```

The context key stays `'jwtPayload'` — renaming would be a churn no
handler benefits from. (Sprint 04a's handlers already assume this key.)

### B4. Fix any callers that referenced `JwtPayload`
Grep `JwtPayload` across `apps/api/src/` and either:
- replace the import with `JwtClaims` from `@beechcms/core`, OR
- remove the explicit type annotation entirely if it was only used for
  the context read (TypeScript will infer `JwtClaims` from `Variables`).

### B5. Test
Add a single integration-style test in `apps/api/src/test/` (or extend
an existing one):
- Issue a token via `JoseTokenService` carrying
  `{ sub, email, role: 'admin', surname: 'X' }`.
- Hit any protected route with a tiny custom handler that returns
  `context.get('jwtPayload')`.
- Assert the response carries `role: 'admin'` and `surname: 'X'`.
- This locks in the fix: without the unification, both fields would come
  back undefined.

---

## 4. FILES TO TOUCH (checklist)

Core:
- `packages/core/src/types.ts` — add `id: string` to `Branch` (Part A)
- `packages/core/src/seeds.ts` — assign `br_NN` to every branch (Part A)
- `packages/core/src/seed-registry.ts` — boot validation + `findBranchById`
- `packages/core/src/index.ts` — export `findBranchById`
- `packages/core/src/auth/token-service.ts` — add `surname?`, `role?` to `JwtClaims`
- `packages/core/src/STABLE_ID_AUDIT.md` (new) — working backlog for the
  alias→id migration that will follow Sprint 04

API:
- `apps/api/src/middleware.ts` — delete local `JwtPayload`; set `JwtClaims` directly
- `apps/api/src/types.ts` — `Variables.jwtPayload: JwtClaims`
- `apps/api/src/test/<one-file>` — claims pass-through test (Part B5)

Docs:
- `CLAUDE.md` — append one-line enforcement note under the Branch policies
  paragraph (§A8)

Tests:
- `packages/core/src/seed-registry.test.ts` — id uniqueness + format
- `packages/core/src/<seeds smoke test>` — all seeds have valid ids

---

## 5. ACCEPTANCE

1. **Types & build:** `npm run build` at root passes. Core builds first;
   any seed missing `id` causes a TypeScript error (`id` is required).
2. **Boot validation:** locally, temporarily duplicate a branch id in
   `seeds.ts` → `npm run dev` (in `apps/api/`) fails at startup with the
   uniqueness error. Revert.
3. **Lookup helper:** `findBranchById(seed, 'br_01')` returns the
   expected branch; `findBranchById(seed, 'br_does_not_exist')` returns
   `null`.
4. **Claims pass-through:** the test from §B5 returns both `role` and
   `surname` from `context.get('jwtPayload')`.
5. **No regressions:** existing test suites pass — `npm run test` at root.
6. **CLAUDE.md** updated; `STABLE_ID_AUDIT.md` lists every persistence
   point still using `branch.alias` (FTS triggers, draft mirroring, any
   other findings).
7. **Sprint 04a unblocked:** with `Branch.id` in place, 04a uses
   `branchId` instead of `branchAlias` in the layout JSON from day one.
   Update 04a's data shape and §13 to drop the `TODO(branch-ids)`
   marker.

---

## 6. OPEN QUESTIONS

- **Branch id format default:** sequential `br_01..br_NN` (compact, easy
  to assign mechanically) vs `br_<alias>` (self-documenting but breaks if
  alias is renamed — defeats the purpose). *Default: sequential.*
- **Existing persisted aliases (FTS, drafts):** do we migrate in the
  follow-up sprint or accept that they stay alias-keyed forever (treating
  `id` as an additive future-only handle)? *Default: migrate in a
  follow-up sprint — `STABLE_ID_AUDIT.md` is the backlog.*
- **`Variables.jwtPayload` rename to `jwtClaims`?** Cleaner, but every
  handler in the API would need a renamed read. *Default: keep the key
  `'jwtPayload'`. Only the TYPE widens.*
