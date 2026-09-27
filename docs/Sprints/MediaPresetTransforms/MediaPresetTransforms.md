# Sprint: MediaPresetTransforms

Edge-native, preset-only image transformation on the existing public route `GET /api/media/:key`.
Every transformation resolves to a named, pre-registered preset; no client-supplied number ever reaches
the transformer. Without a transform query the route behaves byte-for-byte as it does today.

---

### Pre-Computation Analysis

Graph refreshed first with `graphify update . --force` (20 824 nodes, 31 597 edges, 1 933 communities).

#### a) God Nodes identified via CLI

| Node | Degree | Source | Why it matters here |
|------|--------|--------|---------------------|
| `createBeechApp()` | **76** | `apps/api/src/factory.ts:L117` | Composition root. Owns the middleware order and registers `app.get('/api/media/:key{.+}', …)` at L278. The sprint **does not touch this file**: the route, its position (before `apiProtected`, therefore unauthenticated) and the middleware order stay unchanged. |
| `Variables` | **46** | `apps/api/src/types.ts:L155` | Per-request context contract read by every slice. Gains exactly one field (`imageTransformer`). Additive: no existing reader destructures the full object. |
| `serveMediaHandler()` | 6 | `apps/api/src/features/upload/index.ts:L308` | The only function whose behaviour changes. Out-edges: `safeDecodeKey`, `sanitizeStorageKey`, `extractOriginalFilename`, `isActiveMimeType` (all slice-private). In-edges: `factory.ts` only. Its signature `(c: Context<AppEnv>) => Promise<Response>` is preserved. |
| `createBucketProvider()` | — | `apps/api/src/shared/storage/factory.ts:L134` | Selects `S3Bucket` / `R2BucketAdapter` / `NullBucket`. Not modified; the transform path consumes whichever `BeechBucket` it yields. |
| `BeechBucket` | 3 | `packages/core/src/common/storage.ts:L25` | Storage port. **Not modified.** `get()` already returns `{ body, contentType, size }`, which is all the transform path needs. |

