---
title: Getting Started
group: User & Builder Guide
category: Getting Started
---

# Getting Started with BeechCMS

BeechCMS is an **edge-native, schema-driven headless CMS** engineered to run entirely on Cloudflare's global edge network (Workers, D1, and R2).

With BeechCMS, you define your content models (**Seeds**) in TypeScript or visually via the dashboard, and the system instantly provides an embedded React admin panel, a high-performance REST API, and edge-native media storage with zero server management.

## Edge Architecture

BeechCMS replaces traditional server-hosted CMS stacks with serverless edge primitives:

- **Cloudflare Workers**: High-speed Hono REST engine with sub-millisecond cold starts, serving both API requests and the bundled React admin SPA directly from `/admin`.
- **Cloudflare D1**: Serverless SQLite running at the edge. BeechCMS compiles your schema into physical SQL tables with indexed lookups, relational integrity, and full-text search (FTS5).
- **Cloudflare R2**: S3-compatible object storage with zero egress fees for uploaded media, photos, and files.

<p align="center">
  <img src="/images/architecture-cloudflare.svg" alt="Cloudflare Edge Architecture" style="width: 100%; max-width: 820px; margin: 16px 0;" />
</p>

## Core Concepts

Understanding BeechCMS boils down to three core concepts:

- **Seeds (Content Blueprints)**: A Seed is a content model (like `posts`, `authors`, or `products`). Each Seed defines rules, permissions (`allowPublicRead`, `allowDrafts`), and display settings.
- **Branches (Fields & Attributes)**: Individual properties inside a Seed (such as `title`, `cover_image`, `body`, or `tags`). Every branch carries a permanent identifier (`id: 'br_...'`) that keeps your database, triggers, and automations connected even if you rename fields later.
- **Fruits (Content Records)**: Concrete content items generated from a Seed and persisted in Cloudflare D1.

```
Seed (Blueprint)  ──►  Branches (Fields)  ──►  Fruits (Records)
```

## Quickstart

### Scaffolding

Create a new project in seconds using the interactive setup wizard:

```bash
npx @beechcms/cms my-app
```

Or scaffold non-interactively with the starter template:

```bash
npx @beechcms/cms my-app --yes --with-examples
cd my-app
pnpm install
```

### Project Layout

```
my-app/
├── worker.ts       # Worker entry point running the @beechcms/api engine
├── wrangler.jsonc  # Cloudflare bindings (D1, R2, environment variables)
├── .dev.vars       # Local development secrets (git-ignored)
└── package.json    # Scripts and dependencies
```

The entire CMS engine and admin SPA live inside `@beechcms/api`. Your workspace remains lightweight and focused purely on configuration, with all content models managed directly in the Cloudflare D1 database.

### Local Development

Start the local server with one command:

```bash
npx wrangler dev --port 8789
```

