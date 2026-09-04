---
title: Getting Started
group: User & Builder Guide
category: Getting Started
---

# Getting Started with BeechCMS

BeechCMS is an **edge-native, schema-driven headless CMS** engineered to run entirely on Cloudflare's global edge network (Workers, D1, and R2).

With BeechCMS, your content models (**Seeds**) are canonically persisted and managed directly in Cloudflare D1 via the dashboard or REST API. The system instantly provides an embedded React admin panel, a high-performance REST API, and edge-native media storage with zero server management.

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

- **Seeds (Content Blueprints)**: A Seed is a content model (like `posts`, `authors`, or `products`). Each Seed requires an identifying `slug`, UI labels (`label`, optional `labelPlural`), branches, and a `displayNameAlias` (in the REST API payload, `displayNameAlias` is auto-inferred from the first `text` branch if omitted, returning `400 Bad Request` if no text branch exists; it is required in the TypeScript `Seed` interface). Seeds configure public REST API permissions (`allowPublicRead`, `allowPublicPost`, `allowPublicEdit`), content versioning (`allowDrafts`), GDPR compliance (`retentionDays`), and dashboard presentation/layout (`dashboard`, `layout`).
- **Branches (Fields & Attributes)**: Individual properties inside a Seed (such as `title`, `cover_image`, `body`, or `tags`). Every branch carries a permanent identifier (`id: 'br_...'`, sequentially assigned by default as `br_01`, `br_02`, ..., or custom identifiers matching `^br_[A-Za-z0-9]+$`) that keeps your database, triggers, and automations connected even if you rename fields later.
- **Fruits (Content Records)**: Concrete content items generated from a Seed and persisted in Cloudflare D1 (represented as `Entry` / `Record<string, unknown>` in the TypeScript codebase and REST API).

```
Seed (Blueprint)  ──►  Branches (Fields)  ──►  Fruits (Records)
```

## Quickstart

### Scaffolding

Create a new project in seconds using the interactive setup wizard:

```bash
npx @beechcms/cms
```

Or scaffold non-interactively with the starter template:

```bash
npx @beechcms/cms my-app --yes
cd my-app
npm install
```

### Project Layout

```
my-app/
├── worker.ts       # Worker entry point running the @beechcms/api engine
├── wrangler.jsonc  # Cloudflare bindings (D1, R2, environment variables)
├── .dev.vars       # Local development secrets (git-ignored)
├── tsconfig.json   # TypeScript configuration for Cloudflare Workers
├── .gitignore      # Git ignore rules (.wrangler, .dev.vars, node_modules)
└── package.json    # Scripts and dependencies
```

The entire CMS engine and admin SPA live inside `@beechcms/api`. Your workspace remains lightweight and focused purely on configuration, with all content models managed directly in the Cloudflare D1 database.

### Local Development

1. Initialise the local D1 database and apply the base system tables:

```bash
npm run db:migrate:local
# or via CLI: npx beech init --db (or npx -p @beechcms/cms beech init --db)
```

2. Start the local development server:

```bash
npm run dev
# or: npx wrangler dev --port 8789
```

