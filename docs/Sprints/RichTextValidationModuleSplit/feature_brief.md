# Feature Brief — RichText Validation & Render Hardening

> Origin: `stages/00_ideation/idea.md` (hardening/refactor of `packages/core/src/engine/validation.ts`), re-scoped through adversarial sparring. Backed by GitHub issues #147 (stored XSS), #148 (protocol filter bypass), #149 (DoS), plus a resolved data-loss class (cache-collision from incomplete fingerprint, fixed in commits `9ea1a3d` / `105da92`).

---

# 1. Feature Definition and Core Value

The real problem is **not** "refactor a big file." It is a **live, attacker-reachable stored-XSS chain plus a DoS vector** in the RichText pipeline, exposed on the public write endpoint `POST /api/v1/public/:seed/add` and rendered in both the admin Dashboard and the public frontend.

Three defects, confirmed in code and issues:

1. **Stored XSS (#147)** — the string-path sanitizer is a **blocklist** (`<script|iframe|object|embed>` + an attribute regex requiring a leading space). It is bypassable by construction: `<img/src=x/onerror=…>`, `<svg/onload=…>`, `<a href="javascript:…">`. Worse, the exploit fires at the **render sink**: `renderRichText` returns any stored **string** value **verbatim** — the docstring claims sanitization that does not exist.
2. **Protocol filter bypass (#148)** — `DANGEROUS_PROTOCOL_REGEX` only matches anchored `javascript:`. It misses `data:text/html`, `vbscript:`, and is defeated by obfuscation (`java\tscript:` survives because control-char stripping preserves tabs/newlines).
3. **DoS (#149)** — the JSON walker recurses with **no depth cap** (stack overflow on deeply nested payloads), and `maxTextLength` is checked **only after** the full tree walk + `JSON.stringify` — CPU/memory amplification before rejection.

The indispensable value: **shut the XSS chain and the DoS vector at both the input gate and the output sink**, using an architecture (structured-JSON-only) that needs **no heavy HTML-sanitizer dependency** in the Cloudflare Workers isolate. Blocklist patching is explicitly rejected as a historically-failing approach for XSS.

A correctness bug in the numeric `step` check (silent failure on scientific notation, e.g. `1e-7`) rides along in the same fix because it is a genuine validation-correctness defect in the same file.

---

# 2. Domain Boundaries and Business Rules

**Logical entities**

- **RichText payload** — the user-authored content value. Canonical form: TipTap structured JSON `{ type: 'doc', content: [...] }`. Legacy HTML-string form is being **removed**.
- **Input Gate** — `packages/core/src/engine/validation.ts` (engine slice). Validates payloads on write. Contract: **never throws at runtime** — all rejections returned as structured `ValidationDetail`.
- **Render Sink** — `packages/core/src/content/richtext/richtext-render.ts` (content slice). Deterministic JSON→HTML for display, previews, and public API.
- **Consumers of the sink** — admin Dashboard render and public frontend render (both trust the sink's output; the sink is the last line of defense).

**Ironclad rules**

1. **JSON-only.** RichText input is accepted **exclusively** as structured TipTap JSON (`{ type: 'doc' }` or the v1 envelope). Raw HTML strings are **rejected at input** and **not rendered** at output.
2. **Allowlist over blocklist.** Both node types (walker) and link protocols are validated against **explicit allowlists**, never against a list of forbidden patterns.
3. **Protocol allowlist:** `http`, `https`, `mailto`, `tel` — evaluated **after** normalization that removes internal whitespace and control characters.
4. **Fail-fast on size/depth.** Raw byte size and nesting depth are checked **before** any parsing/walking. Recursion depth cap: **50 nodes**.
5. **No runtime exceptions.** Validation failures are structured results, not thrown errors. (The `throw` on missing `idGenerator` must not be the model to follow.)
6. **No new heavy dependency in the Workers bundle** (no DOMPurify / sanitize-html). Security is achieved by JSON-only + node/protocol allowlists.
7. **Slice boundary respected but crossed by necessity.** The P0 fix legitimately spans **engine** (input) and **content** (render) because the stored-XSS is only closed when both the front door and the sink are shut. This crossing is intentional and scoped, not a cross-dependency leak.

**Cross-slice note:** the fix does **not** reach into the caching / SeedRegistry layer — that is deliberately excluded (see §5).

---

# 3. Primary Requirements (User Stories)

* AS A **public/untrusted content submitter (attacker)** I WANT my raw-HTML or obfuscated-protocol RichText payload to be **rejected at the input gate** SO THAT no executable markup is ever persisted through `POST /api/v1/public/:seed/add`.
* AS A **Dashboard admin viewing content** I WANT any legacy or malformed string-form RichText to render as **empty** rather than verbatim SO THAT a previously-stored payload cannot execute script in my authenticated session.
* AS A **public-site visitor** I WANT rendered RichText to contain only allowlisted nodes and safe-protocol links SO THAT browsing content cannot trigger XSS.
* AS A **platform operator** I WANT deeply-nested or oversized RichText payloads to be **rejected fast, before parsing** SO THAT a malicious payload cannot exhaust CPU or overflow the isolate stack.
* AS A **content author using decimal/step-constrained number fields** I WANT step validation to handle scientific notation (e.g. `1e-7`) SO THAT valid small values are not silently rejected.
* AS A **developer / AI coding agent maintaining the engine** I WANT the validation logic split into small focused modules SO THAT I do not silently drop a line in a 1175-line monolith when editing.

---

# 4. Secondary Requirements and Logical Constraints

**Delivery sequencing (hard constraint)**

- **Phase 1 — P0 Security & Correctness (single PR, two logical files + tests).** Applied on the *existing* `validation.ts` and `richtext-render.ts`. Diff must stay small and auditable; it must **not** be coupled with the module split.
- **Phase 2 — Mechanical Split (separate PR, zero logic change).** `validation.ts` → 5 modules (`richtext-sanitizer.ts`, `file-branch.ts`, `schema-builders.ts`, `cache.ts`, `index.ts`). Pure move; reviewable as cut-and-paste. No behavior change permitted in this PR.
- The two phases must **not** be merged into one diff. Rationale: coupling a security-critical patch with a large restructure produces an unreviewable diff on the exact file attackers touch.

**Input-gate edge cases (`validation.ts`)**

- String-form RichText input → **rejected** as a structured `ValidationDetail` (not thrown).
- Node walker: any node whose `type` is not on the allowlist → rejected. Allowlist is derived from the TipTap extensions actually enabled at render (heading, paragraph, image [base64 disabled], text-align, table family, highlight, super/subscript, etc.); exact set finalized downstream.
- Link protocol check runs on normalized values: strip **all** internal whitespace and control chars first, then match against the protocol allowlist. Obfuscation vectors (`java\tscript:`, embedded newlines/CR) must fail.
- `data:` and `vbscript:` are **not** on the allowlist → rejected (covers the `data:text/html;base64` vector).
- DoS pre-checks: raw byte-size limit and nesting-depth limit (50) evaluated **before** walk/stringify. Rejection is fail-fast and structured.
- Numeric `step` check must accept scientific-notation steps (`1e-7`) without silent failure.

**Render-sink edge cases (`richtext-render.ts`)**

- `normalizeRichtextForRender`: a **string** value → returns `null` (previously returned the string as-is).
- Consequently `renderRichText` returns `''` for string input — no verbatim pass-through remains.
- `null` / empty / non-`doc` object → `''` (unchanged).
- Valid `{ type:'doc' }` and v1 envelope → rendered via TipTap extensions (unchanged).
- The misleading "stringa sanificata" docstring must be corrected to reflect drop-to-empty.

**Test obligations**

- Update `richtext-render.test.ts`: the assertion `renderRichText('<div>Legacy</div>') === '<div>Legacy</div>'` must change to expect `''`.
- Add regression tests for each confirmed bypass in #147/#148 (they must now be rejected/neutralized) and for depth/size fail-fast in #149.
- Scientific-notation step regression test.

**Data-at-rest decision**

- Legacy string rows are handled by **drop-to-empty at render**, not migration. Justified: project is at v0.6 with **no real production data** to preserve. Legacy string content renders blank but safe; no HTML sanitizer is pulled into the bundle.

**Invariant to preserve**

- `validation.ts` must not introduce new runtime `throw` paths; failures remain structured results.

---

# 5. Out of Scope (Discarded during sparring)

Explicitly excluded to prevent feature creep in planning:

- **SeedRegistry version-token caching fix** (`getHydratedRegistry` / skip `listActive()` when version unchanged) — correct *direction*, but: the file/function do **not** exist yet (net-new infra), the data-loss root cause it targets is **already fixed**, and it lives in a different (content/registry) layer. → **Own separate brief.**
- **Two-level `WeakMap` + `Map` validation cache** — obviated by the registry fix above; building both would be two competing solutions to one problem. Excluded here.
- **Plain-`WeakMap` validation-cache simplification / fingerprint (`JSON.stringify`) removal** — depends on the registry fix; deferred with it.
- **File-URL double-validation dedup** (idea #6) and **granular per-relation schema caching** (idea #5-eff) — pure efficiency, no open-bug pressure.
- **`(issue as any).errors` Zod typing cleanup** (idea #8) — cosmetic; would pollute the "zero-logic-change" Phase 2 split. Deferred.
- **Fingerprint-completeness guard test** (idea #10) — test-hardening for the caching path that is itself out of scope. Deferred.
- **Rich Domain Model / OOP (Option 1)** and **Smart Constructor + Readonly POJO (Option 2)** — already rejected in `idea.md` on architectural grounds (violates `types.ts` "pure data shapes" invariant; Zod already fills the role). Not revisited.
- **Importing DOMPurify / sanitize-html into the Workers bundle** — rejected; JSON-only + allowlist removes the need and preserves isolate startup/CPU budget.
