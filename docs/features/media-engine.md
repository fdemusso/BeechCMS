---
title: Direct-to-R2 Media Engine
description: Zero-memory edge storage architecture for Cloudflare R2 and S3-compatible buckets in BeechCMS.
---

# Direct-to-R2 Media Engine

Traditional CMS architectures funnel file uploads through the application server, buffering megabytes of binary data into server memory. On serverless edge runtimes (such as Cloudflare Workers with strict 128 MB RAM ceilings), streaming heavy media files quickly leads to CPU exhaustion and Out-Of-Memory crashes.

BeechCMS solves this with an edge-native **Direct-to-R2 Media Engine**:
1. The Edge Worker serves solely as an authorization, MIME validation, and key negotiation gatekeeper.
2. The client uploads the binary payload **directly to Cloudflare R2 / S3 storage** via AWS Signature V4 presigned URLs.
3. Zero upload bytes touch Worker memory.

<p align="center">
  <img src="/images/media-engine-pipeline.svg" alt="BeechCMS Direct-to-R2 Zero-Memory Upload Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Core Capabilities

- **Zero Worker Memory Footprint**: Large images, PDFs, and assets bypass Worker RAM completely.
- **Strict Edge Validation**: Filename sanitization, MIME-type whitelisting, and file-size ceilings (50 MB default, up to 500 MB max) are enforced prior to issuing the presigned URL.
- **Collision-Resistant Keys**: Files are keyed with `${timestamp}-${randomSuffix}-${cleanFilename}`, preventing accidental overwrites.
- **Streaming Fallback Route**: For local development or environments without S3 SigV4 credentials, BeechCMS provides an automatic fallback (`POST /api/upload`, `multipart/form-data`) using chunked streaming directly to the storage bucket.
- **Edge Media Serving & Stored-XSS Protection**: Public assets are served via `GET /api/media/:key` with edge caching headers (`Cache-Control: public, max-age=31536000, immutable`), `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'none'; sandbox`. Active MIME types (SVG, HTML, XML) are forced to download as attachments.
- **Private Asset Downloads**: Private/authenticated downloads with ownership and role-based access control are issued as temporary presigned URLs via `GET /api/upload/download-url/:key`.
- **Visual Media Gallery & Editors**: Embedded in the Dashboard via the `MediaGalleryWidget` (with thumbnail overview and automated cross-seed orphan cleanup), schema-driven `file` field editors (`MediaEdit`), and TipTap Rich Text with session-based orphan pruning.

---

## Upload Flow: Step-by-Step

### 1. Request Presigned URL

The client asks BeechCMS for permission to upload:

```typescript
const response = await fetch('/api/upload/presign', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    filename: 'hero-banner.webp',
    mimeType: 'image/webp',
    sizeBytes: 1048576 // 1MB
  })
})

const { uploadUrl, key, expiresIn } = await response.json()
```

### 2. Stream Direct to Storage

The client issues a standard `PUT` request with the binary payload directly against Cloudflare R2:

```typescript
await fetch(uploadUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': 'image/webp'
  },
  body: fileBlob
})
```

### 3. Confirm and Index

Once R2 returns `200 OK`, the client finalizes the upload:

```typescript
const confirmResponse = await fetch('/api/upload/confirm', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ key })
})

const { url } = await confirmResponse.json()
```

---

## Media Asset Serving

BeechCMS delivers assets through the edge Worker with caching and security headers:

```http
GET /api/media/1717000000-a1b2c3d4-hero-banner.webp
```

Response:
```http
HTTP/1.1 200 OK
Content-Type: image/webp
Cache-Control: public, max-age=31536000, immutable
X-Content-Type-Options: nosniff
Content-Security-Policy: default-src 'none'; sandbox
```

> [!NOTE]
> **Stored-XSS Prevention**: Active content MIME types (`image/svg`, `text/`, `application/xml`, `application/xhtml`, `application/javascript`) are forced to download with `Content-Type: application/octet-stream` and `Content-Disposition: attachment; filename="<original-filename>"`.
> When `MEDIA_CDN_URL` is set, public links point directly to the CDN domain rather than routing through the Worker proxy.

---

## Storage Configuration

In your Cloudflare `wrangler.jsonc` (or `wrangler.toml`), bind the native R2 bucket:

```jsonc
{
  "r2_buckets": [
    {
      "binding": "MEDIA_BUCKET",
      "bucket_name": "beech-media-production"
    }
  ]
}
```

For presigned URL generation (client-direct uploads), provide S3-compatible API credentials in environment variables:

```bash
# Cloudflare R2 S3-Compatible API Credentials
R2_ACCESS_KEY_ID="<your-r2-access-key-id>"
R2_SECRET_ACCESS_KEY="<your-r2-secret-access-key>"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
R2_BUCKET_NAME="beech-media-production"

# Optional settings
# MEDIA_CDN_URL="https://cdn.example.com"
# MAX_UPLOAD_BYTES="52428800" # 50 MB (hard cap: 500 MB)
```

> [!TIP]
> If S3 credentials are not configured, the system automatically falls back to native Worker streaming via `POST /api/upload`. If no storage is configured at all, `NullBucket` safely throws `503 Service Unavailable` with setup instructions.

---

## Dashboard Media Gallery & Field Integration

The BeechCMS Dashboard integrates media management across several layers:
- **Dashboard Composer Widget (`MediaGalleryWidget`)**: 
  - **All Grid View**: Displays thumbnail previews of tracked media items from `/api/content/stats/media-library`.
  - **Unused View (Orphan Detection)**: Identifies untracked or orphaned media unreferenced in any Seed file column via `/api/content/stats/unused-media`, allowing one-click deletion via `DELETE /api/upload/:key`.
- **Field Editors (`MediaEdit`)**: Embedded in content entries for single images and multi-asset lists (`branch.type === "file"`). Supports drag-and-drop file uploads, file pickers, external URL input with offscreen rendering probes (`canRenderImageUrl`), and reordering.
- **TipTap Rich Text Integration**: Enables inline drag-and-drop and file uploads. Features session-based orphan pruning that automatically issues `DELETE /api/upload/:key` for images uploaded during an editing session if they are discarded before saving.
