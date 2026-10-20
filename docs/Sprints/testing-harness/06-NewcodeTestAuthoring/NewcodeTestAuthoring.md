==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
Sprint 1 (`coverage-exclusion-repair`, merged) fixed the coverage *denominator* —
exclusion globs now match the post-refactor file layout in both `vitest.config.ts`
(per workspace) and `sonar-project.properties`. That sprint deliberately did not
touch application code. This sprint closes the residual *numerator* gap: the
genuine business logic in `apps/api/src/middleware/auth.middleware.ts` and
`apps/dashboard/src/features/content-kanban/utils/{use-kanban-drag,use-kanban-autoscroll}.ts`
that still counts against the 80% New-Code gate after Sprint 1's repair.

This must be sequenced after Sprint 1 (per `backlog/ROADMAP.md`) because the
extracted helper modules created here must land *outside* Sprint 1's glue-exclusion
globs to count toward coverage — had this run first, the denominator would still
have been wrong and the percentage gain here would be meaningless.

VSA compliance: all new/modified files stay inside their existing slice
(`apps/api/src/middleware/` and `apps/dashboard/src/features/content-kanban/utils/`).
No cross-feature import is introduced. Botanical Engine invariant: untouched —
this sprint contains zero D1/query code.

**Scope correction from the feature brief, based on live coverage data (not
assumption):** `auth.middleware.ts` is NOT untested. `jwt-claims-passthrough.test.ts`
and `flow-admin-auth.test.ts` already exercise it via integration flows through
Hono, at 92.85% lines / 83.33% branches / 100% functions (`coverage/lcov.info`,
`apps/api`). Exactly one line (33 — the `if (!token)` empty-Bearer-token guard) and
one branch are dead. Rule 4 (security-critical → always test) still mandates a
dedicated unit test file for this module regardless of size/existing indirect
coverage, so this sprint adds one — scoped to close the real gap, not to
duplicate the 92.85% already covered.

`fractional.ts` is genuinely at 0% (both functions never invoked by any test).
`kanban-card-display.ts` is partially dead (`resolveImageUrl` at 0%). Both get
real unit test suites.
==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify + coverage data)
==========================================================================
**Middleware (`apps/api`):**
- `authMiddleware()` — `apps/api/src/middleware/auth.middleware.ts:24`. Reads
  `Authorization` header, requires `Bearer ` prefix, delegates verification to
  `c.get('tokenService').verify(token)` (`ITokenService` injected via context,
  see `Variables` in `apps/api/src/types.ts`), sets `c.set('jwtPayload', claims)`.
  Graph degree 6: consumed by `factory.ts` (`createBeechApp()`), `search.ts`, and
  6+ integration test files. No other file `imports` its internals — safe to add
  a sibling test file.
- Current coverage (`apps/api`, `pnpm exec vitest run --coverage`): auth.middleware.ts
  92.85% stmts / 83.33% branch / 100% funcs / 92.85% lines. Uncovered: line 33
  (`if (!token)` after `Bearer ` prefix is stripped — i.e. header is exactly
  `"Bearer "` with no token following) and its corresponding branch.
- `jwt-claims-passthrough.test.ts` is the existing precedent for building a bare
  Hono app with the middleware mounted directly (no full `createBeechApp()`
  bootstrap) — this sprint's new test file follows the same pattern.

**Content-Kanban hooks (`apps/dashboard`):**
- `useKanbanDrag()` — `apps/dashboard/src/features/content-kanban/utils/use-kanban-drag.ts:132`.
  Graph degree 3: `content-kanban.tsx` imports it, `ContentKanban()` calls it,
  re-exported via `content-kanban/index.ts` barrel, consumed by `content-list.tsx`
  page. Contains pure logic entangled with `queryClient`/React refs:
  - `colValueFromDroppableId(id)` (line 124) — pure, zero dependencies.
  - The dedupe → sort (null-sink) → synthetic-position-assignment block inside
    `getCardsFromCache` (lines 63–98) — pure over a `KanbanCardDisplayModel[]`
    once the cache read (lines 50–61) is factored out.
  - The before/after index math in `onDragMove` (lines 221–250) and `onDragEnd`
    (lines 340–374) — near-identical duplicated blocks using `arrayMove` +
    position lookups + the collision clamp guard. This is the "card
    sort/reorder index math" the feature brief names.
