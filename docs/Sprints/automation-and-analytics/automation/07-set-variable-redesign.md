# Sprint 07 — Set Variable Redesign

> **Prerequisites**: Sprints 06 and 06-fix have shipped and are green. The runner
> already wires `variables` into the resolver via `withVariables()`. This sprint
> builds on:
> - `packages/core/src/automations.types.ts`
> - `packages/core/src/seed-registry.ts`
> - `apps/api/src/features/automations/template-grammar.ts`
> - `apps/api/src/features/automations/automation-runner.ts`
> - `apps/api/src/features/automations/action-executors/set-variable.executor.ts`
> - `apps/api/src/features/automations/automations.schema.ts`
> - `apps/dashboard/src/features/automations/schema/automation.schema.ts`
> - `apps/dashboard/src/features/automations/components/action-forms/set-variable-form.tsx`
> - `apps/dashboard/src/features/automations/components/automation-editor/use-automation-editor.ts`

---

## 1. Why this sprint

The current `SetVariableAction` (06-fix) has three structural limits:

1. **`load_type: 'fruit' | 'branch'` is ambiguous.** The split between a single
   object and a collection does not map cleanly to author intent. Authors want
   to express *"this specific customer"* (one record by id) or *"the orders
   table"* (a collection), not pick an internal implementation flag.

2. **A "fruit" requires `filters`, not an id.** To load one record an author
   has to build `filters: [{ field: 'id', op: 'eq', value: '...' }]`. The
   intent is trivial but the UI is verbose. A single `fixed_id` field is
   sufficient.

3. **Template access on collections is flat.** Collections currently expose
   `.count`, `.sum.X`, `.avg.X`, `.pluck.X` only. There is no way to filter
   in the template or to pin a subset by id list. This forces authors to
   chain extra `set_variable` blocks for every variation.

This sprint resolves all three with additive, backward-compatible changes.

---

## 2. Current state (do not re-explore)

### 2.1 `SetVariableAction` shape — `packages/core/src/automations.types.ts:46`

```ts
export interface SetVariableAction {
  type: 'set_variable'
  name: string
  seed_slug: string
  load_type: 'fruit' | 'branch'
  filters: TriggerCondition[]
  order_by?: string
  order?: 'asc' | 'desc'
}
```

### 2.2 Executor — `apps/api/src/features/automations/action-executors/set-variable.executor.ts`

- Resolves `targetSeed` from `ctx.getSeed(action.seed_slug)`.
- `interpolate()` is applied to string filter values against
  `{ this: ctx.entry, ...ctx.variables }` so filters can reference previously
  set variables and the trigger entry.
- Filters are mapped through `conditionToFilterGroup` (`filter-translation.ts`).
- Calls `ctx.repository.findMany(seed, { filters, status: null, pagination: { limit, offset: 0 }, orderBy })`.
- Branch path emits `{ count, sum: {alias: n}, avg: {alias: n}, pluck: {alias: 'a, b, c'} }`
  over `targetSeed.branches`.

### 2.3 Variable access in templates — `apps/api/src/features/automations/automation-runner.ts:24`

```ts
function withVariables(base: ResolvedContext, variables: Record<string, unknown>): ResolvedContext {
  return {
    triggerEntry: base.triggerEntry,
    lookup(parsed, onMissing) {
      if (parsed.kind === 'simple') {
        const varVal = resolvePath(variables, parsed.path)
        if (varVal !== undefined) return varVal
      }
      return base.lookup(parsed, onMissing)
    },
  }
}
```

`resolvePath` (from `automation-runner.utils.ts:103`) walks plain dot-paths.
`{{cliente.email}}` and `{{ordini.count}}` already work. `{{ordini.array[id1,id2].count}}`
and `{{ordini.count.(status=paid)}}` do **not** — `resolvePath` cannot parse
`array[...]` or `.(...)` segments.

### 2.4 Persistence — `apps/api/src/shared/automations.repository.d1.ts`

Actions are persisted as a single JSON column (`actions: TEXT`). Adding or
dropping fields requires no migration; existing rows keep their original
shape until the automation is saved again.

### 2.5 Seed registration — `apps/api/src/index.ts:21` & `packages/core/src/seed-registry.ts:39`

