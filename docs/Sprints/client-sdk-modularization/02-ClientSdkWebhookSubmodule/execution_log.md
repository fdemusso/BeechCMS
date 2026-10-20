# Execution Log

## Completed Acceptance Criteria
- [x] `packages/client/package.json` includes `./webhooks` subpath export targeting `./dist/webhooks/index.js` and `./dist/webhooks/index.d.ts`.
- [x] `packages/client/src/webhooks/index.ts` is implemented using exclusively standard Web Crypto (`crypto.subtle`) with zero external runtime dependencies.
- [x] `verifyBeechWebhookSignature({ payload, signature, secret })` validates HMAC-SHA256 signatures in constant time, accepting both `sha256=<hex>` and raw `<hex>` formats, returning `false` on any validation failure without throwing.
- [x] `constructWebhookEvent<T>({ payload, signature, secret })` validates the signature and returns parsed payload `T`, throwing `WebhookVerificationError` on signature/secret/parameter failure and letting `SyntaxError` surface naturally on malformed JSON.
- [x] `WebhookVerificationError` extends `Error` with `name = 'WebhookVerificationError'`.
- [x] `BEECH_SIGNATURE_HEADER` constant (`'x-beechcms-signature'`) and types (`VerifyWebhookSignatureOptions`, `ConstructWebhookEventOptions`) are exported from both `@beechcms/client/webhooks` and `@beechcms/client`.
- [x] Legacy `verifyBeechSignature` function and file `packages/client/src/webhook.ts` are removed.
- [x] Unit tests in `packages/client/src/webhooks/webhooks.test.ts` pass with 100% green coverage.
- [x] `pnpm run build && pnpm run test && pnpm run lint` execute cleanly with zero errors across the monorepo.

## Validation Output
```text
pnpm --filter @beechcms/client run build && pnpm --filter @beechcms/client run type-check && pnpm --filter @beechcms/client run test
$ tsc
$ tsc --noEmit
$ vitest run
Test Files  3 passed (3)
     Tests  34 passed (34)

pnpm run build
Tasks:    8 successful, 8 total
Cached:    6 cached, 8 total

pnpm run test
Tasks:    10 successful, 10 total
Cached:    3 cached, 10 total

pnpm run lint
Tasks:    10 successful, 10 total
Cached:    3 cached, 10 total

graphify update .
Graph has 10228 nodes, 18350 edges, 906 communities.
AST graph synchronized.
```