- `useKanbanAutoscroll()` — `apps/dashboard/src/features/content-kanban/utils/use-kanban-autoscroll.ts:6`.
  Graph degree 0 (no affected nodes found by `graphify affected`) — fully
  self-contained, lowest-risk extraction target. The `tick()` closure (lines
  25–36) contains the pure edge/scroll-delta decision: pointer within `EDGE_PX`
  of top → scroll up by `SCROLL_SPEED`; within `EDGE_PX` of bottom → scroll down;
  else no-op.
- `fractional.ts` (existing precedent file, unchanged this sprint) exports
  `positionBetween` / `rebalanceKeys` wrapping the `fractional-indexing` npm
  package. Currently 0% covered (lcov: `FNH:0`, both functions never invoked by
  any test).
- `kanban-card-display.ts` (unchanged this sprint) exports
  `buildKanbanCardDisplayModel`. Currently: `toPlainText` and the legacy-heuristic
  path in `buildKanbanCardDisplayModel` are exercised indirectly; `resolveImageUrl`
  (lines 6–16) and the slot-resolution branch (`card && seed`, lines 44–63) are
  at 0%.
- Exclusion state confirmed current (`apps/dashboard/vitest.config.ts:167-176`,
  mirrored in `sonar-project.properties:95-100`): `use-kanban-drag.ts`,
  `use-kanban-board.ts`, `use-kanban-autoscroll.ts`, `constants.ts`, and
  `components/**`/`hooks/**` are excluded (glue). `fractional.ts` and
  `kanban-card-display.ts` are NOT excluded — correctly measured, per Sprint 1.
  New helper modules created in this sprint must NOT be added to either
  exclusion list — they need to count.
==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
1. **New file** `apps/api/src/middleware/auth.middleware.test.ts` — dedicated unit
   test closing the line-33 gap and covering the full decision tree in isolation
   (not just via integration flows).
2. **New file** `apps/dashboard/src/features/content-kanban/utils/kanban-reorder.ts`
   — extracted pure logic: `colValueFromDroppableId`, `resequenceCards`,
   `computeReorderBounds`.
3. **Modified** `apps/dashboard/src/features/content-kanban/utils/use-kanban-drag.ts`
   — `getCardsFromCache` and the duplicated before/after blocks in `onDragMove`/
   `onDragEnd` now call the three extracted functions instead of inlining them.
   Zero behavior change; hook's external return shape (`sensors`,
   `collisionDetection`, `onDragStart/Move/End/Cancel`, `getActiveId`) unchanged.
4. **New file** `apps/dashboard/src/features/content-kanban/utils/kanban-reorder.test.ts`
   — unit tests for the three extracted functions.
5. **New file** `apps/dashboard/src/features/content-kanban/utils/kanban-autoscroll-math.ts`
   — extracted pure logic: `scrollDelta`.
6. **Modified** `apps/dashboard/src/features/content-kanban/utils/use-kanban-autoscroll.ts`
   — `tick()` calls `scrollDelta` instead of inlining the edge-check. Zero
   behavior change; hook's return shape (`start`, `stop`, `updatePointer`)
   unchanged.
7. **New file** `apps/dashboard/src/features/content-kanban/utils/kanban-autoscroll-math.test.ts`
   — unit tests for `scrollDelta`.
8. **New file** `apps/dashboard/src/features/content-kanban/utils/fractional.test.ts`
   — unit tests for the existing, untouched `fractional.ts`.
9. **New file** `apps/dashboard/src/features/content-kanban/utils/kanban-card-display.test.ts`
   — unit tests for the existing, untouched `kanban-card-display.ts`.

No `vitest.config.ts` or `sonar-project.properties` edits in this sprint — the
new helper modules are plain `.ts` files under an already-measured path; no glob
change is required for them to count.
==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — `auth.middleware.test.ts` (closes line-33 gap, rule 4)

```ts
// apps/api/src/middleware/auth.middleware.test.ts
import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { authMiddleware } from './auth.middleware'
import type { Env, Variables } from '../types'

function buildApp(verify: (token: string) => Promise<unknown>) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('tokenService', { verify } as any)
    await next()
  })
  app.use('/protected', authMiddleware())
  app.get('/protected', (c) => c.json({ ok: true, payload: c.get('jwtPayload') }))
  return app
}

describe('authMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const app = buildApp(vi.fn())
    const res = await app.request('/protected')
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when Authorization header does not start with "Bearer "', async () => {
    const app = buildApp(vi.fn())
    const res = await app.request('/protected', { headers: { Authorization: 'Basic abc123' } })
    expect(res.status).toBe(401)
  })

  it('returns 401 when Bearer prefix is present but token is empty (line 33)', async () => {
    const verify = vi.fn()
    const app = buildApp(verify)
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer ' } })
    expect(res.status).toBe(401)
    expect(verify).not.toHaveBeenCalled()
  })

  it('returns 401 when tokenService.verify resolves null (invalid/expired token)', async () => {
    const app = buildApp(vi.fn().mockResolvedValue(null))
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer bad-token' } })
    expect(res.status).toBe(401)
  })

  it('sets jwtPayload and calls next() when the token verifies', async () => {
    const claims = { sub: 'user-1', email: 'a@b.com' }
    const app = buildApp(vi.fn().mockResolvedValue(claims))
    const res = await app.request('/protected', { headers: { Authorization: 'Bearer good-token' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, payload: claims })
  })
})
```