`SeedRegistry` is constructed once per request lifecycle from `seed.ts`. Its
constructor (line 43) is the natural place to enforce reserved-alias rules.
The standalone `SEED_REGISTRY` object in `packages/core/src/seeds.ts` is a
legacy helper and is not used by the API runtime — do **not** put validation
there.

---

## 3. Design

### 3.1 New `SetVariableAction` shape

```ts
// packages/core/src/automations.types.ts
export interface SetVariableAction {
  type: 'set_variable'
  name: string                       // validated against AUTOMATION_RESERVED_WORDS
  seed_slug?: string                 // omitted → uses the automation's trigger seed
  fixed_id?: string                  // present → "single record by literal id" mode
  column?: string                    // optional pin to a single branch alias
  filters?: TriggerCondition[]       // only applies in collection mode
  order_by?: string                  // collection mode only
  order?: 'asc' | 'desc'             // collection mode only
  /** @deprecated Read but ignored at runtime. Removed on next save. */
  load_type?: 'fruit' | 'branch'
}
```

**Mode detection** (single source of truth, no `load_type` switch):

- `fixed_id !== undefined` → **single-record mode** (one object, fetched by id).
- `fixed_id === undefined` → **collection mode** (full table, capped at 1000).

### 3.2 Backward compatibility (read path)

The executor and the form must continue to load rows persisted with the old
shape. Rules (executor-side, applied **only** when `fixed_id` is undefined):

| Stored shape | Treat as |
|---|---|
| `load_type: 'fruit'` + a single `{field:'id', op:'eq', value:'<v>'}` filter | single-record mode with `fixed_id = '<v>'` (synthetic) |
| `load_type: 'fruit'` + any other filter shape | single-record mode with `pagination.limit = 1` and the original filters preserved (degraded behavior) |
| `load_type: 'branch'` (anything) | collection mode |
| neither field set | collection mode |

The form rewrites stored actions into the new shape on first save (see §3.6).

### 3.3 Variable materialization in the runner context

#### Single-record mode (`fixed_id` present)

```ts
const { items } = await ctx.repository.findMany(seed, {
  filters: [{ column: 'id', type: 'system', conditions: [{ op: 'eq', value: action.fixed_id }] }],
  status: null,
  pagination: { limit: 1, offset: 0 },
})
const item = items[0] ?? null
ctx.variables[name] = action.column
  ? (item ? { _value: item[action.column] } : null)
  : item
```

Behavior:
- Missing record → `variables[name] = null`, `console.warn` once with the
  variable name and missing id. Templates resolve to `defaultValue` (do not throw).
- With `column` pin → `variables[name] = { _value: item[column] }` so
  `{{varname}}` returns the scalar via existing `resolvePath` behavior.

#### Collection mode (`fixed_id` absent)

The executor builds a rich object and writes it once:

```ts
{
  // navigation
  firstone: Record<string, unknown> | null,   // ORDER BY created_at ASC, limit 1
  lastone:  Record<string, unknown> | null,   // ORDER BY created_at DESC, limit 1

  // aggregates over _items
  count: number,
  sum:   Record<string, number>,   // number-typed branches only
  avg:   Record<string, number>,
  min:   Record<string, number>,
  max:   Record<string, number>,
  pluck: Record<string, string>,   // top 100 values joined with ", "; appends " …" if truncated

  // raw rows — not directly exposed in templates; consumed by array[] and inline conditions
  _items: Array<Record<string, unknown>>,  // capped at 1000, post-filter
}
```

`firstone` / `lastone` come from the same `_items` array (no extra query):
- `firstone = _items.reduce(min by created_at)` (or `_items[0]` if sorted ASC).
- `lastone  = _items.reduce(max by created_at)` (or `_items[0]` if sorted DESC).

If `column` is pinned in collection mode, only the pinned alias is computed:

```ts
{ count, sum: <number>, avg: <number>, min: <number>, max: <number>, pluck: <string>, _items }
```

In this shape `{{varname.count}}` counts rows where `r[column]` is non-null.

Templates like `{{ordini.firstone.total}}`, `{{ordini.sum.total}}`,
`{{ordini.count}}` flow through the existing dot-path resolver — **no parser
change is required for these**.

### 3.4 Template grammar extensions