`graphify explain "uploadRoutes"` → degree 2 (`factory.ts`, `index.ts`): the upload slice is a leaf.

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` — media policy (pure) | **Yes (new)** | `packages/core/src/media/media-transform.ts`: preset catalog, query parser, canonicaliser, derived-dimension clamp, ETag, `If-None-Match` matcher. Zero I/O. |
| `@beechcms/core` — media port | **Yes (new)** | `packages/core/src/media/image-transformer.ts`: `IImageTransformer` interface. |
| `@beechcms/core` — barrel | **Yes** | `packages/core/src/index.ts`: two `export *` lines next to the existing `./media/*` exports (L15, L27, L93). |
| `@beechcms/core` — `BeechBucket` / `GetBucketResult` | **No** | `graphify affected "GetBucketResult" --depth 2` → *No affected nodes*. Not changed. |
| `apps/api` — shared infra | **Yes** | NEW `shared/media/cloudflare-images.transformer.ts` (adapter over `ImagesBinding`). NEW `shared/utils/edge-cache.ts` (`resolveEdgeCache` moved from `public/cache-utils.ts`, which re-exports it). |
| `apps/api` — middleware | **Yes** | `middleware/storage.middleware.ts`: also sets `imageTransformer` from `env.IMAGES`. Registration position (step 3 in `factory.ts:L146`) unchanged. |
| `apps/api` — types | **Yes** | `types.ts`: `Env` gains `IMAGES?`, `MEDIA_PRESETS?`, `MEDIA_MAX_DIMENSION?`; `Variables` gains `imageTransformer`. |
| `apps/api/features/upload` | **Yes** | `index.ts` (`serveMediaHandler` gains one early branch), NEW `media-transform.ts` (transform path). |
| `apps/api/features/*` (any other slice) | **No** | Zero files. |
| `apps/api` — D1 / migrations | **No** | Zero SQL, zero migrations, zero repositories touched. |
| `apps/dashboard` | **No** | Zero files. |
| `@beechcms/client` | **Yes (new)** | `src/media/index.ts`: pure `media()` / `mediaSrcSet()` URL builders. Package keeps `"dependencies": {}`. |
| `@beechcms/api-client`, `mcp`, `cli`, `testing` | **No** | Zero files. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "serveMediaHandler" --depth 2
- factory.ts                              [imports]      apps/api/src/factory.ts:L1
- factory.csp.test.ts                     [imports_from] apps/api/src/factory.csp.test.ts:L1
- factory.custom-routes.test.ts           [imports_from] apps/api/src/factory.custom-routes.test.ts:L1
- factory.docs-parity.test.ts             [imports_from] apps/api/src/factory.docs-parity.test.ts:L1
- index.ts                                [imports_from] apps/api/src/index.ts:L1
- flow-media-assets.test.ts               [imports_from] apps/api/test/flow/flow-media-assets.test.ts:L1
- flow-*.test.ts (20 further flow suites) [imports_from] apps/api/test/flow/…
- content-*.integration.test.ts (4)       [imports_from] apps/api/src/features/content/test/integration/…

$ graphify affected "createBucketProvider" --depth 2
- repository.middleware.ts   [imports]      apps/api/src/middleware/repository.middleware.ts:L1
- storage.middleware.ts      [imports]      apps/api/src/middleware/storage.middleware.ts:L1
- queue-consumer.ts          [imports]      apps/api/src/shared/jobs/queue-consumer.ts:L1
- dispatchQueueBatch()       [calls]        apps/api/src/shared/jobs/queue-consumer.ts:L19
- factory.test.ts            [imports]      apps/api/src/shared/storage/factory.test.ts:L1
- createBeechApp()           [calls]        apps/api/src/factory.ts:L117
- queue()                    [calls]        apps/api/src/index.ts:L69

$ graphify affected "BeechConfig" --depth 2
No affected nodes found.

$ graphify affected "GetBucketResult" --depth 2
No affected nodes found.
```

**Breaking-change verdict: none.**
- Every depth-2 dependant of `serveMediaHandler` reaches it *through `factory.ts`* (they import
  `createBeechApp`, not the handler). The handler's signature is unchanged and its no-query branch is
  unchanged line-for-line, so none of those suites can observe a difference. The only observable change
  for existing callers: a request carrying one of the *discarded free-form* parameters
  (`w`, `h`, `width`, `height`, `fit`, `q`) now gets `400` instead of the original — mandated by the brief
  §3 story 4 and asserted by a dedicated test.
- `createBucketProvider` is not modified; `storage.middleware.ts` only adds one `context.set`.
- `BeechConfig` is not modified (no `imageTransformer` override is added — see VETO §4).
- `GetBucketResult` / `BeechBucket` are not modified.

**VSA boundary proof:**
```
$ graphify path "serveMediaHandler" "D1Database"
Shortest path (4 hops):
  serveMediaHandler() <--imports-- factory.ts <--imports_from-- index.ts --re_exports--> init() --calls--> createD1Database()
```
The only route from the handler to D1 runs *backwards* through its importer (`factory.ts`) into the
composition root (`index.ts` → `init()`). There is no forward edge from the upload slice to any D1
binding or repository, and the new transform path adds none (it reads `c.var.bucket` and
`c.var.imageTransformer` only).

---

### VETO Audit

**1. THE BOTANICAL INVARIANT — no D1 query bypasses `@beechcms/core`.**
- ✅ The sprint issues **zero D1 statements**. The transform path never reads `media_objects`, any
  `content_{slug}` table, or any Branch. `mediaRepository` is not consulted: the R2 object's own
  `contentType` and `size` are the source of truth, exactly as in today's `serveMediaHandler`.
- ✅ No hardcoded field names, no `br_XX` involvement: media keys are storage identifiers, not content
  branches. `apiToDb` / `dbToApi` are not on this path and must not be.
- ✅ All policy (catalog, validation, canonicalisation, clamp, ETag) lives in `@beechcms/core` as pure
  functions; `apps/api` only wires I/O around it.

**2. VSA ENFORCEMENT — zero cross-feature imports.**
- ✅ `features/upload/media-transform.ts` imports only from `@beechcms/core`, `../../types` and
  `../../shared/utils/edge-cache`.
- ✅ `resolveEdgeCache` currently lives in `apps/api/src/public/cache-utils.ts` and is consumed by
  `public/public-read.ts`. Importing it from `features/upload` would create a `features → public` edge.
  Per `ponytail_arch.md` §3 it is **moved** to `shared/utils/edge-cache.ts`; `public/cache-utils.ts`
  imports and re-exports it so `public-read.ts` is untouched.
- ✅ The Cloudflare Images adapter lives in `shared/media/` (infrastructure), injected by middleware
  like `bucket`. The slice depends on the core port `IImageTransformer`, never on `ImagesBinding`.

**3. CLOUDFLARE PURITY.**
- ✅ Transformation through the **Workers Images binding** (`env.IMAGES`), variant caching through the
  **Workers Cache API** (`caches.default`). No WASM, no ORM, no background job, no new table, no KV.
- ✅ Environments without the binding (Vitest, Miniflare, self-hosted) get a passthrough, per brief.

**4. YAGNI / RUTHLESS VETO.**
- ✅ No new route, no new table, no dashboard file, no rate limiter, no canonical-URL redirect.
- ✅ No `BeechConfig.imageTransformer` override: nothing in the brief needs a pluggable transformer, and
  the handler's unit tier mounts it on a bare Hono app with injected variables. Cut.
- ✅ No AVIF, no `fit`/gravity options, no per-seed catalog.

**Violations found and corrected during this audit:**

1. **`fetch(url, { cf: { image } })` (proposed in `idea.md` §D) is rejected in favour of the Images
   binding.** `cf.image` transforms a *URL*, not bytes: the Worker would have to either fetch its own
   `/api/media/:key` (a self-subrequest through the full middleware chain) or hand Cloudflare a presigned
   S3 URL — which `R2BucketAdapter.presignGet` cannot produce (it throws 501,
   `r2-bucket.ts:L207`). `ImagesBinding.input(stream)` consumes the stream that `BeechBucket.get()`
   already returns, so it works identically over `S3Bucket` and `R2BucketAdapter`, and
   `ImagesBinding.info(stream)` yields the source dimensions that the derived-height clamp (brief §4)
   needs *before* spending a transformation. The binding contract is verified in
   `apps/api/worker-configuration.d.ts:L11732-11787`.

2. **Passthrough must not be cacheable.** The brief's passthrough reuses the variant URL. If it kept
   today's `Cache-Control: public, max-age=31536000, immutable`, every browser and CDN that saw it before
   the operator enabled `IMAGES` would pin the *untransformed original* under the *variant URL* for a
   year, with no revalidation possible. Passthrough therefore responds `Cache-Control: no-store`, carries
   no `ETag`, and is never written to the Cache API.

3. **Redefining a preset under the same name would serve stale variants.** `MEDIA_PRESETS` can change
   `card` from 400×300 to 600×400. If the ETag and edge-cache key were derived from the preset *name*
   only, the old bytes would be served (and 304-confirmed) indefinitely. Both are derived from the
   preset's **definition signature** (`crop:400x300`, `scale:640`) as well. Browsers already holding an
   `immutable` variant cannot be reached; `docs/reference/media-engine.md` instructs operators to
   rename a preset rather than redefine it.

4. **A cached variant must not outlive its source.** `DELETE /api/upload/:key` removes the R2 object but
   cannot purge `caches.default` in other colos. A Cache API hit is therefore confirmed with one
   `bucket.head(key)` (metadata only, no body, no transformation) before being served; a missing source
   returns 404 and evicts the local entry. The expensive part — the transformation — is still cached.

5. **Cache API responses have immutable headers.** The global security-header middleware
   (`factory.ts:L197-205`) calls `context.header(...)` after `next()`. A `Response` returned straight
   from `cache.match()` would make those writes throw. Every response the transform path returns is a
   freshly constructed `Response` (`new Response(hit.body, hit)` on hits).

**VERDICT: APPROVED.** Both invariants hold. Proceed to the linear plan.

---

### Scope Gate

**Fits ONE sprint.** No D1 migration, no schema change, no dashboard work. The core additions are pure
and additive and compile in the same PR as their only consumer (`features/upload`); the client
utilities have no dependency on the API landing first (they build strings). One PR, one CI run,
validated end-to-end by the unit and integration tiers below. No `backlog/ROADMAP.md` is written.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

`GET /api/media/:key` is the only public, unauthenticated, edge-cacheable binary route BeechCMS has.
Authors upload 4–8 MB originals; consumer sites ship them unmodified and pay for it in LCP, or bolt on
Cloudinary/Imgix. This sprint turns that route into a bounded media-delivery layer without adding a
second route or a second trust boundary.

The ordering inside the sprint is forced by the invariants:

1. **Core first.** Everything that decides *whether* a transformation is legal — the catalog, the
   forbidden-parameter rule, the derived-height clamp, the canonical key, the ETag — is pure policy and
   belongs in `@beechcms/core` (Botanical rule: core is the single source of truth). The API must not
   contain a second copy of any of it.
2. **Port before adapter.** `IImageTransformer` is defined in core so the upload slice never learns
   that `ImagesBinding` exists. The Cloudflare adapter is shared infrastructure, injected by
   `storageMiddleware` exactly as `bucket` is.
3. **Slice change last and smallest.** The upload slice gains one early branch in
   `serveMediaHandler` and one new file in the same slice. No other slice is touched (VSA).
4. **Client utilities are strings only.** `@beechcms/client` stays dependency-free; it reproduces the
   canonical query format (three parameters, fixed order) and nothing else. The server never trusts
   that format: it re-parses and re-canonicalises independently.

The anti-DoS property is structural: the set of possible variants per asset is
`|catalog| × 3 formats × 3 qualities`, all fixed at deploy time. No input from an unauthenticated
caller can grow that set.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Route registration** (`apps/api/src/factory.ts`, `createBeechApp`, degree 76):

```
L129  app.use('*', repositoryMiddleware(...))        // 1. repositories
L143  app.use('*', seedRegistryMiddleware())         // 2. seed registry
L146  app.use('*', storageMiddleware({ bucket }))    // 3. sets c.var.bucket   ← gains imageTransformer
L150  app.use('*', queueMiddleware(...))
L152  app.use('*', authProvidersMiddleware(...))
L153  app.use('*', rateLimiterMiddleware(...))
L154  app.use('*', observabilityMiddleware())
L156  app.use('*', cors(...))
L197  app.use('*', security headers AFTER next())    // overwrites CSP on every non-/admin response
L208  app.use('/api/*', analytics AFTER next())      // counts 2xx
L230+ auth / setup / password-reset / rbac-public / oauth
L273  app.route('/api/v1/public', apiPublic)
L276  app.route('/api/webhooks', webhooksApp)
L278  app.get('/api/media/:key{.+}', (context) => serveMediaHandler(context))   // PUBLIC, no auth
L281+ custom routes
L293  app.route('/api', apiProtected)                // authMiddleware → oauthScope → permission
```

The media route is registered before `apiProtected`; no auth, OAuth-scope or RBAC middleware runs on it.
This sprint does not change that.

**Handler** (`apps/api/src/features/upload/index.ts:L308-340`, `serveMediaHandler`):
1. `c.req.param('key')` → `safeDecodeKey` → `sanitizeStorageKey` (400 on failure).
2. `c.var.bucket.get(key)` → 404 if null.
3. Active MIME (`isActiveMimeType`: `image/svg`, `text/`, `application/xml`, `application/xhtml`,
   `application/javascript`, `application/x-javascript`) → `application/octet-stream` +
   `Content-Disposition: attachment`; otherwise the stored `Content-Type`.
4. Headers: `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`,
   `Cache-Control: public, max-age=31536000, immutable`. No `ETag`.
5. Any throw → `500 Internal error` (plain text).
Query string: currently ignored entirely.

**Storage port** (`packages/core/src/common/storage.ts`): `BeechBucket.get(key)` →
`{ body: ReadableStream | ArrayBuffer; contentType?: string; size: number; metadata? } | null`;
`head(key)` → `{ size; contentType?; metadata? } | null`. Implementations: `S3Bucket` (streams via
`transformToWebStream`), `R2BucketAdapter` (`r2Object.body`), `NullBucket` (throws 503
`HTTPException`). Keys are minted by `generateObjectKey` as `<unixSeconds>-<8 hex>-<sanitized name>` and
never overwritten by any route — a key identifies immutable bytes.

**Context contract** (`apps/api/src/types.ts`): `Variables.bucket: BeechBucket` (L178), set by
`storageMiddleware`. `Env` has `MEDIA_BUCKET?`, `R2_*`, `MEDIA_BASE_URL?`, `MEDIA_CDN_URL?`,
`MAX_UPLOAD_BYTES?`; **no** `IMAGES` binding and no media-transform vars.

**Env-with-default pattern already in use:** constant in core (`DEFAULT_EXPORT_MAX_ROWS`,
`transfer.constants.ts:L9`), resolver in the slice (`resolveExportMaxRows`, `features/content/handlers/export.ts:L35`)
— invalid or unset falls back to the default; `resolveMaxUploadBytes` (`upload/index.ts:L18`)
additionally clamps to an absolute cap. This sprint follows both.

**Edge cache:** `resolveEdgeCache(c)` (`apps/api/src/public/cache-utils.ts`) returns
`{ cache: caches.default, executionCtx } | null`; it returns `null` when `caches` is undefined (Node) or
`executionCtx` is unavailable (`app.request()` without a 4th argument). Only consumer:
`public/public-read.ts:L9`.

**Hashing:** `sha256hex(value)` in `packages/core/src/engine/policies.ts:L12`, exported from the core
barrel (L29). Uses `crypto.subtle` (present in Workers and Node ≥ 20).

**Images binding types** (`apps/api/worker-configuration.d.ts`): `ImagesBinding.info(stream)` →
`{ format: 'image/svg+xml' } | { format; fileSize; width; height }`;
`ImagesBinding.input(stream).transform({ width?, height?, fit? }).output({ format, quality? })` →
`ImageTransformationResult` with `image(): ReadableStream<Uint8Array>` and `contentType(): string`.

**Test tiers** (`apps/api`):
- `vitest.config.ts` project `unit` (forks): `src/**/*.test.ts` excluding `src/**/test/integration/**`.
- `vitest.workers.config.ts` (workerd): `src/features/**/test/integration/**/*.test.ts`, real D1 and a
  real Miniflare `MEDIA_BUCKET` R2 binding; **no `IMAGES` binding** → the integration tier exercises the
  passthrough path by construction.
- Harness: `createTestHarness({ db, env, createApp })`, `harness.asUser('admin')`, `harness.anonymous()`
  (`packages/testing/src/harness.ts`). `TestClient.request(path, init)` forwards any `RequestInit`
  (multipart bodies included).

**`@beechcms/client`**: MIT, `"dependencies": {}`, `lib: ["ES2022","DOM"]`, NodeNext `.js` import
suffixes, single-quote style, root barrel `src/index.ts`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**`@beechcms/core`**
| # | File | Kind |
|---|------|------|
| C1 | `packages/core/src/media/image-transformer.ts` | NEW — `IImageTransformer` port + types |
| C2 | `packages/core/src/media/media-transform.ts` | NEW — pure preset/transform policy |
| C3 | `packages/core/src/media/media-transform.test.ts` | NEW — unit tier |
| C4 | `packages/core/src/index.ts` | MOD — two `export *` lines |

**`apps/api`**
| # | File | Kind |
|---|------|------|
| A1 | `apps/api/src/shared/media/cloudflare-images.transformer.ts` | NEW — `IImageTransformer` over `ImagesBinding` |
| A2 | `apps/api/src/shared/media/cloudflare-images.transformer.test.ts` | NEW — unit tier |
| A3 | `apps/api/src/shared/utils/edge-cache.ts` | NEW — `resolveEdgeCache` + `EdgeCache` moved verbatim |
| A4 | `apps/api/src/public/cache-utils.ts` | MOD — import from A3, re-export `resolveEdgeCache` |
| A5 | `apps/api/src/types.ts` | MOD — `Env` +3 fields, `Variables` +1 field |
| A6 | `apps/api/src/middleware/storage.middleware.ts` | MOD — sets `imageTransformer` |
| A7 | `apps/api/src/features/upload/media-transform.ts` | NEW — transform path of the media route |
| A8 | `apps/api/src/features/upload/index.ts` | MOD — `serveMediaHandler` early branch |
| A9 | `apps/api/src/features/upload/media-transform.test.ts` | NEW — unit tier (fake bucket + fake transformer) |
| A10 | `apps/api/src/features/upload/test/integration/media-delivery.integration.test.ts` | NEW — integration tier (real R2, no `IMAGES`) |
| A11 | `apps/api/wrangler.jsonc` | MOD — commented `images` binding block |
| A12 | `apps/api/.dev.vars.example` | MOD — documented `MEDIA_PRESETS` / `MEDIA_MAX_DIMENSION` example |

**`@beechcms/client`**
| # | File | Kind |
|---|------|------|
| K1 | `packages/client/src/media/index.ts` | NEW — `media()`, `mediaSrcSet()` |
| K2 | `packages/client/src/media/media.test.ts` | NEW — unit tier |
| K3 | `packages/client/src/index.ts` | MOD — export K1 |

**Docs**
| # | File | Kind |
|---|------|------|
| D1 | `docs/reference/media-engine.md` | MOD — "Public Media Serving" section + env table |

Explicitly excluded: `factory.ts`, `BeechConfig`, `BeechBucket`, every D1 file, every migration, every
dashboard file, every other feature slice.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

No D1 migration and no SQL in this sprint. Order of execution: C1 → C2 → C4 → C3 → build core →
A3/A4 → A5 → A1/A2 → A6 → A7 → A8 → A9 → A10 → A11/A12 → K1–K3 → D1.

--------------------------------------------------------------------------
### C1 — `packages/core/src/media/image-transformer.ts` (NEW)
--------------------------------------------------------------------------

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** Pixel dimensions of an image. */
export interface MediaDimensions {
  readonly width: number
  readonly height: number
}

/** Output MIME types the transform path may emit. AVIF is deliberately absent (v1). */
export type ImageOutputMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/**
 * A fully resolved transformation. Every number here comes from a pre-registered preset or from
 * MEDIA_QUALITY_VALUES — never from the request.
 */
export interface ImageTransformSpec {
  readonly width: number
  /** Present for crop presets only; scale presets derive height from the source aspect ratio. */
  readonly height?: number
  readonly fit: 'cover' | 'scale-down'
  readonly outputMime: ImageOutputMime
  readonly quality: number
}

export interface TransformedImage {
  readonly body: ReadableStream<Uint8Array>
  readonly contentType: string
}

/**
 * Port for edge image transformation. The API injects a Cloudflare Images adapter when the
 * `IMAGES` binding exists and `null` otherwise; handlers never see the binding itself.
 */
export interface IImageTransformer {
  /** Reads the source's pixel dimensions. Rejects when the stream is not a raster image. */
  probe(source: ReadableStream<Uint8Array>): Promise<MediaDimensions>
  /** Applies the spec and returns the encoded variant. */
  transform(source: ReadableStream<Uint8Array>, spec: ImageTransformSpec): Promise<TransformedImage>
}
```

