## Acceptance Criteria

- [x] `docs/api-reference.md` is hollowed out and contains a clear migration banner.
- [x] 11 new granular markdown files exist inside `docs/reference/`, corresponding to the old monolithic sections.
- [x] `docs/.vitepress/config.mts` defines a structured, multi-group sidebar for `/reference/`.
- [x] `docs/reference/index.md` serves as a comprehensive hub page for all reference documentation.
- [x] `pnpm exec vitepress build docs` completes with zero errors and zero broken links.
- [x] No changes are made to application source code (`@beechcms/core`, `apps/api`, `apps/dashboard`).
- [x] `Pre-Computation Analysis` and `VETO Audit` are explicitly present at the top of this plan.

## Validation Output

```text
$ pnpm exec vitepress build docs

  vitepress v1.6.4

- building client + server bundles...
✓ building client + server bundles...
- rendering pages...
✓ rendering pages...
build complete in 6.68s.
```

```text
$ graphify update .
Re-extracting code files in . (no LLM needed)...
[graphify watch] No code-graph topology changes detected; outputs left untouched.
Code graph updated.
```

## Subagent Code Audit & Discrepancy Resolution Summary

11 parallel subagents verified each documentation slice against the actual AST codebase. All discovered discrepancies were corrected in `docs/reference/*.md`:

1. **`widget-api.md`**: Fixed route paths to `/api/widget/<action>/:seed` (6 endpoints total). Corrected query mechanics from `json_extract` to relational columns with alias resolution. Corrected SQL time filter to `>` operator, negative growth handling, and field decryption via ALE.
2. **`seed-builder.md`**: Fixed payload contract keys (`newAlias` for rename, `newType` for retype). Added missing `POST /api/seeds/:slug/branches` route. Corrected `orphans` response wrapper to `{ "orphans": [...] }`. Aligned retype mechanism documentation to temporary column CAST swap.
3. **`internal-content.md`**: Corrected payload schemas for POST/PUT to flat root objects instead of `{ "data": ... }`. Aligned responses (`{ id }` for POST, `{ success: true }` for PUT). Added `GET /api/content/drafts` and fixed `rotate-field` keys.
4. **`public-api.md`**: Replaced non-existent global schema endpoint with zero-secret `GET /api/v1/public/:seed/schema`. Corrected filter operators to snake_case (`has_any_tag`, `not_contains`, `starts_with`). Documented honeypot anti-spam tokens and enriched `{ success, id, slug, data, meta }` response shape.
5. **`automations-api.md`**: Corrected trigger contract to `triggers: [{ event, cron? }]` array. Structured conditions using recursive `WhenNode` (`predicate` / `group`). Required `body_template` on webhooks and documented SSRF protection.
6. **`media-engine.md`**: Documented direct upload fallback `POST /api/upload` (multipart/form-data). Documented stored XSS defense forcing active MIME types to `application/octet-stream` with sandboxed CSP on `GET /api/media/:key`. Added 403 authorization checks on deletion and download URLs.
7. **`security-stack.md`**: Replaced Cloudflare rate limiting claims with BeechCMS in-engine Dual-Key Token Bucket (IP + email). Aligned `authMiddleware` code snippet with empty-token check. Verified D1 `refresh_tokens` schema against `0000_v040_base.sql`. Corrected token rotation sequence order.
8. **`auth-endpoints.md`**: Feature flag `passwordReset` true for `EMAIL_PROVIDER=smtp` OR `RESEND_API_KEY`. Documented reset link route `${APP_URL}/admin/reset-password` and 503 body format. Documented Dual-Key Token Bucket rate limits and 72-byte UTF-8 ceiling for bcrypt.
9. **`error-model.md`**: Updated standard reference to RFC 9457 (obsoleting RFC 7807). Added all 20 active Public API problem types to the problem directory.
10. **`architecture.md`**: Aligned hook file location to `packages/core/src/common/hooks.ts` and Auth to `apps/api/src/auth/`. Added `queue?: IQueueService` to `HookContext`. Aligned `beforeUpdate(id, patches, ctx)` signature.
11. **`dashboard-layout.md`**: Fixed scope format example to `"scope": "role:editor"`. Documented semantic validation rules (duplicate widget IDs and duplicate page slugs).