### Task 2 — `kanban-reorder.ts` (extraction from `use-kanban-drag.ts`)

Exact interface, following the `fractional.ts` precedent (plain exported
functions, no class):

```ts
// apps/dashboard/src/features/content-kanban/utils/kanban-reorder.ts
import { arrayMove } from '@dnd-kit/sortable'
import type { KanbanCardDisplayModel } from '../types'
import { positionBetween } from './fractional'

/** Extracts the column value out of a droppable id of the shape "col:<value>". */
export function colValueFromDroppableId(id: string): string | null {
  if (id.startsWith('col:')) {
    const val = id.slice(4)
    return val === '__null__' ? null : val
  }
  return null
}

export interface ResequencedCards {
  cards: KanbanCardDisplayModel[]
  /** entryId -> newly assigned position, for cards that had a null/colliding position. */
  updatedPositions: Map<string, string>
}

/**
 * Dedupes position collisions (demoting the later duplicate to null), sorts by
 * position ascending with null values sunk to the end, then assigns unique
 * synthetic positions to any remaining null entries.
 */
export function resequenceCards(cards: KanbanCardDisplayModel[]): ResequencedCards {
  const seen = new Set<string>()
  for (const card of cards) {
    if (card.position !== null) {
      if (seen.has(card.position)) {
        card.position = null
      } else {
        seen.add(card.position)
      }
    }
  }

  const sorted = cards.sort((a, b) => {
    if (a.position === null && b.position === null) return 0
    if (a.position === null) return 1
    if (b.position === null) return -1
    return a.position < b.position ? -1 : a.position > b.position ? 1 : 0
  })

  let lastPos: string | null = null
  const updatedPositions = new Map<string, string>()

  for (const card of sorted) {
    if (card.position === null) {
      card.position = positionBetween(lastPos, null)
      updatedPositions.set(card.entryId, card.position)
    }
    lastPos = card.position
  }

  return { cards: sorted, updatedPositions }
}

/**
 * Computes the (before, after) position bounds for inserting `entryId` at the
 * spot currently occupied by `overId` within `cards`. Shared by onDragMove
 * (same-column preview) and onDragEnd (final commit) — previously duplicated
 * inline in both.
 */
export function computeReorderBounds(
  cards: KanbanCardDisplayModel[],
  entryId: string,
  overId: string,
): { before: string | null; after: string | null } {
  const allIds = cards.map(c => c.entryId)
  const fromIdx = allIds.indexOf(entryId)
  const toIdx = allIds.indexOf(overId)

  let before: string | null
  let after: string | null

  if (fromIdx >= 0 && toIdx >= 0) {
    const reordered = arrayMove(cards, fromIdx, toIdx)
    const newIdx = reordered.findIndex(c => c.entryId === entryId)
    before = reordered[newIdx - 1]?.position ?? null
    after = reordered[newIdx + 1]?.position ?? null
  } else {
    before = cards[cards.length - 1]?.position ?? null
    after = null
  }

  // Guard: if cache still has a collision after deduplication, clamp `after`
  // to null rather than letting positionBetween crash with "a0 >= a0".
  if (before !== null && after !== null && before >= after) after = null

  return { before, after }
}
```

**Cross-column insertion bounds are NOT covered by `computeReorderBounds`** — the
cross-column branch in `onDragMove`/`onDragEnd` (destCards findIndex + before/after
from `overCardIdx - 1`/`overCardIdx`) is structurally different (no `arrayMove`,
searches `destCards` not the reordered source list) and stays inline in the hook;
extracting it would force an artificial shared signature for two genuinely
different operations (YAGNI). Only the same-column arrayMove-based path — which
was byte-for-byte duplicated between the two callbacks — is extracted.

**Integration into `use-kanban-drag.ts`:**
- Replace the inline dedupe/sort/assign block (lines ~63–98) inside
  `getCardsFromCache` with `const { cards: sorted, updatedPositions } = resequenceCards(cards)`,
  then use `updatedPositions` in place of the existing `updatedItemsMap` for the
  cache write-back (same semantics, renamed variable only).