New forms required only when the path contains `[` or `.(`. Other shapes keep
flowing through `resolvePath`.

#### Array selector

```
{{varname.array[id1,id2,id3]}}
{{varname.array[id1,id2].campo}}
{{varname.array[id1,id2].count}}
{{varname.array[id1,id2].sum.campo}}
```

Semantics: filter `_items` by primary key (`id`), then apply the standard
collection logic on the subset. A 1-element list with a field accessor yields
the scalar value of that field.

#### Inline conditions `.(column op value)`

May be appended after any navigation, aggregate, or array selector:

```
{{varname.count.(status=paid)}}
{{varname.sum.total.(status=paid)}}
{{varname.firstone.id.(status=paid)}}
{{varname.array[id1,id2].count.(amount>100)}}
{{varname.array[id1,id2].(status=paid).count}}
```

Rules:
- Operators: `=`, `!=`, `<`, `>`, `<=`, `>=` (single comparison per parentheses).
- Numeric coercion mirrors `query-builder.ts`: parse both sides as `Number`
  when either side is numeric; fall back to string comparison otherwise.
- Multiple parentheses are AND-chained left-to-right.
- Values are **literal strings**. Interpolation inside `(...)` (e.g.
  `.(status={{this.target_status}})`) is **out of scope** — see §8.

### 3.5 Reserved words

Single source of truth in `template-grammar.ts`:

```ts
export const AUTOMATION_RESERVED_WORDS = new Set([
  // sprint 06 scopes and selectors
  'this', 'batch', 'all', 'firstone', 'lastone', 'byid', 'where',
  // sprint 07 selector
  'array',
  // aggregates
  'count', 'sum', 'avg', 'min', 'max', 'pluck',
  // literals
  'true', 'false', 'null',
])
```

Enforcement points:
- **API zod schema** (`automations.schema.ts`): reject `name` in reserved.
- **Dashboard zod schema** (`automation.schema.ts`): same rule for inline form errors.
- **`SeedRegistry` constructor** (`seed-registry.ts`): throw when any
  `branch.alias` is reserved. This is a developer-time guard fired at app
  startup — by design loud and synchronous.
- **UI**: the variable-name input shows an inline error if the value is
  reserved (the schema already produces the error; surface its message under
  the field).

### 3.6 UI redesign — `SetVariableForm`

Replace the load-type select + filter builder with a single source field plus
a conditional expansion.

```
Name           [ cliente            ]   (error: reserved word)

Source         [ ⌄ choose a table or paste an ID ]   (combobox; free-text → fixed_id)

Column (opt.)  [ ⌄ — all columns —          ]   (collection mode only)

Filters        [+] field ▾  op ▾  value          (collection mode only)
```

**Combobox** — implement using the existing shadcn `Command` + `Popover`
primitives (`apps/dashboard/src/components/ui/{command,popover}.tsx`). The
file `apps/dashboard/src/features/command-palette/command-palette.tsx` is a
working reference for this pattern. Options list:

- Top item: the automation's trigger seed labelled "(this seed)".
- Then every entry from `useSchema()` (already used by the current form).
- Free-text that does not match any slug → `fixed_id` mode.

**Mode detection** (in the form):
- Typed value matches a seed slug → collection mode: show column + filters,
  hide "fixed id" badge.
- No match → single-record mode: show a "Fixed ID: {value}" badge, hide
  column and filter inputs.

**Template hint panel** (live update under the form):

```
Collection mode — template access:
  {{clienti}}                          → full rich object
  {{clienti.firstone.nome}}            → first record's column
  {{clienti.count}}                    → row count
  {{clienti.sum.totale}}               → sum of a numeric branch
  {{clienti.count.(status=attivo)}}    → filtered count
```

```
Single-record mode — template access:
  {{cliente}}                          → entire object (or null)
  {{cliente.nome}}                     → column value
```

(Hint text lives in i18n; do not hard-code Italian strings in the component.)

### 3.7 Schema-form alignment

The dashboard form representation (`automation.schema.ts:31`,
`ActionFormItem`) currently carries `load_type` and a flat `filters` list.
Update it to also include `fixed_id` and `column`. The conversion at
`use-automation-editor.ts:131` and `:192` must read the legacy shape and
write the new one.

---

## 4. Deliverables

