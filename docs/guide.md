# BeechCMS — Developer Guide

Everything you need to go from a fresh scaffold to a live project: configuration, content modelling, API consumption, and deployment.

---

## Table of Contents

1. [Scaffolding a New Project](#1-scaffolding-a-new-project)
2. [Project Structure](#2-project-structure)
3. [Configuration](#3-configuration)
   - [wrangler.jsonc / wrangler.toml](#31-wranglerjsonc--wrangler-toml)
   - [.dev.vars](#32-devvars)
4. [Defining Content Types (Seeds)](#4-defining-content-types-seeds)
   - [Seed anatomy](#41-seed-anatomy)
   - [Branch types](#42-branch-types)
   - [Branch policies](#43-branch-policies)
   - [Dashboard config](#44-dashboard-config)
5. [Running Locally](#5-running-locally)
   - [CORS in development](#cors-in-development)
   - [API key echo](#api-key-echo)
6. [Consuming the Public API](#6-consuming-the-public-api)
   - [Authentication](#61-authentication)
   - [Discover available content types](#62-discover-available-content-types-schema-endpoint)
   - [Read entries](#63-read-entries)
   - [Submit a form](#64-submit-a-form)
   - [Response format](#65-response-format)
   - [Error format](#66-error-format)
7. [Media (images and files)](#7-media-images-and-files)
8. [CLI Reference](#8-cli-reference)
9. [Schema Evolution](#9-schema-evolution)
10. [Daily Workflow](#10-daily-workflow)
11. [Deploying to Production](#11-deploying-to-production)

---

## 1. Scaffolding a New Project

```bash
npx @beechcms/cms
```

The interactive wizard asks for:

- **Project name** — used as the directory name and as a prefix for Cloudflare resource names.
- **Content types** — pick from Blog, Gallery, Contact, or start empty.
- **Cloudflare credentials** — Account ID, D1 database ID, R2 bucket and keys. You can skip this and fill them in later.

After the wizard completes, a ready-to-use project is in `./<project-name>/`.

**Non-interactive mode** — skip all prompts with `--yes`. Pass `--with-examples` to scaffold with Blog content types (Posts + Authors) pre-configured:

```bash
npx @beechcms/cms my-project --yes --with-examples
```

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

That is the entire project. BeechCMS engine, dashboard, and API logic live inside `node_modules/@beechcms/api` — invisible, updatable with `npm update @beechcms/api`.

---

## 3. Configuration

### 3.1 `wrangler.jsonc` / `wrangler.toml`

The scaffold pre-fills the values you provided during setup. BeechCMS supports both `.jsonc`, `.json`, and `.toml` formats for your Cloudflare configuration. If you skipped Cloudflare configuration, fill in the placeholders before running the dev server.

```jsonc
{
  "name": "my-project-api",

  "vars": {
    "JWT_SECRET": "...",              // Signs JWT tokens — auto-generated, do not share
    "CORS_ORIGINS": "http://localhost:5173,https://my-site.com",
    "PUBLIC_IDEMPOTENCY_TTL_SECONDS": "3600",
    "DATE_FORMAT": "DD-MM-YYYY",
    "APP_URL": "https://my-site.com",
    "MEDIA_BASE_URL": "https://api.my-site.com", // Base URL for media proxy
    "MEDIA_CDN_URL": "https://cdn.my-site.com"   // Optional: direct CDN/R2 domain
  },

  "assets": {
    "binding": "ASSETS",
    "directory": "./node_modules/@beechcms/api/assets/dashboard"
  },

  "d1_databases": [{
    "binding": "DB",
    "database_name": "my-project-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // from Cloudflare dashboard
    "migrations_dir": "node_modules/@beechcms/api/migrations"  // migrations shipped with the package
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

This file is **optional for local development**. Media uploads work out of the box locally via the Miniflare R2 binding — no credentials needed.

Fill in `.dev.vars` only if you want to test production-like S3 behaviour locally (e.g. verifying CDN URLs or R2 API tokens):

```bash
# .dev.vars — git-ignored, never deployed
# Leave empty for local dev; media uploads work automatically via Miniflare.
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET_NAME=my-project-media
```

To create R2 credentials: Cloudflare Dashboard → R2 → **Manage R2 API Tokens** → Create Token → Object Read & Write → scoped to your bucket.

---

## 4. Defining Content Types (Seeds)

`seeds.ts` is the only file you write. It defines your content model using `defineSeed()` from `@beechcms/core`.

### 4.1 Seed anatomy

```typescript
import { defineSeed } from '@beechcms/core'

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

// Option A — named map (keyed by slug) — RECOMMENDED
export const SEED_REGISTRY = { posts }

// Option B — flat array (slug is read from each seed's definition)
export const seeds = [posts]

// Both export names are accepted by the CLI and by createBeechApp() in your worker.ts.
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
| `richtext` | Structured rich text | TipTap document — render with `richTextToHtml()` from `@beechcms/core` |
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

### 4.4 Dashboard config

Each Seed can include an optional `dashboard` field that controls how it appears in the admin UI. This config is **ignored by the Botanical Engine and the database** — it only affects the dashboard sidebar and content views.

```typescript
export const posts = defineSeed({
  slug: 'posts',
  label: 'Post',
  labelPlural: 'Posts',
  displayNameAlias: 'title',
  branches: [...],

  dashboard: {
    icon: 'Newspaper',      // Lucide icon name — see full list below
    group: 'Blog',          // sidebar section label; seeds with the same group are grouped together
    order: 1,               // sort order within the group (lower = higher)
    hidden: false,          // set true to hide from sidebar entirely
    description: 'Blog posts and articles',  // tooltip shown in the sidebar
    features: {
      search: true,         // show search bar (default: true)
      filter: true,         // show column filters (default: true)
      export: true,         // show export button (default: false)
      bulkDelete: true,     // show bulk-delete action (default: false)
    },
  },
})
```

Seeds without a `dashboard` field get sensible defaults: `Folder` icon, no group (all grouped under the sidebar's default "Contents" label), order 99.

**Sidebar grouping example** — given these seeds:

```typescript
defineSeed({ slug: 'posts',    dashboard: { icon: 'Newspaper',   group: 'Blog',    order: 1 } })
defineSeed({ slug: 'comments', dashboard: { icon: 'MessageSquare', group: 'Blog',  order: 2 } })
defineSeed({ slug: 'products', dashboard: { icon: 'ShoppingBag', group: 'Shop',    order: 1 } })
defineSeed({ slug: 'orders',   dashboard: { icon: 'ShoppingCart', group: 'Shop',   order: 2 } })
```

The sidebar renders two separate sections: **Blog** (Posts, Comments) and **Shop** (Products, Orders).

**Available icons** — any [Lucide](https://lucide.dev/icons/) icon name in PascalCase is valid (e.g. `Newspaper`, `ShoppingBag`, `Users`, `Calendar`, `Globe`, `BookOpen`, `Award`, `BarChart`, `Shield`, `Briefcase`, `DollarSign`, `Truck`, `Tag`, `Star`, `Image`, `Video`, `Map`, `Building`, `Store`, `Code`, `Database`, `Wrench`, `GraduationCap`). The full list is maintained in `apps/dashboard/src/lib/icon-registry.ts`. Unknown names fall back to `Folder`.

---

## 5. Running Locally

```bash
npm install                    # install dependencies (first time only)
npx beech init --db            # check config files + initialise local D1 system tables
npx beech seed:load --local    # create your content tables from seeds.ts
npx wrangler dev               # start the Worker on http://localhost:8789
```

Open `http://localhost:8789/admin` — the setup wizard will appear on first launch to create your admin account.

> **Note:** `beech init --db` only needs to run once (or after cloning on a new machine). `beech seed:load --local` must be re-run whenever you add or change fields in `seeds.ts`.
>
> `beech init` without `--db` runs only the file checks (useful to verify a fresh clone).

### CORS in development

When `ENV` is not set to `production`, the API automatically allows any origin on `localhost` or `127.0.0.1`, regardless of port. You do **not** need to add your frontend dev server to `CORS_ORIGINS` in `wrangler.jsonc` — Next.js on 3000, Nuxt on 3001, Vite on 5173, and any other local port all work out of the box.

In production, only the origins listed in `CORS_ORIGINS` are allowed.

### API key echo

`beech init` prints the public API keys found in `wrangler.jsonc` after a successful check. Use them as the `X-API-Key` header in your frontend:

```
API keys detected in wrangler.jsonc:

  PUBLIC_READ_API_KEY  = dev-****-key
  PUBLIC_WRITE_API_KEY = dev-****-key

Use these in your frontend as the X-API-Key header.
```

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

### 6.2 Discover available content types (schema endpoint)

Before writing fetch calls, you can inspect which content types are publicly accessible and what fields they expose:

```
GET /api/v1/public/schema
X-API-Key: your-public-read-key
```

The response lists every seed with `allowPublicRead`, `allowPublicPost`, or `allowPublicEdit` enabled, along with each branch's alias, type, label, and visibility policy.

For a quick human-readable view, open it in a browser:

```
GET /api/v1/public/schema.html
X-API-Key: your-public-read-key
```

This is useful when onboarding to an existing project or generating a typed client from the live schema.

### 6.3 Read entries

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

### 6.4 Submit a form

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

### 6.5 Response format

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

### 6.6 Error format

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

Files are stored in Cloudflare R2 and tracked in the database. BeechCMS provides a managed proxy to serve these files with proper caching and security headers.

### Serving Media

You can access any uploaded file via the media proxy:

```
GET /api/media/:key
```

The `key` is the value stored in the `file` field.

```javascript
// Field value: "1714900000-cover.jpg"
const imageUrl = `https://my-project-api.workers.dev/api/media/1714900000-cover.jpg`
```

### Production CDN Support

If you have a custom domain or CDN (e.g., Cloudflare CDN) pointing to your R2 bucket, you can set `MEDIA_CDN_URL` in your configuration. When set, `getUrl()` will automatically return the direct CDN URL instead of the proxied one, reducing latency and worker execution time.

```jsonc
"vars": {
  "MEDIA_CDN_URL": "https://cdn.my-project.com"
}
```

In this case, the URL would be: `https://cdn.my-project.com/1714900000-cover.jpg`.

---

## 8. CLI Reference

### Scaffolding

| Command | Description |
|---|---|
| `npx @beechcms/cms` | Scaffold a new project (interactive wizard) |
| `npx @beechcms/cms my-app --yes` | Non-interactive scaffold with default values |
| `npx @beechcms/cms my-app --yes --with-examples` | Non-interactive scaffold with Blog content types pre-configured |

### Project setup

| Command | Description |
|---|---|
| `npx beech init` | Check that all required project files are present |
| `npx beech init --db` | Check files + initialise local D1 system tables |
| `npx beech init --db --remote` | Verify that the remote D1 database is correctly initialised (useful after deploy) |

### Seed management

| Command | Description |
|---|---|
| `npx beech validate` | Validate `SEED_REGISTRY` for errors (duplicate aliases, missing `displayNameAlias`, duplicate slugs). Exits with code `1` if issues are found — CI-friendly. |
| `npx beech seed:create` | Interactive wizard: generate a new Seed definition and append it to `seeds.ts`, including the `SEED_REGISTRY` entry |
| `npx beech seed:load --local` | Synchronize local D1 schema from `seeds.ts` |
| `npx beech seed:load` | Synchronize remote D1 schema (production) |
| `npx beech seed:load --diff --local` | Compare Seed definitions with current local DB schema; orphaned columns are clearly labelled |
| `npx beech seed:load --dry-run` | Print the SQL that would be executed without touching the DB |
| `npx beech seed:load --db <name>` | Override the D1 database name from config |

### Maintenance

| Command | Description |
|---|---|
| `npx beech update` | Update `@beechcms/api` and `@beechcms/core` to latest, then apply any new system migrations to the local database. Prints next steps for syncing local/remote schema. |

### Development & deployment

| Command | Description |
|---|---|
| `npx wrangler dev` | Start the Worker locally on port 8789 |
| `npm run deploy` | Deploy the Worker code to Cloudflare |

---

## 9. Schema Evolution

BeechCMS **never drops columns or tables automatically**. `beech seed:load` is strictly additive: it adds missing tables and missing columns, but leaves everything else untouched.

### Adding a field

1. Add the new `Branch` to your Seed in `seeds.ts`.
2. Run `npx beech seed:load --local` to add the column locally.
3. After deploying, run `npx beech seed:load` to add it to production.

### Removing a field

1. Delete the `Branch` from `seeds.ts`.
2. The column is now **orphaned** — it still exists in the database, but BeechCMS ignores it.
3. Run `npx beech seed:load --diff --local` to see which columns are orphaned.
4. If you want to clean it up, run an `ALTER TABLE DROP COLUMN` manually via `wrangler d1 execute`.

```bash
npx wrangler d1 execute <db-name> --local --command \
  "ALTER TABLE content_posts DROP COLUMN old_field"
```

> Beech deliberately never drops data automatically. Orphaned columns are harmless — clean them up on your own schedule.

### Renaming a field alias

Renaming a `Branch` alias after the first migration requires a SQL rename — the alias is the SQL column name.

```bash
npx wrangler d1 execute <db-name> --local --command \
  "ALTER TABLE content_posts RENAME COLUMN old_name TO new_name"
```

Apply the same command to production after deploying.

---

## 10. Daily Workflow

After a `git pull` from a teammate:

```bash
npm install                        # install any new packages
npx beech seed:load --local        # apply any schema changes from seeds.ts
npx beech seed:load --diff --local # health check: spot missing or orphaned columns
npx wrangler dev                   # start the local server
```

Use `beech validate` before loading to catch errors in `seeds.ts` early:

```bash
npx beech validate && npx beech seed:load --local
```

> `beech seed:load` already runs the same validation checks automatically and prints a warning if it finds issues, but exits `0` to avoid breaking existing scripts. Use `beech validate` in CI where a hard exit `1` is needed.

### Updating BeechCMS

When a new version of BeechCMS is released, use `beech update` instead of running `npm install` manually:

```bash
npx beech update
```

This single command:
1. Installs `@beechcms/api@latest` and `@beechcms/core@latest`.
2. Applies any new system migrations to your local D1 database.
3. Prints the next steps to sync local and remote schema.

After running it, follow the printed instructions (usually `npx beech seed:load --local`, then `npm run deploy`, then `npx beech seed:load`).

---

## 11. Deploying to Production

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
   Wrangler automatically applies any pending **system migrations** (users, auth, media tracking) from `node_modules/@beechcms/api/migrations`.

2. **Synchronize the content schema:**
   ```bash
   npx beech seed:load
   ```
   This command compiles your `seeds.ts` and applies the necessary `CREATE TABLE` and `ALTER TABLE` statements to your **production** D1 database.

### Step 4 — Deploy the dashboard

The BeechCMS dashboard is a static SPA served by the Worker. No separate deployment is needed — it is included in `@beechcms/api` and available at `/admin` after `npm run deploy`.