3. Open [http://localhost:8789/admin](http://localhost:8789/admin) to access the admin dashboard and complete the initial setup.

## External Services

BeechCMS leverages lightweight external services to deliver enterprise capabilities with zero server maintenance.

### Cloudflare D1 & R2

- **D1 (Database)**: Create via `npx wrangler d1 create <name>` and paste the generated `database_id` into `wrangler.jsonc`.
- **R2 (Storage)**: Create via `npx wrangler r2 bucket create <name>` and bind it in `wrangler.jsonc`. Direct client uploads via Presigned URLs also require S3 API credentials (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET_NAME`) configured in `.dev.vars` / Cloudflare secrets (or provisioned automatically via `npx beech setup:cloudflare`).

### Resend & Transactional Email

Used for password-reset emails and automated notification triggers (`send_mail`).

1. **Production (Resend)**: Sign up at [resend.com](https://resend.com) and create an API Key. Add your sender address to `wrangler.jsonc` under `vars` (e.g. `"EMAIL_FROM": "notifications@yourdomain.com"`) and add your secret:
   ```bash
   npx wrangler secret put RESEND_API_KEY
   ```
2. **Local Development (Mailpit)**: BeechCMS includes zero-config local SMTP via Mailpit (`EMAIL_PROVIDER=smtp`, ports 8025/1025), so `RESEND_API_KEY` is not required for local testing.

### Upstash QStash (Asynchronous Notifications)

While BeechCMS includes in-process background execution and optional Cloudflare Queues (`QUEUE` binding), Upstash QStash can be configured as a serverless delivery provider for delayed, scheduled, and retryable notification webhooks:

1. Create a free account at [upstash.com](https://upstash.com) and navigate to QStash.
2. Configure your environment variables in `.dev.vars` (local) and via `npx wrangler secret put` (production):
   - `QSTASH_TOKEN`: Upstash API authentication token.
   - `QSTASH_CURRENT_SIGNING_KEY`: Current signing key for verifying inbound webhooks (required).
   - `QSTASH_NEXT_SIGNING_KEY`: Next signing key for zero-downtime rotation (required).
   - `QSTASH_URL`: Optional custom QStash API base URL.
   - `QSTASH_CALLBACK_URL`: Public base URL reachable by QStash (falls back to `APP_URL`). Inbound notification webhooks are received at `/api/webhooks/qstash`.

### Application-Level Encryption (ALE)

When configuring `privacy: 'encrypt'` (or `classification: 'confidential'`) inside a branch's `policies` object, BeechCMS utilizes AES-256-GCM authenticated encryption at rest (`v1:<iv>:<ciphertext>`) and maintains an automated blind-index column (`<alias>_bidx`) using HMAC-SHA256 for fast indexed filtering. Configure your master encryption key:

1. Set `PRIVACY_MASTER_KEY` in `.dev.vars` for local development.
2. Add the master key to Cloudflare secrets for production:
   ```bash
   npx wrangler secret put PRIVACY_MASTER_KEY
   ```

## Branch Types Reference

BeechCMS supports a rich array of typed fields out of the box:

| Type | Stored In D1 | Common Use Cases | Example Options |
| :--- | :--- | :--- | :--- |
| `text` | `TEXT` | Titles, slugs, summaries, single-line text | `policies: { search: true, sort: true }`, `options: ['news', 'tech']` (select dropdown / TS union) |
| `number` | `REAL` | Prices, ratings, inventory, metrics | `numberOptions: { format: 'currency' \| 'decimal' \| 'percentage' \| 'compact', currency: 'EUR', min: 0, max: 100, step: 1, decimals: 2, grouping: true, control: 'input' \| 'slider' \| 'rating' \| 'stepper', prefix: '€', suffix: '/mo' }` |
| `boolean` | `INTEGER (0/1)` with CHECK constraint | Featured toggles, active statuses | `policies: { filter: true }` |
| `date` | `INTEGER (Unix timestamp in seconds)` | Event dates, deadlines, publication times (API accepts & returns ISO strings) | `format: 'date'` (YYYY-MM-DD) or `format: 'datetime'` (ISO 8601 string) |
| `file` | `TEXT (URL or JSON Array)` | Images, PDF documents, avatar photos | `fileOptions: { accept: 'image' \| 'document' \| 'any', maxSize: 5242880 }`, plus branch options `multiple: true`, `format: 'asset-list'` |
| `relation` | `TEXT (FK)` or Junction Table (`multiple: true`) | Author links, category references, many-to-many tags | `targetSeed: 'authors'`, `onDelete: 'SET NULL' \| 'CASCADE' \| 'RESTRICT'` (`SET NULL` disallowed on `multiple: true`; defaults to `'SET NULL'` on single, `'CASCADE'` on multi) |
| `tags` | `TEXT (JSON Array)` | Controlled tag arrays, category badges (up to 100 items) | `options: ['news', 'tech', 'design']` (UI suggestions & TS union types) |
| `repeater` | `TEXT (JSON Array)` | Structured repeatable blocks, feature lists | `fields: [...]` (leaf scalars only; nesting repeater, relation, or file is disallowed), `minItems: 1, maxItems: 5` |
| `richtext` | `TEXT (TipTap JSON Document)` | Long-form blog posts, articles, documentation | TipTap document format (HTML rendering is provided client-side by `@beechcms/client`) |
| `json` | `TEXT (JSON String)` | Metadata dictionaries, custom payload configurations | Raw JSON payload (validated, max depth 50) |

### Field Policies

You can attach granular security, classification, and indexing policies to any Branch (8 policy properties total):

```typescript
branches: [
  {
    id: 'br_01',
    alias: 'phone',
    label: 'Phone Number',
    type: 'text',
    policies: {
      classification: 'confidential', // 'public' | 'internal' | 'confidential' | 'restricted'
      privacy: 'encrypt',            // 'plain' | 'hash' | 'encrypt' — AES-256-GCM at rest with blind indexing
      visibility: 'masked',          // 'full' | 'masked' | 'hidden' — renders as 8 bullets (••••••••) in API
      public: false,                 // Strips field from Public REST API schema & search
      publicEdit: false,             // Disallows edits via public endpoints
      filter: true,                  // Generates B-tree index for SQL filtering
      sort: false,                   // Disables query sorting
      search: false,                 // Excludes from FTS5 full-text index
    }
  },
  {
    id: 'br_02',
    alias: 'password_hash',
    label: 'Password',
    type: 'text',
    policies: {
      classification: 'restricted',
      privacy: 'hash',               // Keyed HMAC-SHA256 digest — omitted from public & authenticated API responses
      visibility: 'hidden',
      public: false,
      publicEdit: false,
    }
  }
]
```

> [!NOTE]
> Custom branches do not support a `unique` policy in D1 (only the system `slug` carries a `UNIQUE` constraint). For full public read isolation, combine `public: false` with `classification: 'internal'` or `classification: 'confidential'`.

## Schema Evolution

The **Botanical Engine** guarantees safe schema migrations without locking or breaking your database.

<p align="center">
  <img src="/images/botanical-engine-pipeline.svg" alt="Botanical Engine Compilation Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

### Canonical D1 Database Authority
Content schemas are canonically persisted directly in Cloudflare D1's `seeds` system table, accompanied by a `registry_version` counter in the `seed_meta` key-value table bumped on every schema mutation to invalidate multi-isolate Worker in-memory caches. When you create or update content types via the Dashboard or `/api/seeds`, the engine automatically provisions physical SQLite tables (`content_{slug}`), issues `ALTER TABLE ... ADD COLUMN`, and generates matching B-tree indexes, draft staging tables, and FTS5 search tables.

### The Botanical Invariant
Because each field carries a permanent `id` (e.g. `br_01`, `br_02`), you can safely rename aliases (`title` → `headline`) without dropping columns or losing data. Renaming generates an SQLite column rename (`ALTER TABLE ... RENAME COLUMN`), while BeechCMS automatically executes an explicit FTS virtual table rebuild and trigger recreation (`planFtsRebuild`) to keep full-text search synchronised.

### Danger Zone Operations
Destructive operations enforce strict safeguards to prevent accidental data loss:
- **Seed Deletion**: Soft deletion (`DELETE /api/seeds/:slug`) marks the seed as deleted in D1 without dropping tables. Hard deletion (`DELETE /api/seeds/:slug/hard`) permanently drops physical D1 tables and purges all associated R2 media assets. Both endpoints perform relational back-reference checks (`backrefMap`) returning `409 Conflict` if other Seeds reference the target. Hard deletion requires an explicit confirmation payload: `{ "confirm": "<slug>" }`.
- **Branch Modification**:
  - **Drop field**: `DELETE /api/seeds/:slug/branches/:branchId` requires `{ "confirm": "<slug>.<alias>" }`.
  - **Rename alias**: `PATCH /api/seeds/:slug/branches/:branchId/rename` requires `{ "newAlias": "<new>", "confirm": "<slug>.<oldAlias>" }`.
  - **Retype field**: `PATCH /api/seeds/:slug/branches/:branchId/retype` requires `{ "newType": "<type>", "confirm": "<slug>.<alias>" }` (retyping to or from `'repeater'` is disallowed and returns `422`).
- **Additive Invariant**: Standard updates via `PUT /api/seeds/:slug` only accept additive changes; inline alias renames or branch type changes are rejected with `422 Unprocessable Entity`.

## Media Delivery

Uploaded assets in R2 are served with high caching efficiency:

- **Local / Proxy Route**: `GET /api/media/:key{.+}` (Hono wildcard route supporting nested paths and folder prefixes)
- **Base Media URL**: Configured in `wrangler.jsonc` under `vars.MEDIA_BASE_URL` (e.g. `"http://localhost:8789"` or production worker URL; defaults dynamically to the incoming request origin if omitted).
- **Direct CDN Delivery (Optional)**: Point a custom domain to your R2 bucket and set `MEDIA_CDN_URL` under `vars` in `wrangler.jsonc` (e.g. `"vars": { "MEDIA_CDN_URL": "https://cdn.my-site.com" }`). All media helpers will automatically return direct CDN links instead of proxying through the Worker.

## CLI Reference

The `beech` CLI provides unified workflows for database management, code generation, and deployment.

> [!TIP]
> In scaffolded consumer projects, commands can be run via `npx beech <cmd>` (when `@beechcms/cms` is installed) or `npm run <script>`. Note that Docker and Turborepo commands are reserved for monorepo development.

| Command | Scope | Description |
| :--- | :--- | :--- |
| `npx @beechcms/cms` | Consumer | Interactive scaffolding assistant (or `npx @beechcms/cms <name> --yes` for non-interactive starter) |
| `npx beech db:migrate` | Consumer | Applies local database migrations (runs `npm run db:migrate:local` when available, falls back to `beech init --db`) |
| `npx beech db:reset` | Consumer | Removes local Wrangler state and re-bootstraps database (runs `npm run db:reset:local` or clears `.wrangler/state`) |
| `npx beech reset` | Monorepo / Contributor | Comprehensive environment reset (`--db`, `--docker`, `--all`, `--yes`; `--docker` requires monorepo) |
| `npx beech onboard [--remote]` | Consumer | One-command database verification and project integrity check (`--yes`, `--db <name>`; `--remote` verifies remote schema readiness) |
| `npx beech init [--db] [--remote]` | Consumer | Verifies project configuration (`worker.ts`, `wrangler.jsonc`); with `--db` applies base system tables locally or checks remote schema integrity (`--db-name <n>`, `--yes`) |
| `npx beech gen types typescript` | Consumer | Generates TypeScript interfaces from active Seed definitions stored in D1 (`--local` default, `--remote`, `-o` / `--out` / `--output <file>`, `--db <name>`; aliases: `gen-types`, `gen:types`, `generate:types`) |
| `npx beech forms` | Consumer | Interactive wizard to generate React, Vue, Svelte, or Vanilla / Web Component forms (`--framework`, `--seed`, `--mode`, `--out`, `--yes`, `--json`; aliases: `form`, `forms:add`) |
| `npx beech setup:cloudflare` | Consumer | 1-step Cloudflare provisioning (D1, R2, presigned S3 secrets; alias: `setup:cf`, options: `--name <n>`, `--yes`) |
| `npx beech build` | Consumer | Informational check confirming that BeechCMS projects require no static build step |
| `npx beech dev` | Monorepo | Starts the monorepo local dev environment (Docker + API + Dashboard, `--plain`; alias: `start`). **In generated consumer projects**, use `npm run dev` (`wrangler dev`) instead. |
| `npx beech dev:stop` | Monorepo | Stops local monorepo Docker containers without removing persistent data |
| `npx beech dev:reset` | Monorepo | Stops local monorepo Docker containers and purges volumes (`docker compose down -v`) |
| `npx beech dev:tunnel` | Monorepo | Displays the active Cloudflare quick tunnel public URL from Docker container logs |
| `npx beech mailpit:clear` | Monorepo | Clears local Mailpit development inbox |
| `npx beech validate` | Consumer | Confirms active runtime schema validation status on `/api/seeds` mutations |
| `npx beech test` | Monorepo | Executes test runner via Turborepo (`--coverage`, `--diff`) |
| `npx beech lint` | Monorepo | Runs project linter checks via Turborepo |
| `npx beech update` | Consumer | Upgrades core engine packages and applies system migrations |
| `npx beech doctor` | Consumer | Runs health checks and React diagnostics on the Dashboard |
| `npx beech logs <service>` | Monorepo | Streams logs for local Docker services (`mailpit`, `db`/`sqlite` → `sqlite-web`, `tunnel`, `storage`/`minio` → `minio`) |
| `npx beech deploy` | Consumer | Deploys the Worker and embedded dashboard to Cloudflare (runs `wrangler deploy`, supports `--skip-check`) |

## Next Steps

Explore the specialized guides depending on your role and project goals:

- **[First Project Tutorial](./first-project.md)**: Build a complete blog with BeechCMS and connect it to Astro or Next.js.
- **[Content Editor Guide](./content-editor-guide.md)**: Visual guide for content editors, marketers, and non-technical team members.
- **[Content API & SDK](./content-api.md)**: Advanced filtering, relational joins, full-text search, and SDK usage.
- **[Automations](./automations.md)**: Configure email triggers, field updates, and webhooks.
- **[Custom Widgets](./custom-widgets.md)**: Create custom dashboard charts and cards for your editors.
