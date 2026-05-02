# BeechCMS — Developer Guide

Everything you need to go from a fresh scaffold to a live project: configuration, content modelling, API consumption, and deployment.

---

## Table of Contents

1. [Scaffolding a New Project](#1-scaffolding-a-new-project)
2. [Project Structure](#2-project-structure)
3. [Configuration](#3-configuration)
   - [wrangler.jsonc](#31-wranglerjsonc)
   - [.dev.vars](#32-devvars)
4. [Defining Content Types (Seeds)](#4-defining-content-types-seeds)
   - [Seed anatomy](#41-seed-anatomy)
   - [Branch types](#42-branch-types)
   - [Branch policies](#43-branch-policies)
5. [Running Locally](#5-running-locally)
6. [Consuming the Public API](#6-consuming-the-public-api)
   - [Authentication](#61-authentication)
   - [Read entries](#62-read-entries)
   - [Submit a form](#63-submit-a-form)
   - [Response format](#64-response-format)
   - [Error format](#65-error-format)
7. [Media (images and files)](#7-media-images-and-files)
8. [CLI Reference](#8-cli-reference)
9. [Deploying to Production](#9-deploying-to-production)

---

## 1. Scaffolding a New Project

```bash
npx beech-cms
```

The interactive wizard asks for:

- **Project name** — used as the directory name and as a prefix for Cloudflare resource names.
- **Content types** — pick from Blog, Gallery, Contact, or start empty.
- **Cloudflare credentials** — Account ID, D1 database ID, R2 bucket and keys. You can skip this and fill them in later.

After the wizard completes, a ready-to-use project is in `./<project-name>/`.

---

## 2. Project Structure

```
my-project/
├── seeds.ts        ← your content type definitions — the only file you write
├── worker.ts       ← Worker entry point — never touch this
├── wrangler.jsonc  ← Cloudflare configuration
├── .dev.vars       ← local secrets (git-ignored)
└── package.json
```

That is the entire project. BeechCMS engine, dashboard, and API logic live inside `node_modules/@beech/api` — invisible, updatable with `npm update @beech/api`.

---

## 3. Configuration

### 3.1 `wrangler.jsonc`

The scaffold pre-fills the values you provided during setup. If you skipped Cloudflare configuration, fill in the placeholders before running the dev server.

```jsonc
{
  "name": "my-project-api",

  "vars": {
    "JWT_SECRET": "...",              // Signs JWT tokens — auto-generated, do not share
    "CORS_ORIGINS": "http://localhost:5173,https://my-site.com",
    "PUBLIC_READ_API_KEY": "...",     // Header key for GET /api/v1/public/* — auto-generated
    "PUBLIC_WRITE_API_KEY": "...",    // Header key for POST/PUT /api/v1/public/* — auto-generated
    "APP_URL": "https://my-site.com" // Production URL (used in password reset emails)
  },

  "d1_databases": [{
    "binding": "DB",
    "database_name": "my-project-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // from Cloudflare dashboard
    "migrations_dir": "node_modules/@beech/api/migrations"  // migrations shipped with the package
  }],

  "r2_buckets": [{
    "binding": "MEDIA_BUCKET",
    "bucket_name": "my-project-media"
  }]
}
```

> **Never commit `JWT_SECRET`, `PUBLIC_READ_API_KEY`, or `PUBLIC_WRITE_API_KEY` to a public repository.**  
> For production, set them as [Wrangler secrets](#step-2--set-production-secrets) instead of plain `vars`.

### 3.2 `.dev.vars`

Contains R2 credentials for the local dev server. This file is git-ignored and never deployed.

```bash
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET_NAME=my-project-media
```

To create R2 credentials: Cloudflare Dashboard → R2 → **Manage R2 API Tokens** → Create Token → Object Read & Write → scoped to your bucket.

---

## 4. Defining Content Types (Seeds)

`seeds.ts` is the only file you write. It defines your content model using `defineSeed()` from `@beech/core`.

### 4.1 Seed anatomy

```typescript
import { defineSeed } from '@beech/core'

export const posts = defineSeed({
  slug: 'posts',             // used in API URLs: /api/v1/public/posts
  label: 'Post',             // singular label in the dashboard
  labelPlural: 'Posts',      // plural label in the dashboard
  displayNameAlias: 'title', // which field is the entry title in lists
  allowPublicRead: true,     // expose via the unauthenticated Public API
  allowDrafts: true,         // enable pending-draft workflow
  branches: [
    { alias: 'title',       label: 'Title',       type: 'text',     requiredOnCreate: true },
    { alias: 'publishedAt', label: 'Published at', type: 'date' },
    { alias: 'coverImage',  label: 'Cover image', type: 'file' },
    { alias: 'body',        label: 'Body',        type: 'richtext' },
  ],
})

// Export an array — passed to createBeechApp in worker.ts
export const seeds = [posts]
```

**Branch `alias` rules:**
- Must be unique within the Seed.
- Re-naming an alias after the first deploy requires a SQL migration (`ALTER TABLE RENAME COLUMN`).
- The `alias` is used as the SQL column name in `content_{slug}`.

### 4.2 Branch types

| Type | Description | Notes |
|---|---|---|
| `text` | Single-line string | Titles, names, URLs |
| `number` | Integer or float | |
| `boolean` | True / false toggle | |
| `date` | ISO 8601 date string | |
| `richtext` | Structured rich text | TipTap document — render with `richTextToHtml()` from `@beech/core` |
| `file` | R2 asset URL | Single file; add `multiple: true` for a list of URLs |
| `json` | Array or object | Add `options: [...]` for a tag / select field |

### 4.3 Branch policies

Policies control visibility and access per field. All fields default to fully public and searchable unless you override them.

```typescript
{
  alias: 'email',
  label: 'Email',
  type: 'text',
  policies: {
    visibility: 'masked', // 'full' (default) | 'masked' | 'hidden'
    public: false,        // exclude from Public API responses
    search: false,        // exclude from full-text search
  }
}
```

| Policy | Values | Default | Effect |
|---|---|---|---|
| `visibility` | `full`, `masked`, `hidden` | `full` | `masked` redacts part of the value; `hidden` omits it entirely |
| `public` | `boolean` | `true` | `false` strips the field from all `/api/v1/public/*` responses |
| `search` | `boolean` | `true` | `false` excludes the field from full-text search indexing |
| `filter` | `boolean` | `true` | `false` hides the field from dashboard filter options |
| `sort` | `boolean` | `true` | `false` prevents sorting by this field |

After editing `seeds.ts`, Wrangler picks up the code changes automatically. However, **you must synchronize the database schema** if you added or changed fields. 

Run the following command to apply schema changes to your D1 database:

```bash
npx beech seed:load --local
```

---

## 5. Running Locally

```bash
npm install         # install dependencies (first time only)
npx beech seed:load # synchronize D1 schema with your seeds.ts
npx wrangler dev    # start the Worker on http://localhost:8789
```

Open `http://localhost:8789/dashboard` — the setup wizard will appear on first launch to create your admin account.

---

## 6. Consuming the Public API

The Public API is designed for external frontends. It requires no user login — only an API key header.

**Base URL (local):** `http://localhost:8789`  
**Base URL (production):** your Cloudflare Worker URL (e.g. `https://my-project-api.workers.dev`)

### 6.1 Authentication

| Operation | Header | Key variable in `wrangler.jsonc` |
|---|---|---|
| Read (`GET`) | `X-API-Key: <key>` | `PUBLIC_READ_API_KEY` |
| Write (`POST`, `PUT`) | `X-API-Key: <key>` | `PUBLIC_WRITE_API_KEY` |

### 6.2 Read entries

```
GET /api/v1/public/:seed
```

Returns a paginated list of entries. The seed must have `allowPublicRead: true`.

```javascript
const res = await fetch('https://my-project-api.workers.dev/api/v1/public/posts', {
  headers: { 'X-API-Key': 'your-public-read-key' }
})
const { data, meta } = await res.json()
// data  → array of entries
// meta  → { total, page, pageSize, hasNextPage }
```

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Entries per page (default: 20, max: 100) |
| `sort` | string | Field alias to sort by (e.g. `publishedAt`) |
| `order` | `asc` \| `desc` | Sort direction (default: `desc`) |
| `search` | string | Full-text search query |

**Fetch a single entry by ID:**

```
GET /api/v1/public/:seed/:id
```

```javascript
const res = await fetch(`https://my-project-api.workers.dev/api/v1/public/posts/${id}`, {
  headers: { 'X-API-Key': 'your-public-read-key' }
})
const { data } = await res.json()
```

### 6.3 Submit a form

```
POST /api/v1/public/:seed/add
```

Creates a new entry. The seed must have `allowPublicPost: true`.

```javascript
const res = await fetch('https://my-project-api.workers.dev/api/v1/public/messages/add', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-public-write-key'
  },
  body: JSON.stringify({
    name: 'Jane Doe',
    email: 'jane@example.com',
    subject: 'Hello',
    message: 'Your message here'
  })
})
const { data } = await res.json()
// data.id → ID of the created entry
```

### 6.4 Response format

```json
{
  "data": [
    { "id": "abc123", "title": "My first post", "publishedAt": "2026-01-15" }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "hasNextPage": true
  }
}
```

Fields with `policies.public: false` are automatically stripped from all Public API responses.

### 6.5 Error format

All errors follow [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) (`application/problem+json`):

```json
{
  "type": "https://beech.cms/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "Request payload failed schema validation.",
  "errors": [
    { "field": "email", "message": "Required" }
  ]
}
```

| Status | Meaning |
|---|---|
| `401` | Missing or invalid API key |
| `404` | Entry or seed not found |
| `422` | Validation error — check `errors` for field-level details |
| `429` | Rate limit exceeded |

---

## 7. Media (images and files)

Files are stored in Cloudflare R2. To serve an image from a `file` field:

```
GET /api/media/:key
```

The `key` is the value stored in the field (the R2 object key).

```javascript
// Field value: "uploads/2026/01/cover.jpg"
const imageUrl = `https://my-project-api.workers.dev/api/media/uploads/2026/01/cover.jpg`
```

File uploads are handled by the dashboard. The Public API does not support direct file uploads.

---

## 8. CLI Reference

| Command | Description |
|---|---|
| `npx beech-cms` | Scaffold a new BeechCMS project |
| `npm install` | Install dependencies |
| `npx beech seed:load` | Synchronize D1 schema with your seeds.ts (targets remote by default) |
| `npx beech seed:load --local` | Synchronize local D1 schema (for development) |
| `npx beech seed:load --diff` | Compare Seed definitions with current DB schema |
| `npx beech seed:load --dry-run` | Print the SQL that would be executed without running it |
| `npx wrangler dev` | Start the Worker locally on port 8789 |
| `npm run deploy` | Deploy the Worker code to Cloudflare |

---

## 9. Deploying to Production

### Step 1 — Create Cloudflare resources (if not done during scaffolding)

```bash
npx wrangler d1 create my-project-db
npx wrangler r2 bucket create my-project-media
```

Copy the `database_id` from the D1 output into `wrangler.jsonc`.

### Step 2 — Set production secrets

R2 credentials must be set as Wrangler secrets (not plain `vars`) so they are never visible in the dashboard:

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler secret put R2_ENDPOINT
npx wrangler secret put R2_BUCKET_NAME
```

### Step 3 — Deploy and Synchronize

1. **Deploy the code:**
   ```bash
   npm run deploy
   ```
   Wrangler automatically applies any pending **system migrations** (users, auth, media tracking) from `node_modules/@beech/api/migrations`.

2. **Synchronize the content schema:**
   ```bash
   npx beech seed:load
   ```
   This command compiles your `seeds.ts` and applies the necessary `CREATE TABLE` and `ALTER TABLE` statements to your **production** D1 database.

### Step 4 — Deploy the dashboard

The BeechCMS dashboard is a static SPA served by the Worker. No separate deployment is needed — it is included in `@beech/api` and available at `/dashboard` after `npm run deploy`.
