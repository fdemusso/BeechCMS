# Sprint Plan — RichTextValidationRenderHardening (Phase 1: P0 Security & Correctness)

### Pre-Computation Analysis

**a) God Nodes (identified via `graphify affected`)**

1. **`validateAndSanitizeSeedPayload()`** (`packages/core/src/engine/validation.ts`) — the single
   input gate. `graphify affected --depth 2` fans out to every write path:
   - `apps/api/src/features/content/handlers/create.ts:L26` (`createHandler`)
   - `apps/api/src/features/content/handlers/update.ts:L27` (`updateHandler`)
   - `apps/api/src/features/content/handlers/kanban-move.ts:L15` (`kanbanMoveHandler`)
   - `apps/api/src/public/sanitize.ts:L26` (`sanitizePublicPayload`) → `public-add.ts:L27`
     (`publicAddHandler`, route `POST /:seed/add`) and `public-edit.ts:L66` (`resolveData`)
   - tests: `validation.test.ts`, `apps/api/test/core-validation.test.ts`
   Every authenticated **and** public write funnels through this one function. It is the front door.

2. **`renderRichText()` / `normalizeRichtextForRender()`** (`packages/core/src/content/richtext/richtext-render.ts`)
   — the render sink (last line of defense). `graphify affected --depth 2`:
   - `apps/dashboard/src/components/fields/display/richtext.tsx:L21` (`RichtextDisplay`)
   - `apps/dashboard/src/features/content-gallery/gallery-components/gallery-richtext-readonly.tsx:L22`
     (`GalleryRichtextReadonly`)
   - `apps/dashboard/src/components/fields/registry.ts:L1`, `gallery-peek-sections.tsx`
   - test: `richtext-render.test.ts`
   Both admin session render and public frontend render trust this sink's output verbatim.

**b) Architectural boundaries affected**

| Boundary | Touched? | Nature |
|----------|----------|--------|
| `@beechcms/core` engine slice (`engine/validation.ts`) | **YES** | Input-gate hardening: allowlist walker, protocol normalization, DoS pre-checks, step fix. |
| `@beechcms/core` content slice (`content/richtext/richtext-render.ts`) | **YES** | Render-sink hardening: drop string-form to empty. |
| `apps/api` (all handlers, public routes) | **NO code change** | Consumes the gate via the unchanged `validateAndSanitizeSeedPayload` signature + existing `dangerousFields`/`details` result contract. Behavior tightens; interface is stable. |
| `apps/dashboard` (field display, gallery) | **NO code change** | Consumes `renderRichText`; output for valid JSON docs is byte-identical. Only legacy string input now yields `''`. |
| caching / `SeedRegistry` layer | **NO** | Explicitly excluded (brief §5). Cache key already fixed (`9ea1a3d`/`105da92`). |

**c) `graphify affected` impact / breaking-change proof**

- `validateAndSanitizeSeedPayload` — signature (`seed`, `payload`, `ValidateSeedPayloadOptions`)
  and `ValidateSeedPayloadResult` shape (`data`, `details`, `unknownAliases`, `dangerousFields`,
  `requiredFieldsMissing`, `hasAnyValidField`) are **unchanged**. No downstream caller signature
  breaks; the only observable change is that previously-accepted malicious/string payloads now
  land in `details`/`dangerousFields` (the intended tightening).
- `renderRichText` / `normalizeRichtextForRender` — signature `(value: unknown) => string` /
  `=> JSONContent | string | null` unchanged. The **only** behavior delta: string input →
  `normalizeRichtextForRender` returns `null` (was: the string) → `renderRichText` returns `''`
  (was: verbatim). One existing test asserts the old behavior and MUST be updated (brief §4).
- Zero new imports into `apps/`; zero D1 schema change; no new bundle dependency.

---

### VETO Audit

Evaluated against `ponytail_arch.md`:

1. **BOTANICAL INVARIANT (no bypass of `@beechcms/core`).** ✅ All sanitization/validation stays
   inside `@beechcms/core`. `apps/api` handlers reach D1 only *after* passing through
   `validateAndSanitizeSeedPayload`; this sprint adds no D1 query and no hardcoded field name
   (branch iteration stays keyed on `br_XX` branch definitions). No bypass introduced.
