# Media Engine

BeechCMS implements a storage layer designed for Cloudflare R2 and S3-compatible object storage (MinIO). In the primary architecture, the Worker acts as a gatekeeper (authenticating, validating, and presigning), while the client uploads binaries directly to storage via presigned SigV4 URLs.

For environments where S3 credentials are unavailable, BeechCMS also provides an automatic fallback route (`POST /api/upload`, multipart/form-data) that streams bytes directly through the Worker.

**Client upload sequence (Presigned SigV4):**

```
1. POST /api/upload/presign  →  { uploadUrl, key, expiresIn }
2. PUT <uploadUrl> (direct to R2/S3)  →  200 OK
3. POST /api/upload/confirm  →  { url }
```

---

## Presign — `POST /api/upload/presign`

Generates an AWS Signature V4 presigned PUT URL (TTL 900 s) for direct client-to-storage uploads. Requires JWT authentication.

**Request**

```http
POST /api/upload/presign
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "filename": "photo.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 204800
}
```

**Response `200 OK`**

```json
{
  "uploadUrl": "https://<bucket>.r2.cloudflarestorage.com/1717000000-a1b2c3d4-photo.jpg?X-Amz-Signature=...",
  "key": "1717000000-a1b2c3d4-photo.jpg",
  "expiresIn": 900
}
```

Generated keys follow the pattern: `${timestamp}-${randomSuffix}-${sanitizeFilename(filename)}`, where `randomSuffix` is an 8-character random string preventing collision.

**Error responses:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "filename is required" }` | Missing filename |
| `400` | `{ "error": "mimeType is required" }` | Missing MIME type |
| `400` | `{ "error": "sizeBytes must be a positive number" }` | Missing or invalid file size |
| `400` | `{ "error": "File too large. Max <N> bytes" }` | Size exceeds configured limit |
| `400` | `{ "error": "File type not allowed" }` | MIME type not accepted |
| `501` | `{ "error": "presigned_urls_require_s3_credentials" }` | Running native R2 without S3 API credentials |
| `503` | `{ "error": "storage_not_configured" }` | Storage unconfigured (`NullBucket`) |

**Size limits:**
- Default: **50 MB** (`DEFAULT_MAX_UPLOAD_BYTES`)
- Configurable via `MAX_UPLOAD_BYTES` env var / secret
- Hard cap: **500 MB** (`ABSOLUTE_MAX_UPLOAD_BYTES`)

---

## Direct Upload Fallback — `POST /api/upload`

Multipart form-data fallback route. Used automatically by the dashboard client when S3 presigning is not configured on the Worker.

**Request**

```http
POST /api/upload
Authorization: Bearer eyJ...
Content-Type: multipart/form-data

[file binary payload]
```

**Response `200 OK`**

```json
{
  "url": "https://api.beech.local/api/media/1717000000-a1b2c3d4-photo.jpg"
}
```

---

## Confirm — `POST /api/upload/confirm`

Verifies that the object was written to storage via `HEAD`, validates physical byte size and MIME type, registers metadata in `media_objects`, and updates storage counters. **Idempotent**: subsequent confirm calls on the same key return 200 without duplicating tracking or stats.

**Request**

```http
POST /api/upload/confirm
Authorization: Bearer eyJ...
Content-Type: application/json

