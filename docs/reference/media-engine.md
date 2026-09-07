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

**Stored XSS Prevention:** Active content types (`image/svg`, `text/`, `application/xml`, `application/xhtml`, `application/javascript`) are forced to download as `Content-Type: application/octet-stream` with `Content-Disposition: attachment` and `Content-Security-Policy: default-src 'none'; sandbox`.

**CDN Acceleration:** When `MEDIA_CDN_URL` is configured, public links point directly to the CDN domain rather than the Worker.

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

---

## Storage Abstraction

BeechCMS uses a vendor-agnostic storage layer (`BeechBucket`, `@beechcms/core`):

- **`S3Bucket`**: S3-compatible HTTP client (`@aws-sdk/client-s3`). Generates presigned URLs for client-side uploads both in production (Cloudflare R2 with API token) and in local development (MinIO).
- **`R2BucketAdapter`**: Wrapper over Cloudflare's native `R2Bucket` binding. Optimized for in-worker streaming and deletions.
- **`NullBucket`**: Fail-safe fallback that returns HTTP 503 (`storage_not_configured`) with setup instructions when storage credentials are not provided.