2. **VSA ENFORCEMENT (no cross-feature imports).** ✅ The engine↔content crossing flagged in
   brief §2.7 is **intra-package** (both `engine/validation.ts` and `content/richtext/*` live in
   `@beechcms/core`) — it is *not* a cross-slice import inside `apps/api/features/*` or
   `apps/dashboard/src/features/*`. `validation.ts` already imports
   `content/richtext/richtext.js` (`isRichtextEnvelopeV1`, `RICHTEXT_SCHEMA_VERSION`) today; no
   new cross-feature edge is created. No shared logic needs promotion.
3. **CLOUDFLARE PURITY.** ✅ Edge-native: pure TS, no ORM, no heavy sanitizer (DOMPurify /
   sanitize-html explicitly rejected — JSON-only + allowlist keeps the Workers isolate lean). No
   background job, no non-deterministic SQLite change.
4. **YAGNI / MINIMALIST.** ✅ Two files edited, no net-new infra. The module split, registry-cache
   fix, and efficiency dedups are all pushed OUT (Sprint 2 / separate briefs). Minimum nodes across
   tiers: change confined to the two core slices; API/dashboard untouched.

No violation found. Plan proceeds unchanged. **HANDOFF -> caveman_coder.**

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This sprint exists first because it closes a **live, attacker-reachable stored-XSS chain plus a
DoS vector** on the public write endpoint `POST /api/v1/public/:seed/add` — the highest-severity
open defects in the codebase (#147, #148, #149). Everything else in the RichText roadmap (the
module split, typing cleanup) is maintainability, not safety, and is deliberately deferred so the
security diff stays small and auditable on the exact file attackers touch.

VSA / Botanical adherence: the fix lives entirely inside `@beechcms/core`, the single source of
truth. `apps/api` and `apps/dashboard` consume the hardened gate and sink through their existing,
unchanged contracts — no slice reaches around core to touch D1, and no cross-feature import is
introduced. The engine (input) + content (render) crossing is intentional and intra-package: the
stored-XSS is only closed when **both** the front door (reject on write) and the sink (drop-to-empty
on render) are shut. Fixing only one leaves either persisted payloads executable on render or a
render that trusts a gate it cannot see.

It must precede Sprint 2 (mechanical split): coupling a security-critical patch with a 1175-line
restructure produces an unreviewable diff. Merge security first, move code second.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Input gate — `packages/core/src/engine/validation.ts` (1175 lines):**
- `validateAndSanitizeSeedPayload()` (L1108) → `compileSeedSchema` → per-branch Zod schemas.
- RichText branch → `richtextSchema()` (L494) → `sanitizeRichtext()` (L375) →
  `sanitizeRichtextString()` (L306) **or** `sanitizeRichtextJson()` (L360) → `walkRichtextNode()` (L322).
- Danger surfacing: `richtextSchema` adds a Zod issue with `params:{ dangerous:true }`;
  `processZodIssues` (L1035) routes it into `result.dangerousFields`; `sanitizePublicPayload`
  (`apps/api/src/public/sanitize.ts:L44`) maps a non-empty `dangerousFields` → `422 dangerous_content`.
- **Defect surfaces (all confirmed in code):**
  - `DANGEROUS_TAG_REGEX` (L113) + `DANGEROUS_ATTR_REGEX` (L117) are a **blocklist** — bypassable by
    `<img/src=x/onerror=…>`, `<svg/onload=…>` (attr regex requires a leading `\s`).
  - `DANGEROUS_PROTOCOL_REGEX = /^\s*javascript:/i` (L121) — anchored, single-protocol; misses
    `data:text/html`, `vbscript:`, and `java\tscript:` (control-char strip at L111 preserves `\t`/`\n`).
  - `walkRichtextNode` (L322) has **no depth cap** → stack overflow on nested payloads.
  - Size (`maxTextLength`) checked at L504 **only after** the full walk + `JSON.stringify` (L365/394).
  - `numberSchema` step check (L545-556): `val.toString()` on scientific notation (`1e-7` →
    `"1e-7"`) yields `stepDecimals=0`, `scale=1`, `stepScaled=Math.round(1e-7)=0` → check silently
    no-ops. Small valid/invalid steps mis-evaluated.
