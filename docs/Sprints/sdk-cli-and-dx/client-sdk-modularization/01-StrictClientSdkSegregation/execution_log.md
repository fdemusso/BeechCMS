# Execution Log: Strict Client SDK Segregation

## Acceptance Criteria

- [x] `packages/client/package.json` specifies valid subpath exports for `.`, `./browser`, `./server`, and `./webhooks`.
- [x] Root import `@beechcms/client` exports only types, interfaces, `buildSearchParams`, and webhook verification utilities. `createBeechClient` is NOT exported from the root barrel.
- [x] `@beechcms/client/browser` exports `createBeechBrowserClient` and `createBeechClient`, exposing only read-only operations (`list`, `get`). Methods `create` and `update` do not exist on its interface or runtime object.
- [x] `@beechcms/client/server` exports `createBeechServerClient` and `createBeechClient`, exposing full CRUD operations (`list`, `get`, `create`, `update`) and supporting `RequestOptions` pass-through (headers, signal, cache, next).
- [x] Both browser and server clients perform immediate configuration validation throwing an error when `baseUrl` or `apiKey` is empty or missing.
- [x] Base URLs with trailing slashes are automatically normalized without malformed double slashes in request URLs.
- [x] Low-level fetch network failures are caught and returned as `{ data: null, error: { type: 'about:blank', title: 'Network Error', status: 0, detail: ... } }` without throwing unhandled exceptions.
- [x] HTTP 4xx and 5xx responses are normalized into RFC 9457 `BeechProblem` structures, populating `errors` for 422 responses.
- [x] All `@beechcms/client` tests pass (browser client, server client, query builder, webhooks).
- [x] Zero changes to `@beechcms/core`, `apps/api`, or `apps/dashboard`.

## Validation Outputs

### 1. `pnpm --filter @beechcms/client run type-check`
```
$ tsc --noEmit
```

### 2. `pnpm --filter @beechcms/client run build`
```
$ tsc
```

### 3. `pnpm --filter @beechcms/client run test`
```
$ vitest run

 RUN  v4.1.8 /Users/flaviodemusso/Documents/Progetti/BeechCMS/packages/client

 ✓ src/query-builder.test.ts > buildSearchParams > empty query returns empty params 1ms
 ✓ src/query-builder.test.ts > buildSearchParams > shorthand equality filter 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > operator object filter 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > multiple filters with OR logic 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > throws on invalid operator 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > sort maps to orderBy/orderDir 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > limit is clamped to 100 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > fields joined by comma 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > search param forwarded 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > latest param forwarded 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > null filter value uses eq shorthand 0ms
 ✓ src/query-builder.test.ts > buildSearchParams > is_empty operator (no value) 0ms
 ✓ src/webhooks/webhooks.test.ts > BEECH_SIGNATURE_HEADER > has the expected header name 1ms
 ✓ src/webhooks/webhooks.test.ts > verifyBeechWebhookSignature > returns true for signature with sha256= prefix 7ms
 ✓ src/webhooks/webhooks.test.ts > verifyBeechWebhookSignature > returns true for signature without prefix (raw hex) 0ms
 ✓ src/webhooks/webhooks.test.ts > verifyBeechWebhookSignature > returns false for tampered payload 0ms
 ✓ src/webhooks/webhooks.test.ts > verifyBeechWebhookSignature > returns false for wrong secret 0ms
 ✓ src/webhooks/webhooks.test.ts > verifyBeechWebhookSignature > returns false for null / undefined signature 0ms
 ✓ src/webhooks/webhooks.test.ts > verifyBeechWebhookSignature > returns false for empty strings 0ms
 ✓ src/webhooks/webhooks.test.ts > verifyBeechWebhookSignature > returns false for invalid non-hex signature string without throwing 0ms
 ✓ src/webhooks/webhooks.test.ts > constructWebhookEvent > successfully verifies and parses valid event 1ms
 ✓ src/webhooks/webhooks.test.ts > constructWebhookEvent > throws WebhookVerificationError on missing secret 1ms
 ✓ src/webhooks/webhooks.test.ts > constructWebhookEvent > throws WebhookVerificationError on missing signature 0ms
 ✓ src/webhooks/webhooks.test.ts > constructWebhookEvent > throws WebhookVerificationError on invalid signature 0ms
 ✓ src/webhooks/webhooks.test.ts > constructWebhookEvent > surfaces SyntaxError on malformed JSON payload with valid signature 0ms
 ✓ src/server/server-client.test.ts > Server Client (@beechcms/client/server) > throws error on missing or invalid configuration 1ms
 ✓ src/server/server-client.test.ts > Server Client (@beechcms/client/server) > create sends POST request with body to /:seed/add 23ms
 ✓ src/server/server-client.test.ts > Server Client (@beechcms/client/server) > update sends PUT request with body to /:seed/edit/:id 0ms
 ✓ src/server/server-client.test.ts > Server Client (@beechcms/client/server) > forwards custom RequestOptions (headers, signal, next tags) 1ms
 ✓ src/server/server-client.test.ts > Server Client (@beechcms/client/server) > normalizes 422 Unprocessable Entity with errors array 0ms
 ✓ src/server/server-client.test.ts > Server Client (@beechcms/client/server) > encapsulates network errors with status: 0 without throwing 0ms
 ✓ src/server/server-client.test.ts > Server Client (@beechcms/client/server) > alias createBeechClient works identically to createBeechServerClient 0ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > throws error on missing or invalid configuration 1ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > normalizes trailing slashes on baseUrl 25ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > list sends GET request with X-API-Key and search params 0ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > get by id sends GET request with ?id=... 0ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > get by slug sends GET request with ?slug=... 0ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > does NOT expose mutation methods (create, update) 0ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > returns normalized RFC 9457 error on 4xx/5xx HTTP failure without throwing 0ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > encapsulates network errors with status: 0 without throwing 0ms
 ✓ src/browser/browser-client.test.ts > Browser Client (@beechcms/client/browser) > alias createBeechClient works identically to createBeechBrowserClient 0ms

 Test Files  4 passed (4)
      Tests  41 passed (41)
   Duration  187ms
```

### 4. `pnpm --filter @beechcms/core run type-check`
```
$ tsc --noEmit
```

### 5. `pnpm --filter @beechcms/forms-react run type-check`
```
$ tsc --noEmit
```

### 6. `graphify update .`
```
Rebuilt: 10256 nodes, 18405 edges, 919 communities
graph.json, graph.html and GRAPH_REPORT.md updated in graphify-out
Code graph updated.
```