Open [http://localhost:8789/admin](http://localhost:8789/admin) to access the admin dashboard and complete the initial setup.

## External Services

BeechCMS leverages lightweight external services to deliver enterprise capabilities with zero server maintenance.

### Cloudflare D1 & R2

- **D1 (Database)**: Create via `npx wrangler d1 create <name>` and paste the generated `database_id` into `wrangler.jsonc`.
- **R2 (Storage)**: Create via `npx wrangler r2 bucket create <name>` and bind it in `wrangler.jsonc`.

### Resend (Transactional Email)

Used for password-reset emails and automated notification triggers.

1. Sign up at [resend.com](https://resend.com) and create an API Key.
2. Add your key to `.dev.vars` (local) and Cloudflare secrets (production):
   ```bash
   npx wrangler secret put RESEND_API_KEY --env production
   ```

### Upstash QStash (Background Queues)

Used for asynchronous background jobs, retries, and high-volume webhook dispatches.

1. Create a free account at [upstash.com](https://upstash.com) and navigate to QStash.
2. Copy your `QSTASH_TOKEN` and signing keys into your environment secrets.

## Branch Types Reference

BeechCMS supports a rich array of typed fields out of the box:

| Type | Stored In D1 | Common Use Cases | Example Options |
| :--- | :--- | :--- | :--- |
| `text` | `TEXT` | Titles, slugs, summaries, single-line text | `policies: { search: true, sort: true }` |
| `number` | `REAL` / `INTEGER` | Prices, ratings, inventory, metrics | `numberOptions: { format: 'currency', currency: 'EUR' }` |
| `boolean` | `INTEGER (0/1)` | Featured toggles, active statuses | `default: false` |
| `date` | `TEXT (ISO)` | Event dates, deadlines, publication times | `format: 'date'` or `'datetime'` |
| `file` | `TEXT (R2 Key/URL)` | Images, PDF documents, avatar photos | `fileOptions: { accept: 'image' }` |
| `relation` | `TEXT (Foreign Key)` | Author links, category references | `targetSeed: 'authors'`, `onDelete: 'SET NULL'` |
| `richtext` | `TEXT (HTML/JSON)` | Long-form blog posts, articles, documentation | TipTap rich-text formatting |
| `json` | `TEXT (JSON String)` | Tag arrays, metadata dictionaries, nested lists | `options: ['news', 'tech', 'design']` |

### Field Policies

You can attach granular security and indexing policies to any Branch:

```typescript
branches: [
  {
    id: 'br_sec1',
    alias: 'api_token',
    label: 'API Token',
    type: 'text',
    policies: {
      privacy: 'hash',      // 'plain' | 'hash' | 'encrypt'
      visibility: 'masked', // 'full' | 'masked' | 'hidden'
      public: false,        // Strips field from Public REST API responses
    }
  }
]
```

## Schema Evolution

The **Botanical Engine** guarantees safe schema migrations without locking or breaking your database.

<p align="center">
  <img src="/images/botanical-engine-pipeline.svg" alt="Botanical Engine Compilation Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

### Canonical D1 Database Authority
Content schemas are persisted directly in Cloudflare D1's `seeds` system table. When you create or update content types via the Dashboard or `/api/seeds`, the engine automatically performs `ALTER TABLE ... ADD COLUMN` and generates matching indexes.

### The Botanical Invariant
Because each field has a permanent `id` (e.g. `br_pst1`), you can safely rename aliases (`title` → `headline`) without dropping columns or losing data. Triggers and search tables update automatically.

### Danger Zone Operations
Destructive operations (dropping fields, changing types, or deleting Seeds) require explicit confirmation and perform relational back-reference checks to prevent accidental data loss.

## Media Delivery

Uploaded assets in R2 are served with high caching efficiency:

- **Local / Proxy Route**: `GET /api/media/:key`
- **Direct CDN Delivery**: Point a custom domain to your R2 bucket and set `MEDIA_CDN_URL` in `wrangler.jsonc` (e.g. `https://cdn.my-site.com`). All media helpers will automatically return direct CDN links.

## CLI Reference

The `beech` CLI provides unified workflows for database management, code generation, and deployment:

| Command | Description |
| :--- | :--- |
| `npx @beechcms/cms` | Interactive scaffolding assistant |
| `npx beech onboard [--local]` | One-command database provisioning and file verification |
| `npx beech init --db [--local]` | Initialises D1 database system tables |
| `npx beech gen-types [--local]` | Generates TypeScript interfaces directly from active D1 tables |
| `npx beech validate` | Validates runtime schema integrity |
| `npx beech update` | Upgrades core engine packages and applies system migrations |
| `npx beech deploy` | Builds and deploys the Worker and dashboard static assets to Cloudflare |

## Next Steps

Explore the specialized guides depending on your role and project goals:

- **[First Project Tutorial](./first-project.md)**: Build a complete blog with BeechCMS and connect it to Astro or Next.js.
- **[Content Editor Guide](./content-editor-guide.md)**: Visual guide for content editors, marketers, and non-technical team members.
- **[Content API & SDK](./content-api.md)**: Advanced filtering, relational joins, full-text search, and SDK usage.
- **[Automations](./automations.md)**: Configure email triggers, field updates, and webhooks.
- **[Custom Widgets](./custom-widgets.md)**: Create custom dashboard charts and cards for your editors.