```
[x] Task 1 — Update SetVariableAction in @beechcms/core
[x] Task 2 — API zod schema (set_variable + reserved-name check)
[x] Task 3 — Dashboard zod schema + form types (mirror Task 2)
[x] Task 4 — Executor rewrite (modes + materialization + legacy read)
[x] Task 5 — Template grammar: var_access kind + parser
[x] Task 6 — Resolver: var_access evaluator in withVariables
[x] Task 7 — Reserved words list + SeedRegistry guard
[x] Task 8 — UI: SetVariableForm redesign + form ↔ payload conversion
[x] Task 9 — Tests (executor + grammar + resolver + seed-registry)
[ ] Task 10 — Manual smoke + retro-compat check (requires Docker stack)
```

---

## 5. Task details

### Task 1 — Core type (`packages/core/src/automations.types.ts`)

Replace the existing `SetVariableAction` declaration at line 46 with the
shape from §3.1. Keep `load_type` as a deprecated optional field. Re-export
nothing new — `AutomationAction` is the discriminated union.

### Task 2 — API zod schema (`apps/api/src/features/automations/automations.schema.ts`)

Replace the `setVariableActionSchema` declaration at line 62 with:

```ts
import { AUTOMATION_RESERVED_WORDS } from './template-grammar'

const setVariableActionSchema = z.object({
  type: z.literal('set_variable'),
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    .refine((v) => !AUTOMATION_RESERVED_WORDS.has(v), {
      message: 'automations.editor.errors.variableNameReserved',
    }),
  seed_slug: z.string().min(1).optional(),
  fixed_id: z.string().min(1).optional(),
  column: z.string().min(1).optional(),
  filters: z.array(triggerConditionSchema).default([]),
  order_by: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  load_type: z.enum(['fruit', 'branch']).optional(),  // accepted but ignored
})
```

The rest of `automationActionSchema` does not change.

### Task 3 — Dashboard zod schema (`apps/dashboard/src/features/automations/schema/automation.schema.ts`)

1. Add `fixed_id: string` and `column: string` to `ActionFormItem`
   (line 31) and to `DEFAULT_ACTION_ITEM` (line 177; defaults: empty strings).
2. Re-export `AUTOMATION_RESERVED_WORDS` from `@beechcms/core` (add it to
   `packages/core/src/index.ts`) so the dashboard does **not** import API
   internals.
3. In the `actionFormItemSchema` `superRefine` block (around line 108) add:

```ts
if (data.type === 'set_variable') {
  if (data.name && AUTOMATION_RESERVED_WORDS.has(data.name)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'automations.editor.errors.variableNameReserved', path: ['name'] })
  }
  // seed_slug becomes optional — drop the existing seedRequired issue for set_variable
}
```

Keep `seedRequired` issue for `create_entry` only (line 144 area).

### Task 4 — Executor (`apps/api/src/features/automations/action-executors/set-variable.executor.ts`)

Replace the file's main function with a two-branch implementation. Use the
real `ActionContext` (which already provides `ctx.seed` for the trigger seed).