- Replace the same-column `before`/`after` block in `onDragMove` (lines 224–236)
  with `const { before, after } = computeReorderBounds(srcCards, entryId, String(over.id))`.
- Replace the same-column `before`/`after` block in `onDragEnd` (lines 343–358)
  with `const { before, after } = computeReorderBounds(srcCards, entryId, effectiveOverId)`.
- Remove the now-dead local `colValueFromDroppableId` function (lines 124–130);
  import it from `kanban-reorder.ts` instead. Two call sites (`onDragMove` line
  197, `onDragEnd` line 315) update their import, not their call shape.
- Delete the commented-out `writeDebugLog` blocks while touching these regions
  (dead code, not part of the extraction but trivial cleanup while the file is
  open) — optional, does not affect acceptance criteria.

### Task 3 — `kanban-autoscroll-math.ts` (extraction from `use-kanban-autoscroll.ts`)

```ts
// apps/dashboard/src/features/content-kanban/utils/kanban-autoscroll-math.ts

/**
 * Returns the scrollTop delta to apply given the pointer's Y position and the
 * scroll container's bounding rect: negative near the top edge, positive near
 * the bottom edge, zero elsewhere.
 */
export function scrollDelta(
  pointerY: number,
  rect: { top: number; bottom: number },
  edgePx: number,
  speed: number,
): number {
  if (pointerY - rect.top < edgePx) return -speed
  if (rect.bottom - pointerY < edgePx) return speed
  return 0
}
```

**Integration into `use-kanban-autoscroll.ts`:** inside `tick()`, replace:
```ts
if (y - rect.top < EDGE_PX) {
  el.scrollTop -= SCROLL_SPEED
} else if (rect.bottom - y < EDGE_PX) {
  el.scrollTop += SCROLL_SPEED
}
```
with:
```ts
const delta = scrollDelta(y, rect, EDGE_PX, SCROLL_SPEED)
if (delta !== 0) el.scrollTop += delta
```
Add `import { scrollDelta } from './kanban-autoscroll-math'` at the top.

### Task 4 — `kanban-reorder.test.ts`

Cover:
- `colValueFromDroppableId`: `"col:done"` → `"done"`; `"col:__null__"` → `null`;
  `"something-else"` → `null`.
- `resequenceCards`: (a) all-null positions get sequential synthetic positions
  in original array order; (b) a duplicate position on the second card is
  demoted to null then re-assigned after the first; (c) mixed real ascending
  positions with an interspersed null are sorted with the null sunk to the end;
  (d) `updatedPositions` map contains exactly the entryIds that changed.
