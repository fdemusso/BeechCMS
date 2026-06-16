# Runtime Seeds — Sprint 11: Bounded `repeater` via `minItems` / `maxItems`

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprint 10** (`repeater` promoted to a core `BranchType`). Read
> [`10-repeater-core-branchtype.md`](./10-repeater-core-branchtype.md) and
> [`00-overview.md`](./00-overview.md) first.
>
> **Status: READY.** Small, self-contained, additive. One sprint file — no phase split
> needed.

---

## 0. Why this sprint exists (and what it deliberately is NOT)

GitHub issue *"Support complex object types as column values"* (issue #21) predates the
`repeater` field. It proposed a new `type: 'object'` column shaped like
`{ text, image: { path, format } }`, with five acceptance criteria.

**Decision (already taken — do not relitigate):** `repeater` (sprint 10) already
supersedes 4 of the 5 acceptance criteria — it declares a sub-schema (`Branch.fields`),
validates nested payloads on write, round-trips the full structure through
`GET /api/content/:slug`, and leaves scalar columns untouched. Introducing a separate
`object` `BranchType` would be a near-duplicate of `repeater` spread across ~15 `switch
(branch.type)` sites (engine DDL, serialize/deserialize, FTS/index/junction skips, retype
guards, registries, `BRANCH_TYPES[]` arrays) — high surface, high regression risk, and
**zero** semantic gain over expressing "object" as a `repeater` capped at one item.

The rich **object-display** in the content table (text + image thumbnail rendered inline)
and **image sub-fields** were evaluated and judged **not worth it** for this use case —
they are explicitly **out of scope**. See §7 (Do NOT).

**This sprint delivers the one missing primitive:** *cardinality bounds* on a repeater.
`minItems` / `maxItems` let a `repeater` express "a list of N..M items", and in particular
`minItems: 1, maxItems: 1` expresses "exactly one object" — the closest faithful model of
the issue's intent without cloning the core. That is the entire deliverable.

The change is **additive and isolated**: an optional `.min()/.max()` on an existing Zod
array, a boot-time sanity check, and a light dashboard guard so the editor's add/remove
buttons respect the bounds. No engine/DDL/serialization changes. No new `BranchType`.

---

## 1. Data model — `packages/core/src/types.ts`

Add two optional, repeater-only fields to `Branch`. They are ignored by the Botanical
Engine for every other branch type (no SQL, no serialization impact — a repeater is still
one JSON `TEXT` column regardless of bounds).

Current `Branch` already carries the repeater sub-schema (`fields`, lines ~138–145).
Add the bounds right after it:

```ts
// packages/core/src/types.ts — inside interface Branch, after `fields?: Branch[]`

  /**
   * Minimum number of items a `repeater` value must contain when a value is
   * provided. Repeater-only — ignored for every other branch type.
   *
   * NOTE: this constrains array *length when the field is present*. It does NOT by
   * itself make the field mandatory — an absent/null payload is still allowed unless
   * `requiredOnCreate` / `requiredOnUpdate` is also set. To model "exactly one
   * required object", combine `minItems: 1, maxItems: 1, requiredOnCreate: true`.
   * Must be a non-negative integer and `<= maxItems` when both are set
   * (enforced at boot by seed-validation.ts).
   */
  minItems?: number

  /**
   * Maximum number of items a `repeater` value may contain. Repeater-only — ignored
   * for every other branch type. `maxItems: 1` models a single "object" column.
   * Must be a non-negative integer and `>= minItems` when both are set.
   */
  maxItems?: number
```

No other type changes. `BranchType` is **unchanged** — there is no `'object'`.

---

## 2. Validation — `packages/core/src/validation.ts`

### 2.1 Apply the bounds in `repeaterSchema`

Current implementation (≈ lines 443–457):

```ts
function repeaterSchema(branch: Branch, options: ResolvedOptions): z.ZodTypeAny {
  const requiredFlag = options.operation === 'create' ? 'requiredOnCreate' : 'requiredOnUpdate'
  const subBranches = (branch.fields ?? []).filter((sub) => !REPEATER_DISALLOWED_SUBTYPES.has(sub.type))

  const shape: Record<string, z.ZodTypeAny> = {}
  for (const sub of subBranches) {
    const subSchema = schemaForBranch(sub, options)
    shape[sub.alias] = sub[requiredFlag] ? subSchema : subSchema.optional()
  }
  const itemSchema = z.object(shape)
  const arraySchema = z.array(itemSchema)
  return withNullable(withEmptyPreprocessing(arraySchema, options.allowNull), options.allowNull)
}
```

Change only the `arraySchema` construction:

```ts
  let arraySchema = z.array(itemSchema)
  if (Number.isInteger(branch.minItems) && (branch.minItems as number) >= 0) {
    arraySchema = arraySchema.min(branch.minItems as number, {
      message: `Expected array(min:${branch.minItems})`,
    })
  }
  if (Number.isInteger(branch.maxItems) && (branch.maxItems as number) >= 0) {
    arraySchema = arraySchema.max(branch.maxItems as number, {
      message: `Expected array(max:${branch.maxItems})`,
    })
  }
  return withNullable(withEmptyPreprocessing(arraySchema, options.allowNull), options.allowNull)
```

**Semantics to preserve (and the reason it is correct):**
`withEmptyPreprocessing` maps `''`/`null` → `undefined`/`null` and makes the schema
`.optional()`. So:
- An **absent / null / empty-string** value still passes — bounds apply only when a value
  is present. Presence is governed by `requiredOnCreate`/`requiredOnUpdate` (the seed-level
  `.optional()` wrap in `compileSeedSchema`, ≈ line 531) and by `detectMissingRequired`,
  **not** by `minItems`. This is intentional — keep it.
- An **explicitly provided `[]`** is *not* `''`/`null`, so it reaches `z.array().min(1)`
  and **fails** when `minItems >= 1`. Correct.
- An array longer than `maxItems` fails. Correct.

Mirror is automatic: both internal and public API paths share
`validateAndSanitizeSeedPayload`, so a single change covers both (sprint 10 §3 pattern).

### 2.2 Invalidate the schema cache on bound changes

`buildSeedFingerprint` (≈ lines 486–504) feeds `buildCacheKey`. It currently omits
`minItems`/`maxItems`, so two seeds differing only by bounds would collide in
`seedSchemaCache`. Add the bounds to the per-branch fingerprint:

```ts
  const parts = seed.branches.map((branch) => ({
    a: branch.alias,
    t: branch.type,
    f: branch.format ?? null,
    m: branch.multiple === true,
    rc: branch.requiredOnCreate === true,
    ru: branch.requiredOnUpdate === true,
    n: branch.numberOptions ?? null,
    fi: branch.fileOptions ?? null,
    mi: branch.minItems ?? null,   // NEW
    ma: branch.maxItems ?? null,   // NEW
    sub: branch.fields?.map((sub) => ({ /* unchanged */ })) ?? null,
  }))
```

---

## 3. Boot-time sanity check — `packages/core/src/seed-validation.ts`

The repeater sub-field constraints live in the **"Fatal 10"** block (≈ lines 132–172).
Add a sibling block right after it. Rules:

- **Fatal** if `minItems`/`maxItems` is set but **not** a non-negative integer.
- **Fatal** if both set and `minItems > maxItems`.
- **Warning** (non-fatal) if `minItems`/`maxItems` is set on a **non-repeater** branch —
  the engine ignores it; surface it so authors don't think it does anything.

```ts
  // ── Fatal 11 / Warning 8: repeater cardinality bounds ────────────────────
  {
    for (const seed of seeds) {
      const fatals: string[] = []
      const warnings: string[] = []
      for (const branch of seed.branches) {
        const hasBounds = branch.minItems !== undefined || branch.maxItems !== undefined
        if (!hasBounds) continue

        if (branch.type !== 'repeater') {
          warnings.push(
            `branch '${branch.alias}': minItems/maxItems are ignored on type ` +
            `'${branch.type}' (repeater-only).`,
          )
          continue
        }
        for (const [key, val] of [['minItems', branch.minItems], ['maxItems', branch.maxItems]] as const) {
          if (val !== undefined && (!Number.isInteger(val) || val < 0)) {
            fatals.push(`branch '${branch.alias}': ${key} must be a non-negative integer (got ${val}).`)
          }
        }
        if (
          Number.isInteger(branch.minItems) && Number.isInteger(branch.maxItems) &&
          (branch.minItems as number) > (branch.maxItems as number)
        ) {
          fatals.push(
            `branch '${branch.alias}': minItems (${branch.minItems}) must be <= maxItems (${branch.maxItems}).`,
          )
        }
      }
      if (fatals.length > 0) result.push({ slug: seed.slug, messages: fatals, fatal: true })
      if (warnings.length > 0) result.push({ slug: seed.slug, messages: warnings, fatal: false })
    }
  }
```

> Match the exact `result.push({ slug, messages, fatal })` shape used by the surrounding
> blocks — verify the live `ValidationIssue`/result type before committing.

---

## 4. Dashboard — light guard so the editor respects the bounds

This is the **only** dashboard change. It is intentionally minimal: keep the add/remove
buttons honest. No object-display, no thumbnail, no single-object form rewrite (out of
scope, §7).

### 4.1 Enforce bounds in the repeater editor — `apps/dashboard/src/features/fields/edit/repeater.tsx`

For a real content field, the bounds are on the `branch` itself (`branch.minItems` /
`branch.maxItems`). Read them, then:

- Disable / hide the **Add** button when `items.length >= maxItems`.
- Disable the per-item **remove** when `items.length <= minItems`.

```ts
// inside FieldEditRepeater, after `const items = ...`
const maxItems = typeof branch.maxItems === 'number' ? branch.maxItems : Infinity
const minItems = typeof branch.minItems === 'number' ? branch.minItems : 0
const canAdd = items.length < maxItems
const canRemove = items.length > minItems
```

- Gate `add()` on `canAdd`; render the Add `<Button>` with `disabled={!canAdd}` (or hide
  it entirely when `maxItems === 1 && items.length === 1`).
- Pass `canRemove` down so `GenericItemRow` / `BranchItemRow` disable their remove control
  when `!canRemove` (thread a `disableRemove` prop; the rows already own the Trash button).

> The `branchItemContext`/`repeater` meta wrapper (used by the Seed Builder's sub-field
> editor) does **not** carry bounds — bounds only apply to top-level content repeaters.
> Reading `branch.minItems`/`branch.maxItems` directly is correct and a no-op for the
> builder path (those are undefined there → `Infinity`/`0` → unchanged behavior).

### 4.2 (Optional, small) Author bounds in the Seed Builder — `repeater-branch-item.tsx`

Inside the existing `branch.type === "repeater" && !subField` section (≈ lines 294–313),
add two `min=0` numeric inputs bound to `set("minItems", n)` / `set("maxItems", n)`.
Empty input → `undefined` (clears the bound). If you skip this, bounds are authored in
`seed.ts` and pushed via the CLI — acceptable for v1.

---

## 5. Tests

- **core/validation**
  - `maxItems: 2` → a 3-item array fails; a 2-item array passes.
  - `minItems: 1` → an explicit `[]` fails; a 1-item array passes.
  - `minItems: 1` with the field **absent/null** still passes (bounds gate length only,
    not presence) — and **fails** when `requiredOnCreate: true` is also set.
  - `minItems: 1, maxItems: 1` round-trips exactly one item; rejects 0 (when provided) and 2.
  - bounds on a non-repeater branch do not affect that branch's validation.
  - schema cache: two seeds identical except for `maxItems` compile to different schemas
    (no `seedSchemaCache` collision).
- **core/seed-validation**
  - `minItems: -1` → fatal; `maxItems: 1.5` → fatal; `minItems: 2, maxItems: 1` → fatal.
  - `minItems` on a `text` branch → warning, non-fatal.
  - valid `minItems: 1, maxItems: 1` on a repeater → no issues.
- **dashboard**
  - `FieldEditRepeater` with `maxItems: 1` and one item: Add is disabled/hidden.
  - with `minItems: 1` and one item: the item's remove control is disabled.

---

## 6. Acceptance criteria

- [ ] `Branch.minItems` / `Branch.maxItems` typed in `@beechcms/core`, documented as
      repeater-only and ignored elsewhere.
- [ ] `repeaterSchema` applies `.min()/.max()`; absence-vs-`[]` semantics preserved;
      `buildSeedFingerprint` includes the bounds (no cache collision).
- [ ] Boot validation: non-integer/negative bound → fatal; `minItems > maxItems` → fatal;
      bounds on a non-repeater → warning.
- [ ] Dashboard editor disables Add at `maxItems` and remove at `minItems`.
- [ ] `minItems: 1, maxItems: 1` yields a working "single object" repeater end-to-end
      (author → validate → write → read).
- [ ] No new `BranchType`; engine DDL, serialization, FTS/index/junction, and retype
      paths are **untouched**.
- [ ] `pnpm run build` / `pnpm run test` green in `packages/core` and `apps/dashboard`.

---

## 7. Do NOT

- Do **not** add an `'object'` `BranchType`. "Object" = `repeater` with `maxItems: 1`.
- Do **not** build the rich object-display (inline text + image thumbnail in the content
  table). `RepeaterDisplay` keeps showing the item-count summary. Out of scope.
- Do **not** relax the repeater sub-field restriction to allow `file`/`image`
  (`REPEATER_DISALLOWED_SUBTYPES` stays `{repeater, relation, file}` in `validation.ts`,
  `seed-validation.ts`, and `repeater-generic-item.tsx`). An image inside an object is a
  separate, deferred concern — model it as a `text` URL sub-field if ever needed.
- Do **not** touch `engine.ts` — bounds are a validation/UI concern; the SQL column and
  serialize/deserialize for a repeater are unchanged whatever the cardinality.
- Do **not** make `minItems` imply required-ness — keep presence governed by
  `requiredOnCreate`/`requiredOnUpdate`; document the combination instead.
- Do **not** propagate bounds into the Seed Builder's sub-field editor — bounds are a
  top-level content-repeater concept only.

---

## 8. Closing the issue

After this lands, close issue #21 as **resolved-by-repeater**: 4/5 acceptance criteria
were already met by sprint 10; this sprint adds the cardinality primitive that lets a
`repeater` model a bounded set — and, at `maxItems: 1`, a single object — which is the
faithful, low-risk realization of the original request. The literal `type: 'object'`
column and its bespoke object-table rendering are explicitly declined as not worth the
core duplication for the use case.
