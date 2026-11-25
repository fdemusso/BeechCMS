# Execution Log: Zero-Secret Public Form Ingestion & Anti-Bot Defense Layer

## SECTION 6 — ACCEPTANCE CRITERIA
- [x] `TokenBucketRateLimiter` is implemented in `@beechcms/core` with capacity 17 and continuous refill (~1 token / 3.53s), fully tested with deterministic `IClock`.
- [x] `ITimeTrapTokenRepository` contract is defined in `@beechcms/core` and implemented via `D1TimeTrapTokenRepository` in `apps/api`.
- [x] D1 migration `0037_time_trap_tokens.sql` creates `public_time_trap_tokens` table with TTL index.
- [x] `GET /api/v1/public/timetrap/token` issues HMAC tokens without requiring `X-API-Key`.
- [x] `POST /api/v1/public/:seed/add` executes in Zero-Secret mode (no API key required when public submissions are enabled on the seed).
- [x] Missing Time-Trap token is rejected with HTTP `422 Unprocessable Entity`.
- [x] Replayed Time-Trap token is rejected with HTTP `422 Unprocessable Entity`.
- [x] Submissions faster than 1.5s or older than 3600s are rejected with HTTP `422 Unprocessable Entity`.
- [x] Non-empty honeypot decoy fields trigger HTTP `422 Unprocessable Entity` and emit a `security_alert` in `activity_logs`.
- [x] Mismatched client origins trigger HTTP `403 Forbidden` when `ALLOWED_ORIGINS` is configured.
- [x] Client-supplied record `status` is ignored; initial status is strictly backend-driven (defaulting to `published`).
- [x] File attachments with spoofed extensions/MIME signatures are rejected with HTTP `400 Bad Request`.
- [x] `@beechcms/forms-react` (`useBeechForm` & `<BeechForm />`) seamlessly supports zero-secret submissions, automatic token fetching, honeypot injection, and draft recovery in `localStorage`.
- [x] All tests across `@beechcms/core`, `apps/api`, and `@beechcms/forms-react` pass with zero regressions.

## SECTION 5 — VALIDATION OUTPUT
- `pnpm --filter @beechcms/core build && pnpm --filter @beechcms/core test`: PASS (32 test files, 597 passed)
- `pnpm --filter @beechcms/api type-check && pnpm --filter @beechcms/api test`: PASS (107 test files, 1228 passed)
- `pnpm --filter @beechcms/forms-react build && pnpm --filter @beechcms/forms-react test`: PASS (7 test files, 41 passed)
- `pnpm beech test`: PASS (10/10 tasks successful)
- `graphify update .`: PASS (AST synchronized: 10273 nodes, 18414 edges)