- **Invariant:** the function returns structured results; it must **not** add `throw` paths.
  Node/mark `type` allowlist must stay in sync with the render extensions (see sink below).

**Render sink — `packages/core/src/content/richtext/richtext-render.ts` (90 lines):**
- `createRichTextHtmlExtensions()` (L22) — the canonical enabled set: StarterKit (link disabled),
  `Link` (openOnClick false, defaultProtocol https), `Mathematics`, `Highlight`, `Superscript`,
  `Subscript`, `Image` (**allowBase64: false**), `TextAlign` (heading/paragraph), `Table`
  (resizable false), `TableRow`, `TableHeader`, `TableCell`.
- `normalizeRichtextForRender()` (L63): string → **returns the string** (L65) ← XSS pass-through.
- `renderRichText()` (L82): string-normalized → **returns it verbatim** (L85-87). Docstring (L80)
  falsely claims "stringa sanificata".
- Envelope helper: `isRichtextEnvelopeV1` / `RICHTEXT_SCHEMA_VERSION` from `./richtext.js`
  (`schemaVersion === 1 && typeof doc === 'object'`).

**Result contract (unchanged this sprint):** `ValidateSeedPayloadResult` = `{ data, details,
unknownAliases, dangerousFields, requiredFieldsMissing, hasAnyValidField }`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Exactly **two production files** modified + **two test files** updated. No new files, no module
split, no dependency, no D1 migration.

1. `packages/core/src/engine/validation.ts` — hardened input gate (allowlist walker, protocol
   normalization, DoS pre-checks, step fix). Signatures & result shape unchanged.
2. `packages/core/src/content/richtext/richtext-render.ts` — string-form → empty; corrected docstring.
3. `packages/core/src/engine/validation.test.ts` — regression tests for #147/#148/#149 + step.
4. `packages/core/src/content/richtext/richtext-render.test.ts` — flip the legacy-string assertion
   to expect `''`; add string-drop cases.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

No D1 migration in this sprint. All changes are TypeScript inside `@beechcms/core`.

---
**TASK 1 — Render sink: drop string-form to empty (`richtext-render.ts`)**

Replace L63-76 (`normalizeRichtextForRender`): remove the string branch so a `string` value falls
through to `null`.

```ts
/**
 * Accetta JSON TipTap (`{ type: 'doc', ... }`) o envelope v1.
 * Le stringhe HTML legacy NON sono più supportate: ritornano null (drop-to-empty al render).
 */
export function normalizeRichtextForRender(value: unknown): JSONContent | null {
  if (value == null || value === '') return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    if (isRichtextEnvelopeV1(value)) return o.doc as JSONContent
    if (o.type === 'doc') return value as JSONContent
  }
  return null
}
```

Update `renderRichText` (L82-90) — the return type of `normalize` is now `JSONContent | null`, so
the `typeof normalized === 'string'` branch is dead and MUST be removed. Correct the docstring:

```ts
/**
 * Render deterministico JSON → HTML (per display, anteprime, API pubblica).
 * Input non-JSON o stringa legacy → '' (drop-to-empty; nessun pass-through).
 */
export function renderRichText(value: unknown): string {
  const normalized = normalizeRichtextForRender(value)
  if (normalized == null) return ''
  return generateHTML(normalized, createRichTextHtmlExtensions())
}
```

> Note: `normalizeRichtextForRender`'s public return type narrows from `JSONContent | string | null`
> to `JSONContent | null`. `graphify affected` shows only `renderRichText` (internal) plus dashboard
> consumers that pass the result straight into rendering — none branch on the `string` case, so the
> narrowing is safe. Verify no `apps/` caller destructures a string from it (grep in VALIDATION).

---
**TASK 2 — Input gate: allowlist node/mark walker (`validation.ts`)**