--------------------------------------------------------------------------
### C2 — `packages/core/src/media/media-transform.ts` (NEW)
--------------------------------------------------------------------------

Exact contents (implementation is part of the contract — it is the anti-DoS policy):

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { sha256hex } from '../engine/policies.js'
import type { ImageOutputMime, ImageTransformSpec, MediaDimensions } from './image-transformer.js'

/** Default ceiling, in pixels, on either side of a derived variant. Covers native 32:9 ultrawide panels. */
export const DEFAULT_MEDIA_MAX_DIMENSION = 5120
/** MEDIA_MAX_DIMENSION may lower the ceiling freely but raise it only this far. */
export const ABSOLUTE_MAX_MEDIA_DIMENSION = 8192

export type MediaOutputFormat = 'original' | 'webp' | 'jpeg'
export type MediaQuality = 'low' | 'medium' | 'high'

export const MEDIA_OUTPUT_FORMATS: readonly MediaOutputFormat[] = ['original', 'webp', 'jpeg']
export const MEDIA_QUALITIES: readonly MediaQuality[] = ['low', 'medium', 'high']
export const DEFAULT_MEDIA_FORMAT: MediaOutputFormat = 'original'
export const DEFAULT_MEDIA_QUALITY: MediaQuality = 'medium'
/** Encoder quality per enum value. `medium` ≈ 82 per the brief. */
export const MEDIA_QUALITY_VALUES: Readonly<Record<MediaQuality, number>> = Object.freeze({ low: 60, medium: 82, high: 92 })

export type MediaPreset =
  | { readonly kind: 'crop'; readonly width: number; readonly height: number }
  | { readonly kind: 'scale'; readonly width: number }

export type MediaPresetCatalog = ReadonlyMap<string, MediaPreset>

export const DEFAULT_MEDIA_SCALE_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1536, 1920, 2560, 3840, 5120] as const

export const DEFAULT_MEDIA_PRESETS: Readonly<Record<string, MediaPreset>> = Object.freeze({
  thumbnail: { kind: 'crop', width: 200, height: 200 },
  avatar: { kind: 'crop', width: 128, height: 128 },
  card: { kind: 'crop', width: 400, height: 300 },
  'og-image': { kind: 'crop', width: 1200, height: 630 },
  hero: { kind: 'crop', width: 1920, height: 800 },
  ...Object.fromEntries(DEFAULT_MEDIA_SCALE_WIDTHS.map((width) => [`w-${width}`, { kind: 'scale', width } as const])),
})

/** Raster sources the transform path accepts. Everything else — SVG, PDF, video, AVIF, BMP, ICO — is refused. */
export const TRANSFORMABLE_MEDIA_MIME_TYPES: readonly ImageOutputMime[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** Parameters of the discarded free-form contract. Their presence is an error, never ignored. */
export const FORBIDDEN_MEDIA_TRANSFORM_PARAMS: readonly string[] = ['w', 'h', 'width', 'height', 'fit', 'q']

export type MediaTransformErrorCode =
  | 'media_param_forbidden'
  | 'media_param_duplicated'
  | 'media_preset_required'
  | 'media_format_invalid'
  | 'media_quality_invalid'
  | 'media_preset_unknown'
  | 'media_not_transformable'
  | 'media_dimension_exceeded'

export interface MediaTransformRequest {
  readonly preset: string
  readonly format: MediaOutputFormat
  readonly quality: MediaQuality
}

export type MediaTransformQuery =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly code: MediaTransformErrorCode }
  | { readonly kind: 'transform'; readonly request: MediaTransformRequest }

/** Thrown by buildMediaPresetCatalog on any malformed MEDIA_PRESETS entry. Fail closed, never fall back. */
export class MediaPresetCatalogError extends Error {
  constructor(readonly reason: string) {
    super(`Invalid media preset catalog: ${reason}`)
    this.name = 'MediaPresetCatalogError'
  }
}

const PRESET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/
const SCALE_NAME_PATTERN = /^w-([1-9]\d*)$/

const invalid = (code: MediaTransformErrorCode): MediaTransformQuery => ({ kind: 'invalid', code })

/**
 * Classifies a media query string. Pure: does not consult the catalog (that is env-dependent and
 * resolved by the caller), so an unknown-but-well-formed preset name returns `transform`.
 */
export function parseMediaTransformQuery(params: URLSearchParams): MediaTransformQuery {
  if (FORBIDDEN_MEDIA_TRANSFORM_PARAMS.some((name) => params.has(name))) return invalid('media_param_forbidden')

  const presets = params.getAll('preset')
  const formats = params.getAll('format')
  const qualities = params.getAll('quality')
  if (presets.length > 1 || formats.length > 1 || qualities.length > 1) return invalid('media_param_duplicated')
  if (presets.length === 0 && formats.length === 0 && qualities.length === 0) return { kind: 'none' }

  const preset = presets[0]
  if (!preset) return invalid('media_preset_required')

  const format = formats[0] ?? DEFAULT_MEDIA_FORMAT
  if (!(MEDIA_OUTPUT_FORMATS as readonly string[]).includes(format)) return invalid('media_format_invalid')

  const quality = qualities[0] ?? DEFAULT_MEDIA_QUALITY
  if (!(MEDIA_QUALITIES as readonly string[]).includes(quality)) return invalid('media_quality_invalid')

  if (!PRESET_NAME_PATTERN.test(preset)) return invalid('media_preset_unknown')

  return { kind: 'transform', request: { preset, format: format as MediaOutputFormat, quality: quality as MediaQuality } }
}