{ "key": "1717000000-a1b2c3d4-photo.jpg" }
```

**Response `200 OK`**

```json
{ "url": "https://api.beech.local/api/media/1717000000-a1b2c3d4-photo.jpg" }
```

**Error responses:**

| Status | Body | Condition |
|---|---|---|
| `400` | `{ "error": "key is required" }` | Missing key field |
| `400` | `{ "error": "Invalid key format" }` | Path traversal (`..`) or malformed key format |
| `400` | `{ "error": "File too large. Max <N> bytes" }` | Storage HEAD size exceeds cap |
| `400` | `{ "error": "File type not allowed" }` | Storage HEAD MIME type disallowed |
| `404` | `{ "error": "Object not found in storage" }` | Object missing from bucket |

---

## Download URL — `GET /api/upload/download-url/:key`

Generates a presigned read URL with a 900-second TTL for private assets.

**Access Control:** The caller must have the `admin` role or be the user who originally uploaded the file (`media.uploaded_by === userId`). Non-owners receive `403 Forbidden`.

**Response `200 OK`**

```json
{ "downloadUrl": "https://...", "expiresIn": 900 }
```

---

## Public Media Serving — `GET /api/media/:key`

Public proxy that streams assets from Cloudflare R2 / MinIO with `Cache-Control: public, max-age=31536000, immutable`. Does not require authentication.

With no transform query, the route behaves byte-for-byte as it always has. Adding `preset` transforms the image at the edge through the Cloudflare Images binding — every legal variant is a pre-registered, named preset; no client-supplied number ever reaches the transformer.

**Query contract**

| Parameter | Values | Default | Notes |
|---|---|---|---|
| `preset` | any catalog preset name | — | Required to trigger a transform. Unknown name → `400 media_preset_unknown`. |
| `format` | `original`, `webp`, `jpeg` | `original` | Requires `preset`. |
| `quality` | `low`, `medium`, `high` (→ 60 / 82 / 92) | `medium` | Requires `preset`. |

Any of `w`, `h`, `width`, `height`, `fit`, `q` in the query → `400 media_param_forbidden`. These free-form parameters are never accepted, never ignored: a fixed, pre-registered preset catalog is the anti-abuse mechanism, since the set of possible variants per asset (`|catalog| × 3 formats × 3 qualities`) is bounded at deploy time.

**Default preset catalog**

| Preset | Kind | Dimensions |
|---|---|---|
| `thumbnail` | crop | 200×200 |
| `avatar` | crop | 128×128 |
| `card` | crop | 400×300 |
| `og-image` | crop | 1200×630 |
| `hero` | crop | 1920×800 |
| `w-320` … `w-5120` | scale (`fit=scale-down`, never upscales) | 320, 480, 640, 768, 1024, 1280, 1536, 1920, 2560, 3840, 5120 |

**Errors**

| Code | Status | Trigger |
|---|---|---|
| `media_param_forbidden` | 400 | A discarded free-form parameter (`w`, `h`, `width`, `height`, `fit`, `q`) is present |
| `media_param_duplicated` | 400 | `preset`, `format` or `quality` repeated |
| `media_preset_required` | 400 | `format`/`quality` given without `preset` |
| `media_format_invalid` | 400 | `format` outside `original`/`webp`/`jpeg` |
| `media_quality_invalid` | 400 | `quality` outside `low`/`medium`/`high` |
| `media_preset_unknown` | 400 | `preset` not in the active catalog |
| `media_not_transformable` | 400 | Source MIME is not jpeg/png/gif/webp |
| `media_dimension_exceeded` | 400 | A scale preset's derived output would exceed `MEDIA_MAX_DIMENSION` on either side |
| `media_preset_catalog_invalid` | 500 | `MEDIA_PRESETS` is malformed (fails closed) |
| `media_transform_failed` | 502 | The Images binding rejected the probe or the transform |

**Caching:** A transformed variant carries `Cache-Control: public, max-age=31536000, immutable` and a strong `ETag` (`"mv1-…"`, derived from the source key, its size, the canonical request and the preset's *definition* — not just its name — so redefining a preset never serves a stale variant under the same name). A matching `If-None-Match` answers `304`. Parameter order never changes the ETag or the edge-cache key: both are derived from the canonical query. The edge Cache API (`caches.default`) is keyed on that same canonical query, and a cache hit is revalidated with a metadata-only `bucket.head()` so a variant can never outlive its deleted source.

Without the `IMAGES` binding, a preset request passes the original through unmodified: `200`, `X-Beech-Media-Transform: passthrough-unsupported`, `Cache-Control: no-store`, no `ETag`, and nothing is written to the edge cache — an immutable passthrough would otherwise pin the untransformed original under the variant URL for a year, in every browser or CDN that saw it before the binding was enabled.

> **Operator note:** Do not redefine a preset under an existing name — browsers that already hold the old variant keep it (`immutable`). Add a new name instead.

**Stored XSS Prevention:** Active content types (`image/svg`, `text/`, `application/xml`, `application/xhtml`, `application/javascript`) are forced to download as `Content-Type: application/octet-stream` with `Content-Disposition: attachment` and `Content-Security-Policy: default-src 'none'; sandbox`.

**CDN Acceleration:** When `MEDIA_CDN_URL` is configured, public links point directly to the CDN domain rather than the Worker.

**Client usage (`@beechcms/client`)**

```ts
import { media, mediaSrcSet } from '@beechcms/client'

media(key, { preset: 'card', format: 'webp', baseUrl })

// <img srcset={mediaSrcSet(key, ['w-640', 'w-1280', 'w-1920'], { format: 'webp', baseUrl })} sizes="100vw">
```

---

## Delete — `DELETE /api/upload/:key`

Deletes the object from storage, removes its tracking row from `media_objects`, and decrements `total_storage_bytes` in `system_stats`.

**Access Control:** The caller must have the `admin` role or be the original uploader (`uploaded_by === userId`). Non-owners receive `403 Forbidden`.

**Response `200 OK`**

```json
{ "success": true }
```

---

## Environment Variables & Bindings

| Name | Type | Description |
|---|---|---|
| `MEDIA_BUCKET` | Binding | Cloudflare Worker native R2 bucket binding (`env.MEDIA_BUCKET`) |
| `R2_ACCESS_KEY_ID` | Secret | S3-compatible API token access key (for SigV4 presigning) |
| `R2_SECRET_ACCESS_KEY` | Secret | S3-compatible API token secret key |
| `R2_ENDPOINT` | Var | S3 endpoint URL (`https://<account_id>.r2.cloudflarestorage.com` or local MinIO) |
| `R2_BUCKET_NAME` | Var | Target bucket name |
| `MEDIA_CDN_URL` | Var (Optional) | CDN origin URL for public media |
| `MEDIA_BASE_URL` | Var (Optional) | Custom base URL for media endpoints |
| `MAX_UPLOAD_BYTES` | Var (Optional) | Max upload limit in bytes (default 50 MB, hard cap 500 MB) |
| `IMAGES` | Binding (Optional) | Cloudflare Images binding; enables preset transformations on `GET /api/media/:key` |
| `MEDIA_PRESETS` | Var (Optional) | JSON preset catalog merged by name over the defaults; `null` removes a preset |
| `MEDIA_MAX_DIMENSION` | Var (Optional) | Ceiling in px on a derived variant's side (default 5120, hard cap 8192) |

---

## Storage Abstraction

BeechCMS uses a vendor-agnostic storage layer (`BeechBucket`, `@beechcms/core`):

- **`S3Bucket`**: S3-compatible HTTP client (`@aws-sdk/client-s3`). Generates presigned URLs for client-side uploads both in production (Cloudflare R2 with API token) and in local development (MinIO).
- **`R2BucketAdapter`**: Wrapper over Cloudflare's native `R2Bucket` binding. Optimized for in-worker streaming and deletions.
- **`NullBucket`**: Fail-safe fallback that returns HTTP 503 (`storage_not_configured`) with setup instructions when storage credentials are not provided.