```ts
import type { AutomationAction, ContentRepository, Seed } from '@beechcms/core'
import { conditionToFilterGroup } from '../filter-translation'
import { interpolate } from '../automation-runner.utils'

type SetVariableAction = Extract<AutomationAction, { type: 'set_variable' }>

export async function executeSetVariable(
  action: SetVariableAction,
  ctx: {
    entry: Record<string, unknown>
    variables: Record<string, unknown>
    repository: ContentRepository
    getSeed: (slug: string) => Seed | null
    seed: Seed                              // automation's trigger seed
  },
): Promise<void> {
  const seedSlug = action.seed_slug ?? ctx.seed.slug
  const targetSeed = ctx.getSeed(seedSlug)
  if (!targetSeed) {
    console.warn(`[set_variable] seed "${seedSlug}" not found; "${action.name}" → null`)
    ctx.variables[action.name] = null
    return
  }

  // ── legacy read normalisation ─────────────────────────────────────────────
  let fixedId = action.fixed_id
  if (fixedId === undefined && action.load_type === 'fruit') {
    const idFilter = (action.filters ?? []).find(
      (f) => f.field === 'id' && f.op === 'eq' && typeof f.value === 'string',
    )
    if (idFilter) fixedId = String(idFilter.value)
  }

  // ── single-record mode ────────────────────────────────────────────────────
  if (fixedId !== undefined) {
    const unified = { this: ctx.entry, ...ctx.variables } as Record<string, unknown>
    const resolvedId = interpolate(fixedId, unified)
    const { items } = await ctx.repository.findMany(targetSeed, {
      filters: [{ column: 'id', type: 'system', conditions: [{ op: 'eq', value: resolvedId }] }],
      status: null,
      pagination: { limit: 1, offset: 0 },
    })
    const item = items[0] ?? null
    if (!item) console.warn(`[set_variable] "${action.name}": id "${resolvedId}" not found`)
    ctx.variables[action.name] = action.column
      ? (item ? { _value: item[action.column] } : null)
      : item
    return
  }

  // ── collection mode ───────────────────────────────────────────────────────
  const unified = { this: ctx.entry, ...ctx.variables } as Record<string, unknown>
  const resolvedFilters = (action.filters ?? []).map((f) => {
    const value = typeof f.value === 'string' ? interpolate(f.value, unified) : f.value
    return conditionToFilterGroup({ ...f, value }, targetSeed)
  })

  const orderDir: 'ASC' | 'DESC' = action.order === 'asc' ? 'ASC' : 'DESC'
  const { items } = await ctx.repository.findMany(targetSeed, {
    filters: resolvedFilters,
    status: null,
    pagination: { limit: 1000, offset: 0 },
    orderBy: action.order_by ? { column: action.order_by, dir: orderDir } : undefined,
  })

  ctx.variables[action.name] = materializeCollection(targetSeed, items, action.column ?? null)
}
```

Add `materializeCollection(seed, items, pinned)` in the same file:

- Compute `firstone` / `lastone` by `created_at` (`Number(r.created_at)`).
- When `pinned` is null: iterate `seed.branches`. For each `branch.type === 'number'`
  fill `sum/avg/min/max`. For others fill `pluck` (top 100, `', '` joined,
  append `' …'` if `items.length > 100`).
- When `pinned !== null`: emit `{ count, sum, avg, min, max, pluck, _items }`
  computed only over `pinned`. `count` counts entries where `items[i][pinned] != null`.
- Define `_items` with `Object.defineProperty(out, '_items', { value: items, enumerable: false })`
  so it does not appear in `JSON.stringify` output of the variables map.

> Note: the executor's `ctx` does not yet include `seed`. Confirm: the call
> site (`action-executors/index.ts:23`) already passes the full `ActionContext`,
> which already declares `seed: Seed` (line 14). The executor's parameter
> annotation is the only thing that needs updating.

### Task 5 — Template grammar (`apps/api/src/features/automations/template-grammar.ts`)

Extend `ParsedKey`:

```ts
export type ParsedKey =
  | { kind: 'simple'; path: string }
  | { kind: 'scoped'; /* unchanged */ }
  | {
      kind: 'var_access'
      name: string                  // variable name (first segment)
      steps: VarStep[]              // remaining navigation
      conditions: InlineCondition[] // trailing .(...) blocks
    }

export type VarStep =
  | { type: 'field'; name: string }                                    // .alias
  | { type: 'nav'; nav: 'firstone' | 'lastone' }                       // .firstone / .lastone
  | { type: 'agg'; op: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'pluck'; field?: string }
  | { type: 'array'; ids: string[] }                                   // .array[a,b,c]

export interface InlineCondition {
  column: string
  op: '=' | '!=' | '<' | '>' | '<=' | '>='
  value: string
}
```

Parsing rules in `parseTemplateKey`:

1. If the trimmed raw contains `:` at depth 0 → existing `scoped` / sugar
   logic (unchanged).
2. Otherwise tokenise on `.` at depth 0 (treat `[...]` and `(...)` as atomic).
3. If no token contains `[` or `(`, return `{ kind: 'simple', path: raw }` —
   the existing `withVariables`/`resolvePath` path handles plain dot-paths and
   stays the fast path for `{{cliente.email}}`.