/**
 * Canonical query for a request: fixed order preset → format → quality, defaults omitted.
 * `@beechcms/client` emits exactly this string; the server recomputes it and never trusts the client's.
 */
export function canonicalMediaTransformQuery(request: MediaTransformRequest): string {
  let query = `preset=${encodeURIComponent(request.preset)}`
  if (request.format !== DEFAULT_MEDIA_FORMAT) query += `&format=${request.format}`
  if (request.quality !== DEFAULT_MEDIA_QUALITY) query += `&quality=${request.quality}`
  return query
}

function isPositiveIntegerAtMost(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max
}

function parsePresetEntry(name: string, value: unknown, maxDimension: number): MediaPreset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MediaPresetCatalogError(`preset "${name}" must be an object or null`)
  }
  const entry = value as Record<string, unknown>
  const scaleMatch = SCALE_NAME_PATTERN.exec(name)

  if (entry.kind === 'crop') {
    if (Object.keys(entry).some((field) => !['kind', 'width', 'height'].includes(field))) {
      throw new MediaPresetCatalogError(`preset "${name}" has unknown fields`)
    }
    if (scaleMatch) throw new MediaPresetCatalogError(`"${name}" is reserved for scale presets`)
    if (!isPositiveIntegerAtMost(entry.width, maxDimension) || !isPositiveIntegerAtMost(entry.height, maxDimension)) {
      throw new MediaPresetCatalogError(`preset "${name}" needs integer width/height in 1..${maxDimension}`)
    }
    return { kind: 'crop', width: entry.width, height: entry.height }
  }

  if (entry.kind === 'scale') {
    if (Object.keys(entry).some((field) => !['kind', 'width'].includes(field))) {
      throw new MediaPresetCatalogError(`preset "${name}" has unknown fields (scale presets never take a height)`)
    }
    if (!isPositiveIntegerAtMost(entry.width, maxDimension)) {
      throw new MediaPresetCatalogError(`preset "${name}" needs an integer width in 1..${maxDimension}`)
    }
    if (name !== `w-${entry.width}`) throw new MediaPresetCatalogError(`scale preset "${name}" must be named "w-${entry.width}"`)
    return { kind: 'scale', width: entry.width }
  }

  throw new MediaPresetCatalogError(`preset "${name}" has kind other than "crop" | "scale"`)
}

/**
 * Builds the active catalog: DEFAULT_MEDIA_PRESETS merged by name with `overrides`
 * (the parsed MEDIA_PRESETS JSON). An override value of `null` removes a preset.
 * Defaults larger than `maxDimension` are dropped (they could only ever 400); an operator-supplied
 * preset larger than `maxDimension` is an error.
 *
 * @throws {MediaPresetCatalogError} on any malformed override.
 */
export function buildMediaPresetCatalog(overrides: unknown, maxDimension: number): MediaPresetCatalog {
  const catalog = new Map<string, MediaPreset>()
  for (const [name, preset] of Object.entries(DEFAULT_MEDIA_PRESETS)) {
    const largest = preset.kind === 'crop' ? Math.max(preset.width, preset.height) : preset.width
    if (largest <= maxDimension) catalog.set(name, preset)
  }
  if (overrides === undefined) return catalog

  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    throw new MediaPresetCatalogError('MEDIA_PRESETS must be a JSON object keyed by preset name')
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (!PRESET_NAME_PATTERN.test(name)) throw new MediaPresetCatalogError(`"${name}" is not a valid preset name`)
    if (value === null) {
      catalog.delete(name)
      continue
    }
    catalog.set(name, parsePresetEntry(name, value, maxDimension))
  }
  return catalog
}

export function isTransformableMime(mime: string | null | undefined): boolean {
  if (!mime) return false
  const normalised = mime.split(';')[0].trim().toLowerCase()
  return (TRANSFORMABLE_MEDIA_MIME_TYPES as readonly string[]).includes(normalised)
}

/**
 * Output dimensions of a scale preset (`fit=scale-down`: never upscales). Returns `null` when either
 * side would exceed `maxDimension` — the pathological-aspect-ratio guard of brief §4. Never truncates.
 */
export function deriveScaleOutput(presetWidth: number, source: MediaDimensions, maxDimension: number): MediaDimensions | null {
  if (source.width <= 0 || source.height <= 0) return null
  const output = source.width <= presetWidth
    ? { width: source.width, height: source.height }
    : { width: presetWidth, height: Math.max(1, Math.round((source.height * presetWidth) / source.width)) }
  return output.width > maxDimension || output.height > maxDimension ? null : output
}

/** Identity of a preset's *definition*, so redefining a name never reuses an old variant. */
export function mediaPresetSignature(preset: MediaPreset): string {
  return preset.kind === 'crop' ? `crop:${preset.width}x${preset.height}` : `scale:${preset.width}`
}

/** Precondition: `isTransformableMime(sourceMime)` is true. */
export function buildImageTransformSpec(preset: MediaPreset, request: MediaTransformRequest, sourceMime: string): ImageTransformSpec {
  const outputMime: ImageOutputMime = request.format === 'webp'
    ? 'image/webp'
    : request.format === 'jpeg'
      ? 'image/jpeg'
      : (sourceMime.split(';')[0].trim().toLowerCase() as ImageOutputMime)
  const quality = MEDIA_QUALITY_VALUES[request.quality]
  return preset.kind === 'crop'
    ? { width: preset.width, height: preset.height, fit: 'cover', outputMime, quality }
    : { width: preset.width, fit: 'scale-down', outputMime, quality }
}

/**
 * Strong ETag of a variant: source identity (key + size — keys are never overwritten) plus the
 * canonical request plus the preset definition. Format: `"mv1-<32 hex>"`.
 */
export async function computeMediaVariantEtag(
  source: { readonly key: string; readonly size: number },
  request: MediaTransformRequest,
  preset: MediaPreset,
): Promise<string> {
  const digest = await sha256hex(`${source.key}\n${source.size}\n${canonicalMediaTransformQuery(request)}\n${mediaPresetSignature(preset)}`)
  return `"mv1-${digest.slice(0, 32)}"`
}