Replace the blocklist constants (L113-125) with allowlists. The node/mark sets are **derived from
`createRichTextHtmlExtensions`** and MUST carry a sync comment.

```ts
/** Allowlisted TipTap node `type` values. Keep in sync with
 *  content/richtext/richtext-render.ts::createRichTextHtmlExtensions. */
const ALLOWED_RICHTEXT_NODE_TYPES = new Set([
  'doc', 'paragraph', 'text', 'heading', 'blockquote', 'bulletList', 'orderedList',
  'listItem', 'codeBlock', 'horizontalRule', 'hardBreak', 'image',
  'table', 'tableRow', 'tableHeader', 'tableCell',
  'inlineMath', 'blockMath', // Mathematics extension
])
/** Allowlisted TipTap mark `type` values. */
const ALLOWED_RICHTEXT_MARK_TYPES = new Set([
  'bold', 'italic', 'strike', 'code', 'link', 'highlight',
  'superscript', 'subscript', 'textStyle',
])
/** Keys that may carry URLs inside a node/mark attrs. */
const URL_LIKE_RICHTEXT_KEYS = new Set(['href', 'src'])
/** Link protocols accepted AFTER normalization. Allowlist, not blocklist. */
const ALLOWED_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
/** DoS guards, evaluated before the sanitizing walk. */
const RICHTEXT_MAX_DEPTH = 50
```

Delete `DANGEROUS_TAG_REGEX`, `DANGEROUS_TAG_STRIP_REGEX`, `DANGEROUS_ATTR_REGEX`,
`DANGEROUS_HANDLER_STRIP_REGEX`, `DANGEROUS_PROTOCOL_REGEX`, `FORBIDDEN_RICHTEXT_NODE_TYPES`.
`CONTROL_CHARS_REGEX` / `stripControlChars` stay.

Add a protocol-normalization helper (strips **all** internal whitespace + control chars, then
extracts the scheme; relative/anchor links with no scheme are allowed):

```ts
/** Normalizes a URL value and confirms its protocol is allowlisted.
 *  Strips ALL whitespace + control chars first, defeating java\tscript: obfuscation. */
function isProtocolAllowed(raw: string): boolean {
  const normalized = raw.replace(/[\s -]+/g, '').toLowerCase()
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/.exec(normalized)
  if (!schemeMatch) return true // relative URL / anchor / fragment — no protocol
  return ALLOWED_URL_PROTOCOLS.has(schemeMatch[1])
}
```

Rewrite `walkRichtextNode` (L322-352) to enforce allowlists + depth. `state` gains `depth`:

```ts
interface SanitizeState { dangerous: boolean; depth: number }

function walkRichtextNode(node: unknown, state: SanitizeState): unknown {
  if (state.depth > RICHTEXT_MAX_DEPTH) { state.dangerous = true; return null }
  if (typeof node === 'string') return stripControlChars(node)
  if (Array.isArray(node)) {
    state.depth++
    const mapped = node.map((child) => walkRichtextNode(child, state))
    state.depth--
    return mapped
  }
  if (!isPlainObject(node)) return node

  // Node/mark type allowlist: any `type` not on either allowlist flags dangerous.
  const nodeType = typeof node.type === 'string' ? node.type : undefined
  if (nodeType !== undefined
      && !ALLOWED_RICHTEXT_NODE_TYPES.has(nodeType)
      && !ALLOWED_RICHTEXT_MARK_TYPES.has(nodeType)) {
    state.dangerous = true
  }

  const result: Record<string, unknown> = {}
  state.depth++
  for (const [key, entry] of Object.entries(node)) {
    const lower = key.toLowerCase()
    if (lower.startsWith('on')) state.dangerous = true // event-handler attr
    if (URL_LIKE_RICHTEXT_KEYS.has(lower) && typeof entry === 'string'
        && !isProtocolAllowed(entry)) {
      state.dangerous = true
    }
    result[key] = walkRichtextNode(entry, state)
  }
  state.depth--
  return result
}
```

Initialize `state` with `{ dangerous: false, depth: 0 }` in `sanitizeRichtextJson` (L361).

---
**TASK 3 — Input gate: reject string-form + fail-fast DoS pre-checks (`validation.ts`)**