4. Otherwise build a `var_access`:
   - first token → `name`.
   - For each subsequent token, in order:
     - `array[a,b,c]` → `{ type: 'array', ids: ['a','b','c'] }`. Parse ids by
       splitting on `,` and trimming.
     - `(col op val)` → push to `conditions` (regex
       `/^\(([\w]+)\s*(=|!=|<=|>=|<|>)\s*([^)]+)\)$/`, value trimmed).
     - `firstone` / `lastone` → `{ type: 'nav', nav: token }`.
     - `count|sum|avg|min|max|pluck` → `{ type: 'agg', op: token }`. If the
       next token is a plain identifier (and not the start of `(`), consume
       it as `field` and skip it on the next iteration.
     - Any other identifier → `{ type: 'field', name: token }`.
   - Return `{ kind: 'var_access', name, steps, conditions }`.

If the parser cannot recognise a token, return `null` (the interpolator
substitutes `defaultValue`).

> Reminder: `parseTemplateKey` stays pure and synchronous — it has no
> knowledge of the runtime `variables` map.

### Task 6 — Resolver (`apps/api/src/features/automations/automation-runner.ts`)

Extend `withVariables` to branch on the new kind:

```ts
function withVariables(base: ResolvedContext, variables: Record<string, unknown>): ResolvedContext {
  return {
    triggerEntry: base.triggerEntry,
    lookup(parsed, onMissing) {
      if (parsed.kind === 'simple') {
        const v = resolvePath(variables, parsed.path)
        if (v !== undefined) return v
      } else if (parsed.kind === 'var_access') {
        return resolveVarAccess(parsed, variables, onMissing)
      }
      return base.lookup(parsed, onMissing)
    },
  }
}
```

Implement `resolveVarAccess` in a new module
`apps/api/src/features/automations/var-access-resolver.ts`:

- Look up `variables[parsed.name]`. If missing → call `onMissing(name)` and
  return `undefined`.
- Walk `parsed.steps`:
  - On `field`: `current = (current as any)[step.name]` (works for plain
    records and for `{ firstone: {...}, lastone: {...} }` shapes).
  - On `nav`: assume the variable is a collection object; `current = current[step.nav]`.
  - On `array`: assume `current._items` exists or `current` itself is an
    array. Filter to rows whose `id` is in `step.ids`, then rebuild a fresh
    collection object using the same shape as `materializeCollection`
    (export it from the executor for reuse). Re-bind `current` to the
    rebuilt object so downstream `agg` / `nav` work uniformly.
  - On `agg`: read `current.count` (or `current[op][field]`) and assign to
    `current`. If `step.field` is defined, drill into the subfield.
- Apply `parsed.conditions` *before* the last `agg`/`nav` step: if the
  resolver is currently holding an `_items` array (collection object), filter
  it in-memory with the inline conditions, then rebuild the collection
  object. If no `_items` is in scope (e.g. conditions on `firstone.id`),
  apply them as a post-filter on the single record (the resolver returns
  `undefined` when the record fails the condition).
- Numeric coercion mirrors `query-builder.ts`: `Number(left)` vs
  `Number(right)` when either side parses as a finite number, otherwise
  string compare with `===` / `!==`.
- Final scalar/object is returned. `interpolate` calls `String(val)`; for
  objects this yields `[object Object]` — same behaviour as today; surface
  this in the template hint copy.

> Important: keep the existing `simple` fast-path. Most template lookups in
> production are plain dot-paths and must not pay the var-access overhead.

### Task 7 — Reserved words + SeedRegistry guard

1. Add `AUTOMATION_RESERVED_WORDS` to
   `apps/api/src/features/automations/template-grammar.ts` (top of file,
   exported). Mirror it in `packages/core/src/index.ts` re-exports so the
   dashboard can import it from `@beechcms/core` — but the source-of-truth
   constant lives in the API package next to the parser. The mirror is a
   one-line re-export: `export { AUTOMATION_RESERVED_WORDS } from
   '@beechcms/core/automations-grammar-words'` (create a tiny core file
   `packages/core/src/automations-grammar-words.ts` that owns the set, and
   import it from `template-grammar.ts` so the API and dashboard both depend
   on `@beechcms/core`).
2. In `packages/core/src/seed-registry.ts:43` (the `SeedRegistry`
   constructor) add:

   ```ts
   for (const seed of seeds) {
     for (const branch of seed.branches) {
       if (AUTOMATION_RESERVED_WORDS.has(branch.alias)) {
         throw new Error(
           `Seed "${seed.slug}" uses reserved alias "${branch.alias}". `
             + `Pick a different alias — this word is used by the automation template grammar.`
         )
       }
     }
   }
   ```

   Add unit coverage to `seed-registry.test.ts`.

