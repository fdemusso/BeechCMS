# Execution Log — Sprint 5: Type-Safe Client SDK & Webhook Verifier

## SECTION 6 — ACCEPTANCE CRITERIA

- [x] `packages/core/src/webhook-crypto.ts` exists; exports `signWebhookBody` and `verifyWebhookSignature` using **Web Crypto only** (no Node `crypto`/`createHmac` import) → isomorphic.
- [x] `verifyWebhookSignature` uses a constant-time comparison and accepts signatures with or without the `sha256=` prefix.
- [x] `webhook.executor.ts` no longer defines a private `signBody`; imports `signWebhookBody` from `@beechcms/core/webhook-crypto`. Output format and `X-BeechCMS-Signature` header unchanged; all core tests pass.
- [x] `@beechcms/core` exposes `./webhook-crypto` subpath export; importing it does NOT transitively pull tiptap/katex.
- [x] `packages/client` builds to `dist/` with declaration files; only runtime dep is `@beechcms/core` via `./webhook-crypto`. No `hono`, `axios`, `zod`, or React.
- [x] `createBeechClient<SeedRegistryTypes>()` type-narrowing works end-to-end (verified via `tsc --noEmit`).
- [x] Ergonomic filter compiles to server JSON; `sort` → `orderBy`/`orderDir`; `limit` clamped to ≤ 100.
- [x] Auth header sent is `X-API-Key`.
- [x] Every method returns `BeechResult<T>` and never throws; non-2xx problem+json bodies surface in `.error`.
- [x] `verifyBeechSignature` returns `true` for valid sig, `false` for tampered body/wrong secret/null.
- [x] Unit tests cover all shapes. Coverage green.
- [x] `pnpm run build && pnpm run test` pass at root. (`pnpm run lint` is a pre-existing failure: no ESLint config exists anywhere in the monorepo — not introduced by this sprint.)

---

## Validation Output

### Core build + type-check + test
```
$ tsc           → exit 0
$ tsc --noEmit  → exit 0
Test Files  15 passed (15) [+webhook-crypto.test.ts: 10 tests]
Tests  394 passed (394)
```

### API type-check (executor refactor only)
No errors on `webhook.executor.ts`. Pre-existing type errors in test helpers and D1 stubs are unrelated to this sprint.

### Client SDK build + type-check + test
```
$ tsc           → exit 0
$ tsc --noEmit  → exit 0

Test Files  3 passed (3)
Tests  25 passed (25)
  query-builder.test.ts: 12 tests
  client.test.ts: 9 tests
  webhook.test.ts: 4 tests
```

### Whole-monorepo gate
```
pnpm run build  → Tasks: 7 successful, 7 total
pnpm run test   → Tasks: 8 successful, 8 total
```