`sanitizeRichtextString` (L306-313) currently sanitizes and returns `valid:true`. Per brief §2
rule 1 (JSON-only), string input is **rejected**. Replace its body so string payloads are invalid:

```ts
/** RichText string input is no longer accepted (JSON-only). Reject as invalid. */
function sanitizeRichtextString(raw: string): RichtextSanitizeResult {
  return { value: raw, dangerous: false, valid: false, size: raw.length }
}
```

In `sanitizeRichtext` (L375-398) add the **fail-fast byte + depth guard BEFORE walking**. Byte
size is measured on the raw payload once; a bounded pre-scan trips depth before the full walk:

```ts
function sanitizeRichtext(raw: unknown, maxBytes: number): RichtextSanitizeResult {
  const envelopeMode = isRichtextEnvelopeV1(raw)
  const payload = envelopeMode ? (raw as { doc: unknown }).doc : raw

  if (typeof payload === 'string') return sanitizeRichtextString(payload)
  if (!isPlainObject(payload)) return { value: raw, dangerous: false, valid: false, size: 0 }

  // Fail-fast DoS pre-check: size BEFORE the sanitizing walk.
  const rawSize = JSON.stringify(payload).length
  if (rawSize > maxBytes) {
    return { value: raw, dangerous: false, valid: false, size: rawSize, oversize: true }
  }
  // ...existing sanitizeRichtextJson path; walker now enforces RICHTEXT_MAX_DEPTH...
}
```

- Thread `options.maxTextLength` into the call: `richtextSchema` (L496) becomes
  `sanitizeRichtext(value, options.maxTextLength)`. Add `oversize?: boolean` to
  `RichtextSanitizeResult` and, in `richtextSchema`, emit the existing
  `Expected richtext(max:…)` issue when `sanitized.oversize` **or**
  `sanitized.size > options.maxTextLength` (keep the post-check too; the pre-check just short-circuits).
- The depth cap is enforced inside `walkRichtextNode` (Task 2) which sets `dangerous` and truncates
  the branch to `null` at depth > 50 — no recursion past the cap, no stack overflow, no throw.
- **Invariant:** no `throw` added. Oversize/deep/string all return structured `valid:false` /
  `dangerous:true` → routed to `details` / `dangerousFields` exactly as today.

---
**TASK 4 — Correctness: scientific-notation `step` (`validation.ts`)**

In `numberSchema` (L545-556), replace the `toString().split('.')` decimal counting (which breaks on
`"1e-7"`) with an exponent-aware decimal-places helper:

```ts
/** Decimal places of a number, correct for scientific notation (1e-7 → 7). */
function decimalPlaces(n: number): number {
  if (!Number.isFinite(n)) return 0
  const s = n.toString()
  if (s.includes('e') || s.includes('E')) {
    const [mantissa, expPart] = s.toLowerCase().split('e')
    const exp = parseInt(expPart, 10)
    const mantDecimals = (mantissa.split('.')[1] ?? '').length
    return Math.max(0, mantDecimals - exp) // exp is negative for small numbers
  }
  return (s.split('.')[1] ?? '').length
}
```

Use it: `const valDecimals = decimalPlaces(val); const stepDecimals = decimalPlaces(step);` — rest
of the modulo check unchanged. This makes `step: 1e-7` produce `scale = 1e7`, so `1e-7` steps are
validated instead of silently no-op'd.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# Build + typecheck the changed package
pnpm --filter @beechcms/core run build
pnpm --filter @beechcms/core exec tsc --noEmit

# Confirm no apps/ caller relies on the narrowed normalizeRichtextForRender string return,
# and that the removed blocklist consts have no external references
grep -rnE "normalizeRichtextForRender|DANGEROUS_(TAG|ATTR|PROTOCOL|HANDLER)_|FORBIDDEN_RICHTEXT" \
  apps/ packages/ --include=*.ts --include=*.tsx

# Run tests scoped to the diff
pnpm beech test --diff
# Full core suite (regressions for #147/#148/#149 + step + render sink)
pnpm --filter @beechcms/core test

