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
- **Strict Edge Validation**: Filename sanitization, MIME-type whitelisting, and file-size ceilings (50 MB default) are enforced prior to issuing the presigned URL.
- **Collision-Resistant Keys**: Files are keyed with `${timestamp}-${randomSuffix}-${cleanFilename}`, preventing accidental overwrites.
- **Streaming Fallback Route**: For local development or environments without S3 SigV4 credentials, BeechCMS provides an automatic fallback (`POST /api/upload`) using chunked streaming directly to the storage bucket.
- **Edge Media Serving**: Public and authenticated assets are served via `GET /api/media/:key` with optimal caching headers (`Cache-Control: public, max-age=31536000, immutable`).
- **Visual Media Gallery**: Embedded directly in the Dashboard with thumbnail previews, dimension extraction, and instant insertion into Rich Text and Image fields.

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

const { url, filename, mimeType } = await confirmResponse.json()
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
ETag: "w/1717000000"
```

---

## Storage Configuration

In your Cloudflare `wrangler.jsonc` (or `wrangler.toml`), bind the R2 bucket:

```jsonc
{
  "r2_buckets": [
    {
      "binding": "BUCKET",
      "bucket_name": "beech-media-production"
    }
  ]
}
```

For presigned URL generation, provide S3-compatible API credentials in environment variables:

```bash
# Cloudflare R2 S3-Compatible API Credentials
R2_ACCESS_KEY_ID="<your-r2-access-key-id>"
R2_SECRET_ACCESS_KEY="<your-r2-secret-access-key>"
R2_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
```

> [!TIP]
> If credentials are not provided (e.g. during local offline tests), the system gracefully switches to the internal `POST /api/upload` stream handler.

---

## Dashboard Media Gallery

The BeechCMS Dashboard provides a dedicated **Media Gallery** interface:
- **Drag-and-Drop Uploader**: Upload single or multiple files with real-time progress indicators.
- **Card and Grid Views**: Search media by name, filter by MIME category (`image/*`, `application/pdf`, etc.), and copy CDN URLs.
- **Field Pickers**: Embedded directly into Seed field editors for single images, multi-image galleries, and file attachments.