/** RFC 9110 §13.1.2: `*` matches; otherwise weak comparison against a comma-separated list. */
export function ifNoneMatchMatches(header: string | null | undefined, etag: string | null | undefined): boolean {
  if (!header || !etag) return false
  const target = etag.replace(/^W\//, '')
  return header.split(',').some((candidate) => {
    const trimmed = candidate.trim()
    return trimmed === '*' || trimmed.replace(/^W\//, '') === target
  })
}
```

--------------------------------------------------------------------------
### C4 — `packages/core/src/index.ts` (MOD)
--------------------------------------------------------------------------

Insert immediately after L93 (`export * from './media/magic-bytes.js'`):

```ts
export * from './media/image-transformer.js'
export * from './media/media-transform.js'
```

Verify no name collision: `grep -rn "MediaDimensions\|ImageOutputMime\|MediaPreset\b\|MediaQuality" packages/core/src --include=*.ts`
must return only C1/C2 before the change.

--------------------------------------------------------------------------
### C3 — `packages/core/src/media/media-transform.test.ts` (NEW, unit tier)
--------------------------------------------------------------------------

SPDX header (MIT variant used by core: two lines, as in `file-types.ts`). Single quotes. One
`describe` per exported symbol. Required `it()` cases:

`describe('parseMediaTransformQuery')`
- `returns none when no transform parameter is present, even with unrelated parameters` (`?v=3`).
- `refuses every discarded free-form parameter with media_param_forbidden` — matrix over
  `FORBIDDEN_MEDIA_TRANSFORM_PARAMS`, each alone and combined with a valid `preset=card` (Rule 1.6).
- `refuses a repeated preset, format or quality with media_param_duplicated` — matrix.
- `refuses format or quality without a preset with media_preset_required` — matrix incl. `preset=` (empty).
- `refuses a format outside original|webp|jpeg with media_format_invalid` — matrix `avif`, `WEBP`, `''`.
- `refuses a quality outside low|medium|high with media_quality_invalid` — matrix `82`, `max`, `''`.
- `refuses a preset name outside the name grammar with media_preset_unknown` (`../x`, `Card`, 33 chars).
- `applies original and medium when format and quality are omitted`.
- `yields the same request regardless of parameter order` — `quality=high&preset=card&format=webp`
  vs `format=webp&preset=card&quality=high`, `toEqual`.

`describe('canonicalMediaTransformQuery')`
- `omits default format and quality` → `preset=card`.
- `emits preset, format, quality in fixed order` → `preset=card&format=webp&quality=high`.

`describe('buildMediaPresetCatalog')`
- `returns the default catalog when no overrides are given` — asserts `card` = crop 400×300, `w-5120` present, size = 16.
- `adds, redefines and removes presets by name` — `{ banner: crop 1600×400, card: crop 600×400, hero: null }`.
- `drops defaults larger than a lowered ceiling` — `maxDimension 2000` → no `w-2560`/`w-3840`/`w-5120`, `hero` kept (1920).
- `rejects malformed overrides with MediaPresetCatalogError` — matrix: array, string, `{ Bad: … }`,
  `{ x: { kind: 'blur' } }`, `{ x: { kind: 'crop', width: 0, height: 10 } }`, `{ x: { kind: 'crop', width: 1.5, height: 10 } }`,
  `{ 'w-100': { kind: 'crop', width: 100, height: 100 } }`, `{ big: { kind: 'scale', width: 640 } }`,
  `{ 'w-640': { kind: 'scale', width: 640, height: 10 } }`, `{ x: { kind: 'crop', width: 9000, height: 10 } }` (at max 5120).
  Assert `toThrow(MediaPresetCatalogError)`.

`describe('deriveScaleOutput')`
- `downscales keeping the aspect ratio` — 4000×3000 @ 640 → 640×480.
- `never upscales a source narrower than the preset` — 300×200 @ 640 → 300×200.
- `returns null when the derived height exceeds the ceiling` — 1000×60000 @ 640 → null. Comment
  (Rule 6.2.4): regression guard for the pathological-aspect-ratio amplification in brief §4.
- `returns null for a narrow source whose own height exceeds the ceiling` — 300×9000 @ 640 → null.

`describe('buildImageTransformSpec')`
- `maps a crop preset to fit=cover with fixed width and height` (+ webp, quality 82).
- `maps a scale preset to fit=scale-down without a height`.
- `keeps the source MIME when format is original` (`image/png; charset=binary` → `image/png`).

`describe('computeMediaVariantEtag')`
- `is identical for identical inputs` (strong ETag format `/^"mv1-[0-9a-f]{32}"$/`).
- `changes when the preset definition changes under the same name` — Rule 6.2.4 comment: guards VETO correction 3.
- `changes when the source size changes`.

`describe('ifNoneMatchMatches')` — one matrix `it()`: exact, weak `W/`, list, `*`, mismatch, null header.

`describe('isTransformableMime')` — matrix: jpeg/png/gif/webp true; `image/svg+xml`, `application/pdf`,
`image/avif`, `video/mp4`, `undefined` false.

--------------------------------------------------------------------------
### A3 — `apps/api/src/shared/utils/edge-cache.ts` (NEW) and A4 — `apps/api/src/public/cache-utils.ts` (MOD)
--------------------------------------------------------------------------

Move `type EdgeCache` and `resolveEdgeCache` **verbatim** from `public/cache-utils.ts` into
`shared/utils/edge-cache.ts`, with `export type EdgeCache`. Replace the `any` in the moved body with
`let executionCtx: { waitUntil?: (p: Promise<unknown>) => void } | undefined` (no behaviour change).

`public/cache-utils.ts` becomes:

```ts
import { resolveEdgeCache, type EdgeCache } from '../shared/utils/edge-cache'

export { resolveEdgeCache }

export function withCachedResponse(edgeCache: EdgeCache, cacheKey: Request, response: Response): Response {
  // body unchanged
}
```

`public/public-read.ts` is **not** edited.

--------------------------------------------------------------------------
### A5 — `apps/api/src/types.ts` (MOD)
--------------------------------------------------------------------------

Add `IImageTransformer` to the existing `import type { … } from '@beechcms/core'` list (L13).

In `Env`, directly after `MAX_UPLOAD_BYTES?: string` (L67):

```ts
  /**
   * Cloudflare Images binding. When present, `GET /api/media/:key?preset=…` transforms at the edge;
   * when absent the route serves the original with `X-Beech-Media-Transform: passthrough-unsupported`.
   */
  IMAGES?: ImagesBinding
  /**
   * JSON object merged by name over DEFAULT_MEDIA_PRESETS from @beechcms/core; `null` removes a preset.
   * Deliberately absent from wrangler.jsonc `vars`: unset must mean "defaults", exactly like MAX_UPLOAD_BYTES.
   */
  MEDIA_PRESETS?: string
  /** Ceiling in pixels on either side of a derived variant. Unset → DEFAULT_MEDIA_MAX_DIMENSION; capped at ABSOLUTE_MAX_MEDIA_DIMENSION. */
  MEDIA_MAX_DIMENSION?: string
```

In `Variables`, directly after `bucket: BeechBucket` (L178):

```ts
  /** Edge image transformer; `null` when the runtime has no `IMAGES` binding. Set by `storageMiddleware`. */
  imageTransformer: IImageTransformer | null
```

--------------------------------------------------------------------------
### A1 — `apps/api/src/shared/media/cloudflare-images.transformer.ts` (NEW)
--------------------------------------------------------------------------

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IImageTransformer, ImageTransformSpec, MediaDimensions, TransformedImage } from '@beechcms/core'

/**
 * {@link IImageTransformer} over the Workers Images binding. Consumes the stream `BeechBucket.get()`
 * returns, so it works identically behind `S3Bucket` and `R2BucketAdapter`. EXIF orientation is
 * applied by the Images runtime on decode; no `rotate` is passed.
 */
export class CloudflareImagesTransformer implements IImageTransformer {
  constructor(private readonly images: ImagesBinding) {}

  async probe(source: ReadableStream<Uint8Array>): Promise<MediaDimensions> {
    const info = await this.images.info(source)
    if (!('width' in info)) throw new Error('Images binding reported a vector source')
    return { width: info.width, height: info.height }
  }

  async transform(source: ReadableStream<Uint8Array>, spec: ImageTransformSpec): Promise<TransformedImage> {
    const result = await this.images
      .input(source)
      .transform({ width: spec.width, height: spec.height, fit: spec.fit })
      .output({ format: spec.outputMime, quality: spec.quality })
    return { body: result.image(), contentType: result.contentType() }
  }
}
```

### A2 — `apps/api/src/shared/media/cloudflare-images.transformer.test.ts` (NEW, unit tier)

Mocks only the boundary (a hand-built object typed `ImagesBinding` whose `input()` returns a chain
recording its arguments; Rule 3.10). `describe('CloudflareImagesTransformer')`:
- `forwards width, height and fit to transform and format and quality to output` — assert recorded args
  for a crop spec; assert `height` is `undefined` for a scale spec.
- `returns the binding's content type and image stream`.
- `rejects when the binding reports an SVG source` — `info` resolves `{ format: 'image/svg+xml' }`;
  `await expect(…probe(stream)).rejects.toThrow()`.

--------------------------------------------------------------------------
### A6 — `apps/api/src/middleware/storage.middleware.ts` (MOD)
--------------------------------------------------------------------------

Add import `import { CloudflareImagesTransformer } from '../shared/media/cloudflare-images.transformer'`.
After the existing `if/else` that sets `bucket`, before `await next()`:

```ts
    context.set('imageTransformer', context.env.IMAGES ? new CloudflareImagesTransformer(context.env.IMAGES) : null)
```

`StorageOverrides` is **not** extended. Registration order in `factory.ts` is unchanged (step 3).

--------------------------------------------------------------------------
### A7 — `apps/api/src/features/upload/media-transform.ts` (NEW)
--------------------------------------------------------------------------

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Transform path of the public media route. Every legal variant is named by a pre-registered preset
 * (see @beechcms/core media-transform); this file only wires storage, the transformer and the edge cache.
 */
import type { Context } from 'hono'
import {
  ABSOLUTE_MAX_MEDIA_DIMENSION,
  DEFAULT_MEDIA_MAX_DIMENSION,
  MediaPresetCatalogError,
  buildImageTransformSpec,
  buildMediaPresetCatalog,
  canonicalMediaTransformQuery,
  computeMediaVariantEtag,
  deriveScaleOutput,
  ifNoneMatchMatches,
  isTransformableMime,
  mediaPresetSignature,
  type MediaPresetCatalog,
  type MediaTransformErrorCode,
  type MediaTransformRequest,
} from '@beechcms/core'
import type { AppEnv } from '../../types'
import { resolveEdgeCache } from '../../shared/utils/edge-cache'

const VARIANT_CACHE_CONTROL = 'public, max-age=31536000, immutable'

type MediaErrorCode = MediaTransformErrorCode | 'media_preset_catalog_invalid' | 'media_transform_failed'

const MEDIA_ERROR_MESSAGES: Record<MediaErrorCode, string> = {
  media_param_forbidden: 'Free-form transform parameters are not supported; use a named preset',
  media_param_duplicated: 'Transform parameters may appear at most once',
  media_preset_required: 'format and quality require a preset',
  media_format_invalid: 'format must be one of original, webp, jpeg',
  media_quality_invalid: 'quality must be one of low, medium, high',
  media_preset_unknown: 'Unknown media preset',
  media_not_transformable: 'Cannot transform non-raster asset',
  media_dimension_exceeded: 'Derived variant exceeds the maximum dimension',
  media_preset_catalog_invalid: 'Media preset catalog is misconfigured',
  media_transform_failed: 'Image transformation failed',
}

export function mediaTransformError(c: Context<AppEnv>, status: 400 | 500 | 502, code: MediaErrorCode): Response {
  return c.json({ error: code, message: MEDIA_ERROR_MESSAGES[code] }, status)
}

export function resolveMediaMaxDimension(env: { MEDIA_MAX_DIMENSION?: string }): number {
  const raw = env.MEDIA_MAX_DIMENSION
  if (!raw) return DEFAULT_MEDIA_MAX_DIMENSION
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MEDIA_MAX_DIMENSION
  return Math.min(parsed, ABSOLUTE_MAX_MEDIA_DIMENSION)
}

// Per-isolate memo keyed on the raw inputs: a changed binding value rebuilds, a malformed one is
// logged once instead of on every request.
let catalogMemo: { raw: string | undefined; maxDimension: number; result: MediaPresetCatalog | MediaPresetCatalogError } | null = null

export function resolveMediaPresetCatalog(env: { MEDIA_PRESETS?: string; MEDIA_MAX_DIMENSION?: string }): MediaPresetCatalog | MediaPresetCatalogError {
  const raw = env.MEDIA_PRESETS?.trim() || undefined
  const maxDimension = resolveMediaMaxDimension(env)
  if (catalogMemo && catalogMemo.raw === raw && catalogMemo.maxDimension === maxDimension) return catalogMemo.result

  let result: MediaPresetCatalog | MediaPresetCatalogError
  try {
    result = buildMediaPresetCatalog(raw === undefined ? undefined : JSON.parse(raw), maxDimension)
  } catch (error) {
    result = error instanceof MediaPresetCatalogError ? error : new MediaPresetCatalogError('MEDIA_PRESETS is not valid JSON')
    console.error(`[serveMediaHandler] ${result.message}`)
  }
  catalogMemo = { raw, maxDimension, result }
  return result
}

function toStream(body: ReadableStream | ArrayBuffer): ReadableStream<Uint8Array> {
  return body instanceof ArrayBuffer ? new Response(body).body! : (body as ReadableStream<Uint8Array>)
}

async function discard(body: ReadableStream | ArrayBuffer | null | undefined): Promise<void> {
  if (body && !(body instanceof ArrayBuffer)) await body.cancel().catch(() => undefined)
}

function encodeMediaKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function notModified(etag: string): Response {
  return new Response(null, { status: 304, headers: { ETag: etag, 'Cache-Control': VARIANT_CACHE_CONTROL } })
}

/**
 * Serves a preset variant of an already-sanitized storage key.
 * Order: catalog → edge cache (+ source existence) → R2 → raster check → passthrough | ETag/304 →
 * scale clamp → transform → cache write. Every 400 is decided before any transformation runs.
 */
export async function serveTransformedMedia(c: Context<AppEnv>, key: string, request: MediaTransformRequest): Promise<Response> {
  const catalog = resolveMediaPresetCatalog(c.env)
  if (catalog instanceof MediaPresetCatalogError) return mediaTransformError(c, 500, 'media_preset_catalog_invalid')
  const preset = catalog.get(request.preset)
  if (!preset) return mediaTransformError(c, 400, 'media_preset_unknown')

  const { bucket, imageTransformer } = c.var
  const edgeCache = imageTransformer ? resolveEdgeCache(c) : null
  // The preset signature is part of the key so a redefined preset never hits an old variant.
  const cacheKey = new Request(
    `${new URL(c.req.url).origin}/api/media/${encodeMediaKey(key)}?${canonicalMediaTransformQuery(request)}&_p=${mediaPresetSignature(preset)}`,
  )

  if (edgeCache) {
    const hit = await edgeCache.cache.match(cacheKey)
    if (hit) {
      // DELETE /api/upload/:key cannot purge other colos' caches; a cached variant must not outlive its source.
      if (!(await bucket.head(key))) {
        await discard(hit.body)
        edgeCache.executionCtx.waitUntil(edgeCache.cache.delete(cacheKey))
        return new Response('Not found', { status: 404 })
      }
      const cachedEtag = hit.headers.get('ETag')
      if (cachedEtag && ifNoneMatchMatches(c.req.header('If-None-Match'), cachedEtag)) {
        await discard(hit.body)
        return notModified(cachedEtag)
      }
      // Cache API responses carry immutable headers; the security-header middleware writes after next().
      return new Response(hit.body, hit)
    }
  }

  const object = await bucket.get(key)
  if (!object) return new Response('Not found', { status: 404 })

  const sourceMime = object.contentType ?? 'application/octet-stream'
  if (!isTransformableMime(sourceMime)) {
    await discard(object.body)
    return mediaTransformError(c, 400, 'media_not_transformable')
  }

  if (!imageTransformer) {
    // no-store: an immutable passthrough would pin the untransformed original under the variant URL
    // in every browser that saw it before the IMAGES binding was enabled.
    return new Response(object.body, {
      status: 200,
      headers: {
        'Content-Type': sourceMime,
        'Cache-Control': 'no-store',
        'X-Beech-Media-Transform': 'passthrough-unsupported',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  }

  const etag = await computeMediaVariantEtag({ key, size: object.size }, request, preset)
  if (ifNoneMatchMatches(c.req.header('If-None-Match'), etag)) {
    await discard(object.body)
    return notModified(etag)
  }

  let source = toStream(object.body)
  if (preset.kind === 'scale') {
    const [probeStream, transformStream] = source.tee()
    let dimensions
    try {
      dimensions = await imageTransformer.probe(probeStream)
    } catch (error) {
      console.error(`[serveMediaHandler] probe failed for ${key}:`, error)
      await discard(transformStream)
      return mediaTransformError(c, 502, 'media_transform_failed')
    }
    if (!deriveScaleOutput(preset.width, dimensions, resolveMediaMaxDimension(c.env))) {
      await discard(transformStream)
      return mediaTransformError(c, 400, 'media_dimension_exceeded')
    }
    source = transformStream
  }

  let transformed
  try {
    transformed = await imageTransformer.transform(source, buildImageTransformSpec(preset, request, sourceMime))
  } catch (error) {
    console.error(`[serveMediaHandler] transform failed for ${key}:`, error)
    return mediaTransformError(c, 502, 'media_transform_failed')
  }

  const response = new Response(transformed.body, {
    status: 200,
    headers: {
      'Content-Type': transformed.contentType,
      'Cache-Control': VARIANT_CACHE_CONTROL,
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  })
  if (edgeCache) {
    edgeCache.executionCtx.waitUntil(
      edgeCache.cache.put(cacheKey, response.clone()).catch((error: unknown) => {
        console.error(`[serveMediaHandler] cache put failed for ${key}:`, error)
      }),
    )
  }
  return response
}
```

Notes for the executor:
- 502 responses and 400s are never cached (only the 200 path calls `cache.put`).
- Crop presets are not probed: their dimensions are fixed and already ≤ the ceiling by catalog
  construction.
- Keep `console.error` prefixes `[serveMediaHandler]` to match the existing handler's log line.

--------------------------------------------------------------------------
### A8 — `apps/api/src/features/upload/index.ts` (MOD)
--------------------------------------------------------------------------

Imports: extend L10 to `import { isMimeAccepted, parseMediaTransformQuery, SystemClock } from '@beechcms/core'`
and add `import { mediaTransformError, serveTransformedMedia } from './media-transform'`.

Replace `serveMediaHandler` (L307-340) with the following. The legacy block inside `try` is the
existing code, **unchanged character-for-character** after the new first statement:

```ts
/** Serve a file from storage (used by the public /api/media/:key route). */
export async function serveMediaHandler(c: Context<AppEnv>): Promise<Response> {
  const rawKey = c.req.param('key')
  if (!rawKey) return new Response('Missing key', { status: 400 })

  const decoded = safeDecodeKey(rawKey)
  if (!decoded) return new Response('Invalid key', { status: 400 })

  const key = sanitizeStorageKey(decoded)
  if (!key) return new Response('Invalid key', { status: 400 })

  // Decided before any storage I/O: an invalid transform request must not cost an R2 read.
  const transformQuery = parseMediaTransformQuery(new URL(c.req.url).searchParams)
  if (transformQuery.kind === 'invalid') return mediaTransformError(c, 400, transformQuery.code)

  try {
    if (transformQuery.kind === 'transform') return await serveTransformedMedia(c, key, transformQuery.request)

    const object = await c.var.bucket.get(key)
    // … existing lines L320-335, unchanged …
  } catch (err) {
    console.error(`[serveMediaHandler] Error serving file ${key}:`, err)
    return new Response('Internal error', { status: 500 })
  }
}
```

`return await` is required so a rejection from the transform path lands in the existing `catch`.

--------------------------------------------------------------------------
### A9 — `apps/api/src/features/upload/media-transform.test.ts` (NEW, unit tier)
--------------------------------------------------------------------------

Tier: **unit** (project `unit`, forks). Storage and transformer are faked because both cross I/O
boundaries (Rule 0.2); `caches` does not exist in Node, so `resolveEdgeCache` returns `null` and the
edge-cache branch is not exercised here (file docblock must say so and point at §5 step 7).

Arrangement (declared inside the top `describe`, Rule 3.12):
- `class InMemoryBucket implements BeechBucket` — `objects: Map<string, { bytes: Uint8Array; contentType: string }>`,
  `reads = 0` incremented by `get` and `head`; `get` returns `{ body: new Blob([bytes]).stream(), contentType, size: bytes.byteLength }`;
  every other method throws `new Error('not used')`.
- `class RecordingTransformer implements IImageTransformer` — `probeResult: MediaDimensions`,
  `specs: ImageTransformSpec[]`, `fail = false`; `probe` drains its stream and returns `probeResult`;
  `transform` drains, records the spec, returns `{ body: new Blob([OUTPUT_BYTES]).stream(), contentType: spec.outputMime }`
  (throws when `fail`).
- `function buildApp(transformer: IImageTransformer | null)` → `new Hono<AppEnv>()` with one
  `app.use('*', …)` setting `bucket` and `imageTransformer`, and
  `app.get('/api/media/:key{.+}', (c) => serveMediaHandler(c))`.
- `request(path, env = {}, headers = {})` → `app.request(path, { headers }, env)`.
- `beforeEach`: fresh bucket seeded with `1717000000-a1b2c3d4-photo.png` (`image/png`, 16 bytes) and
  `1717000000-a1b2c3d4-doc.pdf` (`application/pdf`); fresh transformer with `probeResult = { width: 4000, height: 3000 }`.

`describe('serveMediaHandler — transform path')`, required `it()`s:
1. `a request without transform parameters keeps the legacy headers and bytes` — 200,
   `Cache-Control: public, max-age=31536000, immutable`, no `ETag`, no `X-Beech-Media-Transform`,
   body equals seeded bytes, `transformer.specs` empty. Rule 6.2.4 comment: backward-compat guard.
2. `a discarded free-form parameter is refused with media_param_forbidden before any storage read` —
   `?w=800`; 400, `error === 'media_param_forbidden'`, `bucket.reads === 0`.
3. `an unknown preset is refused with media_preset_unknown before any storage read` — `?preset=nope`.
4. `format without a preset is refused with media_preset_required` — `?format=webp`.
5. `a non-raster source is refused with media_not_transformable and never transformed` — pdf, `?preset=card`.
6. `a crop preset is transformed with the preset's fixed dimensions and cached immutably` —
   `?preset=card&format=webp`; 200, `Content-Type: image/webp`, immutable `Cache-Control`,
   `ETag` matches `/^"mv1-[0-9a-f]{32}"$/`; `specs[0]` `toEqual({ width: 400, height: 300, fit: 'cover', outputMime: 'image/webp', quality: 82 })`.
7. `parameter order does not change the variant ETag` — two requests, `quality=high&preset=card` vs
   `preset=card&quality=high`; equal ETags. (ACT is the second request; first is ARRANGE.)
8. `a matching If-None-Match is answered 304 without transforming` — ARRANGE: first request to obtain
   the ETag, then reset `transformer.specs`; ACT with `If-None-Match`; 304, empty body, specs empty.
9. `a scale preset whose derived height exceeds the ceiling is refused with media_dimension_exceeded` —
   `probeResult = { width: 1000, height: 60000 }`, `?preset=w-640`; 400, specs empty.
   Rule 6.2.4 comment: pathological aspect ratio (brief §4).
10. `a scale preset is transformed with fit=scale-down and no height` — `?preset=w-640`;
    `specs[0]` `toEqual({ width: 640, fit: 'scale-down', outputMime: 'image/png', quality: 82 })`.
11. `MEDIA_PRESETS adds and removes presets` — matrix `it()` (Rule 1.6, one arrangement):
    env `MEDIA_PRESETS='{"banner":{"kind":"crop","width":1600,"height":400},"hero":null}'`;
    `?preset=banner` → 200 with spec 1600×400; `?preset=hero` → 400 `media_preset_unknown`.
12. `a malformed MEDIA_PRESETS fails closed with media_preset_catalog_invalid` — env `MEDIA_PRESETS='{'`,
    `?preset=card`; 500. Comment (Rule 6.2.3): the no-parameter path under the same env is asserted
    by case 13.
13. `a malformed MEDIA_PRESETS leaves untransformed serving intact` — same env, no query; 200.
14. `a transformer failure is reported as 502 media_transform_failed` — `fail = true`.
15. `a missing key under a valid preset is 404` — `?preset=card` on an absent key.

Every error-path test asserts status first, then `error` code via
`await response.json<{ error: string }>()` (Rules 5.1, 5.4). No message-text assertions.

--------------------------------------------------------------------------
### A10 — `apps/api/src/features/upload/test/integration/media-delivery.integration.test.ts` (NEW)
--------------------------------------------------------------------------

Tier: **integration** (workers pool, real D1, real Miniflare `MEDIA_BUCKET`). No `IMAGES` binding
exists in `vitest.workers.config.ts`, which is exactly the "runtime without native transformations"
case of the brief. Only `IClock`/`ITokenService` are faked (by the harness).

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Upload slice — media delivery, integration tier.
 * Real R2 (Miniflare) and no IMAGES binding: covers validation, the non-raster refusal and the
 * passthrough contract. The transforming branch is covered in the unit tier (media-transform.test.ts).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'
```

Constants (file-local; binary samples are not entities, so Rule 3.5 does not apply):
- `PNG_1X1` = bytes of base64 `iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==`
- `PDF_MINIMAL` = `new TextEncoder().encode('%PDF-1.4\n%%EOF\n')`

Baseline (`beforeEach`, Rule 3.4):
```ts
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      // The media route reads through BeechBucket; the r2Buckets binding in vitest.workers.config.ts
      // provisions a real (simulated) one for this tier.
      env: { MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    visitor = harness.anonymous()
```

Local helper (Rule 3.12): `async function upload(bytes: Uint8Array, name: string, type: string): Promise<string>`
— builds `FormData` with `new File([bytes], name, { type })`, calls
`admin.request('/api/upload', { method: 'POST', body: form })`, asserts `status === 200` in one line,
returns `key` from `response.json<{ key: string }>()`. Seeding goes through the real route (Rule 3.8).

`describe('upload slice — media delivery integration (real R2, no IMAGES binding)')` →
`describe('GET /api/media/:key')`:
1. `without transform parameters serves the original immutably` — 200, `Content-Type: image/png`,
   `Cache-Control: public, max-age=31536000, immutable`, no `X-Beech-Media-Transform`, bytes equal `PNG_1X1`.
2. `a valid preset without the IMAGES binding passes the original through uncached` —
   `?preset=card&format=webp`; 200, `X-Beech-Media-Transform: passthrough-unsupported`,
   `Cache-Control: no-store`, `Content-Type: image/png`, `ETag` null, bytes equal `PNG_1X1`.
   Rule 6.2.4 comment: VETO correction 2 (immutable passthrough would pin originals under variant URLs).
3. `an unknown preset is refused with media_preset_unknown` — 400.
4. `a discarded free-form parameter is refused with media_param_forbidden` — `?w=800&h=600`; 400.
5. `a PDF requested with a preset is refused with media_not_transformable` — upload PDF; 400.
6. `a preset on a key that does not exist is 404` — `/api/media/1717000000-deadbeef-missing.png?preset=card`.

GET is read-only: no zone-4 state assertion is required (Rule 5.5 applies to writes). The uploads
happen in ARRANGE.

--------------------------------------------------------------------------
### A11 — `apps/api/wrangler.jsonc` (MOD)
--------------------------------------------------------------------------

Directly after the R2 comment block (after L32), add a **commented** block — the binding is opt-in,
so `wrangler dev` keeps working unchanged and exercises the passthrough:

```jsonc
  // Cloudflare Images — abilita le trasformazioni a preset su GET /api/media/:key?preset=…
  // Senza binding l'endpoint serve l'originale con X-Beech-Media-Transform: passthrough-unsupported.
  // Catalogo preset e lato massimo: MEDIA_PRESETS / MEDIA_MAX_DIMENSION (vedi .dev.vars.example).
  // "images": { "binding": "IMAGES" },
```

--------------------------------------------------------------------------
### A12 — `apps/api/.dev.vars.example` (MOD)
--------------------------------------------------------------------------

Append after the `MEDIA_BASE_URL` block (after L26):

```
# --- Media transformations (opzionale) ---
# Catalogo preset per GET /api/media/:key?preset=<nome>[&format=original|webp|jpeg][&quality=low|medium|high].
# Se assente valgono i default del core: thumbnail 200x200, avatar 128x128, card 400x300,
# og-image 1200x630, hero 1920x800 (crop, fit=cover) e w-320 … w-5120 (scala, fit=scale-down).
# Il JSON viene unito ai default per nome; null rimuove un preset. I preset "scala" devono
# chiamarsi esattamente "w-<width>". JSON non valido → 500 media_preset_catalog_invalid (fail closed).
# MEDIA_PRESETS={"banner":{"kind":"crop","width":1600,"height":400},"w-1440":{"kind":"scale","width":1440},"hero":null}
# Lato massimo in px di una variante derivata (default 5120, tetto 8192).
# MEDIA_MAX_DIMENSION=5120
```

--------------------------------------------------------------------------
### K1 — `packages/client/src/media/index.ts` (NEW)
--------------------------------------------------------------------------

Zero imports. Reproduces only the canonical query format of `canonicalMediaTransformQuery` (core C2).

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type MediaFormat = 'original' | 'webp' | 'jpeg'
export type MediaQuality = 'low' | 'medium' | 'high'
/** Scale presets are always named after their width; the server rejects any other shape. */
export type MediaScalePreset = `w-${number}`

export interface MediaUrlOptions {
  /** BeechCMS API origin. Used only when `keyOrUrl` is a bare storage key; omitted → root-relative URL. */
  baseUrl?: string
  format?: MediaFormat
  quality?: MediaQuality
}

export interface MediaOptions extends MediaUrlOptions {
  preset: string
}

const MEDIA_PATH = '/api/media/'
const SCALE_PRESET_PATTERN = /^w-([1-9]\d*)$/

function canonicalQuery(preset: string, format: MediaFormat = 'original', quality: MediaQuality = 'medium'): string {
  let query = `preset=${encodeURIComponent(preset)}`
  if (format !== 'original') query += `&format=${format}`
  if (quality !== 'medium') query += `&quality=${quality}`
  return query
}

function resolveMediaPath(keyOrUrl: string, baseUrl?: string): string {
  const bare = keyOrUrl.split('#')[0].split('?')[0]
  if (!bare) throw new TypeError('media(): keyOrUrl is empty')
  if (/^https?:\/\//i.test(bare) || bare.startsWith('/')) {
    if (!bare.includes(MEDIA_PATH)) {
      throw new TypeError(`media(): "${keyOrUrl}" is not a ${MEDIA_PATH} URL; only the BeechCMS media route transforms images`)
    }
    return bare
  }
  const encodedKey = bare.split('/').map(encodeURIComponent).join('/')
  return `${(baseUrl ?? '').replace(/\/+$/, '')}${MEDIA_PATH}${encodedKey}`
}

/** Canonical URL of a preset variant. Existing query and hash on `keyOrUrl` are discarded. */
export function media(keyOrUrl: string, options: MediaOptions): string {
  if (!options.preset) throw new TypeError('media(): preset is required')
  return `${resolveMediaPath(keyOrUrl, options.baseUrl)}?${canonicalQuery(options.preset, options.format, options.quality)}`
}

/**
 * `srcset` value built only from scale presets (`w-<width>`), ascending, de-duplicated.
 * Crop presets are refused: a srcset of fixed crops would lie about intrinsic widths.
 */
export function mediaSrcSet(keyOrUrl: string, presets: readonly MediaScalePreset[], options: MediaUrlOptions = {}): string {
  if (presets.length === 0) throw new TypeError('mediaSrcSet(): at least one scale preset is required')
  const widths = new Map<number, string>()
  for (const preset of presets) {
    const match = SCALE_PRESET_PATTERN.exec(preset)
    if (!match) throw new TypeError(`mediaSrcSet(): "${preset}" is not a scale preset (w-<width>)`)
    widths.set(Number(match[1]), preset)
  }
  return [...widths.entries()]
    .sort(([a], [b]) => a - b)
    .map(([width, preset]) => `${media(keyOrUrl, { ...options, preset })} ${width}w`)
    .join(', ')
}
```

### K3 — `packages/client/src/index.ts` (MOD)

Append:

```ts
export { media, mediaSrcSet } from './media/index.js'
export type { MediaFormat, MediaQuality, MediaScalePreset, MediaOptions, MediaUrlOptions } from './media/index.js'
```

### K2 — `packages/client/src/media/media.test.ts` (NEW, unit tier)

`describe('media')`:
- `builds a root-relative URL from a bare key with defaults omitted` → `/api/media/1717000000-a1b2c3d4-photo.jpg?preset=card`.
- `prefixes baseUrl and emits preset, format, quality in canonical order` →
  `https://cms.example.com/api/media/k.jpg?preset=card&format=webp&quality=high` (with `baseUrl` trailing slash stripped).
- `replaces an existing query and hash on a media URL`.
- `refuses a URL outside the media route` — `https://cdn.example.com/k.jpg` → `toThrow(TypeError)`.
  Rule 6.2.3 comment: MEDIA_CDN_URL links bypass the Worker, so a query there would silently do nothing.
- `refuses an empty preset`.

`describe('mediaSrcSet')`:
- `emits ascending, de-duplicated width descriptors` — `['w-1280', 'w-640', 'w-640']` →
  `'<…preset=w-640> 640w, <…preset=w-1280> 1280w'` (`toBe` on the full string: the string is the contract).
- `carries format and quality into every candidate`.
- `refuses a crop preset name` — `['card' as MediaScalePreset]` → `toThrow(TypeError)`.
- `refuses an empty list`.

--------------------------------------------------------------------------
### D1 — `docs/reference/media-engine.md` (MOD)
--------------------------------------------------------------------------

Replace the body of `## Public Media Serving — GET /api/media/:key` (keep the XSS and CDN paragraphs) and add:
- Query contract table: `preset` (required for any transform), `format` (`original|webp|jpeg`, default
  `original`), `quality` (`low|medium|high` → 60/82/92, default `medium`). Any of `w`, `h`, `width`,
  `height`, `fit`, `q` → 400.
- Default catalog table (5 crop + 11 scale presets).
- Error table: every `MediaErrorCode` with its status (400/500/502) and trigger.
- Caching: variant `Cache-Control: public, max-age=31536000, immutable` + strong `ETag`, `304` on
  `If-None-Match`; edge Cache API keyed on the canonical query; passthrough `no-store`.
- **Operator note:** "Do not redefine a preset under an existing name — browsers that already hold the
  old variant keep it (`immutable`). Add a new name instead."
- Client example: `media(key, { preset: 'card', format: 'webp', baseUrl })` and
  `<img srcset={mediaSrcSet(key, ['w-640','w-1280','w-1920'], { format: 'webp', baseUrl })} sizes="100vw">`.
- Env table rows: `IMAGES` (Binding, optional), `MEDIA_PRESETS` (Var, optional, JSON),
  `MEDIA_MAX_DIMENSION` (Var, optional, default 5120, cap 8192).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless stated otherwise.

1. Core build + unit tests:
   - `pnpm --filter @beechcms/core build`
   - `pnpm --filter @beechcms/core test`
2. API type-check: `npx tsc -p tsconfig.build.json --noEmit` in `apps/api/`
3. API unit tier: `pnpm --filter @beechcms/api test:unit`
4. API integration tier (workerd, real D1 + R2): `pnpm --filter @beechcms/api test:integration`
5. Client build + tests:
   - `pnpm --filter @beechcms/client build`
   - `pnpm --filter @beechcms/client test`
6. Workspace: `pnpm beech test --diff` and `pnpm lint`
7. Manual edge smoke (the only way to exercise `IMAGES` + `caches.default`; not automatable in any tier):
   uncomment `"images": { "binding": "IMAGES" }` locally, `pnpm beech dev`, upload a JPEG with EXIF
   orientation 6, then:
   - `curl -sI "http://localhost:8787/api/media/<key>?preset=card&format=webp"` → `200`,
     `content-type: image/webp`, `etag: "mv1-…"`, no `x-beech-media-transform`; image is upright.
   - repeat with `-H 'If-None-Match: <etag>'` → `304`.
   - `?preset=w-640` on a 1000×60000 PNG → `400` `media_dimension_exceeded`.
   Revert the `wrangler.jsonc` edit before committing.

No `pnpm beech db:migrate` / `db:reset` step: the sprint has no migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `GET /api/media/:key` with no `preset`/`format`/`quality` and none of the forbidden parameters returns exactly today's status, headers (no `ETag`, no `X-Beech-Media-Transform`) and bytes.
- [ ] Any of `w`, `h`, `width`, `height`, `fit`, `q` → `400 media_param_forbidden`, with zero storage reads.
- [ ] Unknown preset, duplicated parameter, format/quality without preset, invalid format/quality → `400` with the specific code, with zero storage reads for everything decidable from the query and catalog.
- [ ] Non-raster source (anything outside jpeg/png/gif/webp) with a preset → `400 media_not_transformable`; transformer never invoked.
- [ ] Scale preset whose derived output exceeds `MEDIA_MAX_DIMENSION` on either side → `400 media_dimension_exceeded`; never truncated, never transformed.
- [ ] Variant responses carry `Cache-Control: public, max-age=31536000, immutable` and a strong `"mv1-…"` `ETag`; matching `If-None-Match` → `304`.
- [ ] Parameter order does not change the ETag or the edge-cache key.
- [ ] Without the `IMAGES` binding: `200`, original bytes, `X-Beech-Media-Transform: passthrough-unsupported`, `Cache-Control: no-store`, no `ETag`, nothing written to the Cache API.
- [ ] `MEDIA_PRESETS` merges by name, `null` removes, malformed → `500 media_preset_catalog_invalid` on transform requests only.
- [ ] `IImageTransformer`, `MediaPreset*`, `parseMediaTransformQuery`, `canonicalMediaTransformQuery`, `buildMediaPresetCatalog`, `deriveScaleOutput`, `computeMediaVariantEtag`, `ifNoneMatchMatches` are exported from `@beechcms/core`; `media-transform.ts` has no I/O and imports nothing outside `packages/core/src`.
- [ ] `features/upload` never references `ImagesBinding` or `env.IMAGES`; only `storage.middleware.ts` does.
- [ ] No file under `apps/api/src/features/upload` imports from another feature slice or from `apps/api/src/public`.
- [ ] `@beechcms/client` `package.json` still has `"dependencies": {}`; `media()`/`mediaSrcSet()` exported from the root barrel.
- [ ] No `any` introduced in production or test code (the moved `resolveEdgeCache` loses its `any`).
- [ ] All new test files follow `testing_conventions.md`: SPDX header, one tier per file, four zones, status-first assertions, error codes not messages, no fake timers, no `.only`/`.skip`.
- [ ] `factory.ts`, `BeechConfig`, `BeechBucket`, D1 migrations and `apps/dashboard` are unchanged (`git diff --stat` shows none of them).
- [ ] Every command in Section 5 steps 1–6 exits 0.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT:
- Accept any free numeric `w`, `h`, `quality` or `fit`, or add a pixel-budget mode (brief §5).
- Add AVIF (input or output), or any filter: blur, sharpen, rotate, watermark, gravity/focal point.
- Add rate limiting to `/api/media/*` (brief §5: the whitelist is the anti-abuse mechanism).
- Touch `GET /api/upload/download-url/:key` or add transformation of private / ownership-gated assets.
- Fetch or proxy any external URL; `media()` must not rewrite `MEDIA_CDN_URL` links.
- Build any dashboard UI (crop editor, preset manager, preview) or any React/Astro component.
- Add a per-seed or per-field preset registry, a D1 table, KV namespace or migration for presets.
- Enable the `images` binding by default in `wrangler.jsonc`, or add a WASM/sharp fallback.
- Add a `BeechConfig.imageTransformer` override, a canonical-URL redirect, or variant purging on `DELETE /api/upload/:key` (edge-cache staleness after deletion is handled by the `head` check in A7).
- Add an `ETag` or any other header to the legacy (no-transform) branch.
- Refactor the rest of `features/upload/index.ts` (key helpers, upload routes) or `factory.ts`.
- Add MCP tools, CLI commands or `@beechcms/api-client` wrappers for media transforms.