- `computeReorderBounds`: (a) moving a card earlier in a 3+ card list returns
  the correct before/after pair; (b) `overId` not found in `cards` falls back
  to appending at the end (`before` = last card's position, `after` = null);
  (c) a collision case where the naive before/after would satisfy
  `before >= after` is clamped to `after = null`.

### Task 5 — `kanban-autoscroll-math.test.ts`

Cover: pointer within `edgePx` of `rect.top` → returns `-speed`; pointer within
`edgePx` of `rect.bottom` → returns `+speed`; pointer in the dead zone between
→ returns `0`; boundary values (`pointerY - rect.top === edgePx` exactly) →
returns `0` (strict `<`, not `<=`).

### Task 6 — `fractional.test.ts`

Cover: `positionBetween(null, null)` returns a non-empty string; calling it
repeatedly with the previous result as `before` produces strictly ascending
keys (`a < b`); `positionBetween(a, c)` where `a < c` returns a key `b` with
`a < b < c`; `rebalanceKeys(n)` returns exactly `n` keys, strictly ascending,
with no duplicates.

### Task 7 — `kanban-card-display.test.ts`

Cover `buildKanbanCardDisplayModel`:
- Legacy heuristic path (no `card`/`seed` args): picks the first non-system
  string field as title, first field containing `/` or starting with `http`
  as image source.
- `resolveImageUrl`: plain string → trimmed as-is; JSON-stringified object with
  `url`/`src`/`path` → resolves nested value; plain object with `src` → resolved;
  object with none of `url`/`src`/`path` → `undefined`.
- `toPlainText`: strips HTML tags and collapses whitespace from a string;
  number/boolean → `String(value)`; array → space-joined recursive results;
  nested object → space-joined `Object.values` recursive results.
- Slot-resolution path (`card` + `seed` both provided): `media`/`header`/
  `subtitle`/`metadata` slots resolve via `findBranchById`; an unresolvable
  `branchId` yields `undefined` for that slot (and is filtered out of `metadata`).
- `statusBadge`: `undefined` when `entry.status === 'published'`, otherwise the
  status string.
==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `npx tsc --noEmit` in `apps/api/` — verifies the new test file compiles.
- `npx tsc --noEmit` in `apps/dashboard/` — verifies the two extracted modules
  and updated hooks type-check.
- `pnpm exec vitest run --coverage` in `apps/api/` — confirm
  `auth.middleware.ts` reaches 100% lines/branches (line 33 now hit).
- `pnpm exec vitest run --coverage` in `apps/dashboard/` — confirm
  `fractional.ts` and `kanban-card-display.ts` are no longer at/near 0%, and
  the two new `kanban-reorder.ts`/`kanban-autoscroll-math.ts` files appear in
  the report at effectively 100% (pure functions, fully exercised by their
  dedicated unit tests).
- `pnpm beech test --diff` — re-run the local per-file gate; expect the file
  count below-threshold to drop relative to Sprint 1's baseline (52/187) by
  exactly the files touched here (`auth.middleware.ts` moves from passing-via-
  integration-only to passing directly; `fractional.ts` and
  `kanban-card-display.ts` move from failing to passing; the two new files
  start at ~100%).
- `git diff --stat` — confirm the only modified *existing* source files are
  `use-kanban-drag.ts` and `use-kanban-autoscroll.ts`, and both diffs are
  extraction-only (no behavior change): re-read the full diff and confirm no
  line outside the documented replacements changed.
==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `auth.middleware.ts` reaches 100% line and branch coverage; line 33 is hit
      by a dedicated unit test (not only by pre-existing integration flows).
- [ ] `kanban-reorder.ts` and `kanban-autoscroll-math.ts` exist, export exactly
      the functions specified in SECTION 4, contain zero React/DOM/queryClient
      imports (pure functions only).
- [ ] `use-kanban-drag.ts` and `use-kanban-autoscroll.ts` external behavior is
      unchanged — `content-kanban.tsx` and any other consumer requires zero
      edits (verified via `graphify affected` re-check showing the same
      consumer set as SECTION 2).
- [ ] `fractional.ts` and `kanban-card-display.ts` move off 0%/near-0% coverage
      with no source-code changes to either file.
- [ ] Neither `apps/dashboard/vitest.config.ts` nor `sonar-project.properties`
      is modified in this sprint — the new helper modules count without any
      glob change.
- [ ] `scripts/test-coverage-diff.mjs` not modified.
- [ ] No `.tsx` file created or modified.
- [ ] No cross-feature import introduced (`content-kanban` imports stay inside
      `content-kanban/`; `auth.middleware.test.ts` imports stay inside
      `middleware/` + `../types`).
- [ ] `npx tsc --noEmit` passes in both `apps/api/` and `apps/dashboard/`.
- [ ] `pnpm beech test --diff` shows zero new failures beyond Sprint 1's
      known baseline; all 7 new/modified files pass their own threshold.
==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Extracting the cross-column insertion-bounds logic in `onDragMove`/`onDragEnd`
  — structurally distinct from the same-column `arrayMove` path (see Task 2
  rationale); not duplicated code, no extraction justified by YAGNI.
- `use-kanban-board.ts` reducer — remains excluded glue; the feature brief and
  ROADMAP scope this sprint to `use-kanban-drag.ts` and `use-kanban-autoscroll.ts`
  only.
- Repository carve-out candidates (`d1-widget.repository.ts`,
  `content.repository.d1.ts`, `automations.repository.d1.ts`) — deferred, per
  feature brief §4, to a future architecture/implementation pass; not this
  sprint's ROADMAP entry.
- `apps/dashboard` dead `src/features/fields/**` exclusion globs (module now at
  `src/components/fields/**`) — flagged during Sprint 1's review as
  pre-existing drift, explicitly out of scope for both Sprint 1 and this
  sprint; needs its own future sprint entry.
- Automation rule evaluator tests (mentioned in feature brief §3 user stories)
  — no evidence in current coverage data of an untested automation evaluator
  distinct from the existing `automations/evaluator` suite (76–98% covered
  already); not part of this sprint's concrete deliverables.
- Renegotiating the 80% SonarQube threshold or modifying
  `scripts/test-coverage-diff.mjs` — fixed external constraints, per feature
  brief §5.
- End-to-end/`renderHook` testing of `useKanbanDrag`/`useKanbanAutoscroll`
  themselves — only their extracted pure sub-logic is tested, per feature
  brief rule 3.