# API contract sanity (public write gate consumes the hardened core)
pnpm --filter @beechcms/api exec tsc --noEmit
```

Manual attack-vector checks that MUST now reject/neutralize (encode as tests, Task obligations):
- `<img/src=x/onerror=alert(1)>` inside a text node → `dangerous` (via `on*`/allowlist).
- `{ type:'script' }` node → not on allowlist → `dangerous`.
- `href: "java\tscript:alert(1)"` / `data:text/html;base64,…` / `vbscript:…` → `isProtocolAllowed` false → `dangerous`.
- 60-level nested `content` array → depth cap → `dangerous`, no stack overflow.
- payload > `maxTextLength` bytes → fail-fast `oversize`, `Expected richtext(max:…)`.
- string-form `"<div>x</div>"` at input → `valid:false` (`Expected richtext-json|string`).
- `renderRichText('<div>Legacy</div>')` → `''`.
- number branch `step:1e-7`, value `3e-7` → accepted; value `2.5e-7` → `Expected number(step:1e-7)`.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `packages/core` builds clean; `tsc --noEmit` passes in core AND `apps/api`.
- [ ] `normalizeRichtextForRender` returns `JSONContent | null` (string branch removed); dead
      string branch in `renderRichText` removed; docstrings corrected (no "sanificata" claim).
- [ ] `richtext-render.test.ts`: legacy-string assertion flipped to expect `''`; string-drop cases added.
- [ ] Node/mark validation is an **allowlist** (`ALLOWED_RICHTEXT_NODE_TYPES` / `_MARK_TYPES`); all
      `DANGEROUS_*` blocklist regexes and `FORBIDDEN_RICHTEXT_NODE_TYPES` deleted.
- [ ] Link protocols validated by `isProtocolAllowed` against `{http,https,mailto,tel}` **after**
      whitespace/control-char stripping; `data:`, `vbscript:`, `java\tscript:` all rejected.
- [ ] Depth cap (50) enforced in `walkRichtextNode`; deeply-nested payload flagged, no stack overflow.
- [ ] Byte-size checked **before** the sanitizing walk (fail-fast `oversize`).
- [ ] String-form RichText input rejected as structured `valid:false` (routed to `details`), not thrown.
- [ ] `numberSchema` step accepts scientific notation (`1e-7`) via `decimalPlaces`; regression test green.
- [ ] Regression tests present for #147, #148, #149, string-drop, and step.
- [ ] **No new `throw` path** in `validation.ts`; result shape `ValidateSeedPayloadResult` unchanged.
- [ ] **No new dependency** added to `@beechcms/core` (no DOMPurify / sanitize-html); `package.json` unchanged.
- [ ] No `apps/` file modified; no module split; no D1 migration.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT, in this sprint:

- **Split `validation.ts` into modules** (`richtext-sanitizer.ts`, `file-branch.ts`,
  `schema-builders.ts`, `cache.ts`, `index.ts`) — that is **Sprint 2**
  (`RichTextValidationModuleSplit`, ROADMAP). Coupling it here makes the security diff unreviewable.
- **Touch the `(issue as any).errors` Zod typing cleanup** — deferred to Sprint 2 (would pollute the
  zero-logic-change split). Brief §5.
- **Touch caching / `SeedRegistry`** — `getHydratedRegistry` version-token fix, two-level
  `WeakMap`+`Map` cache, plain-`WeakMap` fingerprint removal, file-URL double-validation dedup,
  per-relation schema caching. All excluded (brief §5); cache-collision root cause already fixed
  (`9ea1a3d`/`105da92`). Separate briefs.
- **Migrate legacy string rows in D1** — handled by drop-to-empty at render (v0.6, no production
  data to preserve). No migration, no data backfill.
- **Add an HTML sanitizer dependency** — rejected; JSON-only + allowlist is the whole design.
- **Modify `apps/api` or `apps/dashboard`** — they consume the hardened core through unchanged
  contracts; no handler, route, or component edit is in scope.
- **Add fingerprint-completeness guard tests** (idea #10) — test-hardening for the out-of-scope
  caching path. Deferred.