### Task 8 — Dashboard form

File: `apps/dashboard/src/features/automations/components/action-forms/set-variable-form.tsx`

Rewrite the body. Required pieces:

1. **Variable name** — `<Input>` with the existing `register('actions.${i}.name')`.
   Display the schema error (it now includes the reserved-word message).
2. **Source combobox** — new component using `Command` + `Popover` from
   `@/components/ui`. Items: trigger seed first (label
   `t('automations.actions.thisSeed')`), then all seeds from `useSchema()`.
   Free-text below the list ("Use 'X' as fixed ID"). On select of a slug
   write `seed_slug = slug` and clear `fixed_id`. On free-text write
   `fixed_id = value` and clear `seed_slug`.
3. **Column select** (collection mode only) — `<Select>` listing
   `targetSeed.branches` with a "— all columns —" option that writes `''`.
4. **Filters** (collection mode only) — keep the existing filter list UI
   from the current component; only the surrounding visibility logic changes.
5. **Template hint** — collapsible block; copy lives under
   `apps/dashboard/src/locales/<lang>/translation.json` keys
   `automations.actions.hintCollection` and `.hintFixed`. Use `i18next`
   `Trans` if the copy contains code snippets.

In `use-automation-editor.ts`:

- `actionToFormItem` (line 131) — for `set_variable` map both `fixed_id`,
  `column`, and translate legacy `load_type: 'fruit'` + single id-eq filter
  to `fixed_id`. Drop `load_type` from the form.
- `formToApiPayload` (line 192) — emit the new shape:

  ```ts
  case 'set_variable':
    return {
      type: 'set_variable' as const,
      name: a.name,
      ...(a.seed_slug ? { seed_slug: a.seed_slug } : {}),
      ...(a.fixed_id ? { fixed_id: a.fixed_id } : {}),
      ...(a.column ? { column: a.column } : {}),
      filters: a.filters.map((f) => ({ field: f.field, op: f.op, value: f.value })),
    }
  ```

Also remove `load_type` from `ActionFormItem` and `DEFAULT_ACTION_ITEM`.
Add `fixed_id: ''`, `column: ''` to both. Update i18n keys: drop
`automations.actions.loadType*`, add `automations.actions.sourcePlaceholder`,
`automations.actions.column`, `automations.actions.fixedIdBadge`,
`automations.actions.hintCollection`, `automations.actions.hintFixed`,
`automations.editor.errors.variableNameReserved`.

### Task 9 — Tests

#### `apps/api/src/features/automations/__tests__/set-variable.executor.test.ts`

Replace the existing file (or extend it; current cases reference
`load_type` and must be kept passing for retro-compat). Cases to add:

| # | Scenario | Assertion |
|---|---|---|
| 1 | `fixed_id` set, record exists | `variables[name]` equals item |
| 2 | `fixed_id` set, record missing | `variables[name] === null`, `console.warn` called |
| 3 | `fixed_id` + `column` | `variables[name] === { _value: item[column] }` |
| 4 | `fixed_id` interpolation from `this` | `findMany` called with `value === <resolved>` |
| 5 | Collection (no filters) | `count`, `firstone`, `lastone`, `sum`, `pluck` correct |
| 6 | Collection with `filters` | `findMany` receives the resolved filter groups |
| 7 | Collection with `column` pin | result has scalar `sum/avg/min/max/pluck`, `count` counts non-null |
| 8 | `seed_slug` omitted | executor uses `ctx.seed.slug` |
| 9 | Seed not found | `variables[name] === null`, warn logged |
| 10 | Legacy `load_type: 'fruit'` + id-eq filter | upgraded to `fixed_id` path |
| 11 | Legacy `load_type: 'branch'` | runs collection path |
| 12 | `_items` not enumerable | `JSON.stringify(variables)` does not contain `_items` |

#### `apps/api/src/features/automations/__tests__/template-grammar.test.ts`

Append:

| # | Input | Expected ParsedKey |
|---|---|---|
| 1 | `ordini.array[a,b].count` | `var_access` name=`ordini`, steps=`[{array:[a,b]},{agg:count}]` |
| 2 | `ordini.count.(status=paid)` | `var_access` steps=`[{agg:count}]`, conditions=`[{status='paid'}]` |
| 3 | `ordini.sum.total.(amount>100)` | `var_access` steps=`[{agg:sum,field:total}]`, conditions=`[{amount,>,100}]` |
| 4 | `ordini.firstone.id.(status=paid)` | `var_access` steps=`[{nav:firstone},{field:id}]`, conditions=`[…]` |
| 5 | `ordini.array[a,b].(status=paid).count` | conditions before agg — same result as #2 with array prefix |
| 6 | `cliente.email` | falls through to `simple` (fast path) |

#### `apps/api/src/features/automations/__tests__/automation-runner.test.ts` (new cases)

- A variable with `_items` is queryable via `array[id]`.
- Inline condition `(status=paid)` reduces `count` correctly.
- Conditions on `firstone.id` return `undefined` when the record fails the
  predicate.

#### `packages/core/src/seed-registry.test.ts`

- `new SeedRegistry([{ slug: 'x', branches: [{ alias: 'count', ... }] }])` throws.
- Reserved-alias error message contains the alias and the seed slug.

### Task 10 — Manual smoke

1. `pnpm run build` in `packages/core` — green.
2. `npx tsc --noEmit` in `apps/api` and `apps/dashboard` — green.
3. `pnpm run test` at the repo root — all suites green.
4. UI smoke:
   - Create a `set_variable` block named `count` → inline error visible.
   - Pick a seed → collection mode UI; filters + column visible.
   - Type a free-text id (not a slug) → "Fixed ID" badge visible; filters
     hidden.
   - Save then reopen → form preserves the chosen mode without losing the id.
5. Retro-compat:
   - Open an automation saved under sprint 06-fix
     (`load_type: 'fruit'`, `filters: [{field:'id',op:'eq',value:'c_1'}]`)
     → opens in single-record mode with `fixed_id = 'c_1'`. Saving rewrites
     the row to the new shape (no `load_type` field).

---

## 6. Validation

- `pnpm run build` (core), `npx tsc --noEmit` (api, dashboard) — no
  TypeScript errors.
- `pnpm run test` in `apps/api/` — new suites green; existing suites for
  `set-variable.executor`, `template-grammar`, `automation-runner`,
  `context-resolver`, `seed-registry`, `automations.schema`,
  `automations.handler` all still green.
- Manual smoke (Task 10 steps 4–5) passes.

---

## 7. Acceptance criteria

- [ ] `SetVariableAction.load_type` is no longer required; presence of
      `fixed_id` is the only mode discriminator.
- [ ] Omitting `seed_slug` resolves to `ctx.seed.slug` at runtime.
- [ ] Missing record in single-record mode yields `null`, logs a single
      `console.warn`, and never throws.
- [ ] Collection mode materializes `firstone`, `lastone`, `count`, `sum`,
      `avg`, `min`, `max`, `pluck` across all numeric/textual branches.
- [ ] `_items` is present but **not enumerable** on the materialised object.
- [ ] `{{var.array[…]}}` and `{{var.x.(col op val)}}` are parsed as
      `var_access` and resolved in-memory against `_items`.
- [ ] Variable names in `AUTOMATION_RESERVED_WORDS` are rejected by both
      the API and dashboard zod schemas with the
      `automations.editor.errors.variableNameReserved` message.
- [ ] `SeedRegistry` constructor throws when any `branch.alias` is reserved.
- [ ] UI form uses a single combobox for source; column + filters are
      hidden in single-record mode; template hint updates live.
- [ ] Sprint 06 / 06-fix tests pass without modification.

---

## 8. Out of scope

- Cross-automation variable scope.
- Multiple operands inside one parenthesis (e.g. `OR` between inline conditions).
- Range/slice array selectors (`array[0..10]`).
- `{{…}}` interpolation inside inline-condition values
  (`.(col={{this.x}})`) — values stay literal in this sprint.
- Variable-picker autocomplete in template fields (Task 15 in sprint 06,
  still deferred).
- Async resolution of `:` inline seed lookups in the resolver
  (`context-resolver.ts:225` TODO).
