# First Project: 5-Minute Zero-to-Fullstack Tutorial

This guide takes you from an empty directory to a fully functioning **BeechCMS** edge backend, a visually modeled content structure, and a connected frontend consumer in just 5 minutes.

## Overview

BeechCMS eliminates server management by running natively on Cloudflare's serverless primitives:

<p align="center">
  <img src="/images/first-project-architecture.svg" alt="BeechCMS Full-Stack Edge Architecture" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

```text
Scaffold Project ──► Bootstrap D1 ──► Model Seed ──► Staging & Drafts ──► Query with SDK ──► Edge Deploy
```

---

## Step 1: Project Scaffolding

Generate a new BeechCMS project using the scaffolding CLI:

<PackageManagerTabs
  npm="npx @beechcms/cms my-app"
  pnpm="pnpm dlx @beechcms/cms my-app"
  yarn="yarn dlx @beechcms/cms my-app"
  bun="bunx @beechcms/cms my-app"
/>

To skip interactive prompts and scaffold immediately with defaults:

```bash
npx @beechcms/cms my-app --yes
cd my-app
npm install
```

### Directory Layout

```text
my-app/
├── worker.ts       # Cloudflare Worker entry point delegating to @beechcms/api
├── wrangler.jsonc  # Cloudflare bindings (D1, R2, Assets, environment vars)
├── .dev.vars       # Local development secrets (git-ignored)
├── tsconfig.json   # TypeScript configuration for Workers runtime
└── package.json    # Project dependencies and operational scripts
```

The entire CMS engine and admin SPA live inside `@beechcms/api`. Your workspace remains minimal and focused purely on configuration.

---

## Step 2: Database Bootstrap & Dev Server

1. **Bootstrap local D1 database**:
   Execute the migration script to apply the base system tables (`seeds`, `users`, `sessions`, `api_keys`, `media`):

   ```bash
   npm run db:migrate:local
   # or via CLI: npx beech init --db
   ```

2. **Start the local development server**:

   ```bash
   npm run dev
   ```

   Wrangler starts the local Workers emulator on `http://localhost:8789`.

3. **Access the Admin Dashboard**:
   Open [http://localhost:8789/admin](http://localhost:8789/admin) in your browser. Complete the initial setup by creating your administrator credentials.

---

## Step 3: Visual Seed Modeling

BeechCMS models content through **Seeds** (Blueprints) containing **Branches** (Fields):

1. In the Admin Dashboard navigation, click **Content Modeling** (or **Seeds**).
2. Click **Create Seed** and configure the blueprint:
   - **Label**: `Posts`
   - **Slug**: `posts`
   - **Display Name Branch**: `title`
   - **Public Read Access**: Toggle **ON** (`allowPublicRead: true`) to enable public REST API queries.
   - **Drafts Workflow**: Toggle **ON** (`allowDrafts: true`) to enable dual-table draft staging.
3. Add the following Branches:
   - **Title**: Type `text`, alias `title`, required, search indexed (`search: true`).
   - **Slug**: Type `text`, alias `slug`, required.
   - **Cover Image**: Type `file`, alias `cover_image`, accept `image`.
   - **Body**: Type `richtext`, alias `body`.
4. Click **Save Seed**.

Under the hood, the Botanical Engine automatically compiles SQLite DDL: provisioning `content_posts`, draft mirror table `content_posts_drafts`, B-tree indexes, and full-text search table `fts_content_posts`.

---

## Step 4: Staging vs Production (Dual-Table Staging)

BeechCMS guarantees draft isolation using **Dual-Table Mirror Staging**:

<p align="center">
  <img src="/images/dual-table-drafts-pipeline.svg" alt="Dual-Table Mirror Staging Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

- **Draft Table (`content_posts_drafts`)**: Every draft save or live edit is written to the draft staging table. Editors can preview unpublished drafts safely without leaking unapproved content.
- **Production Table (`content_posts`)**: When you click **Publish**, BeechCMS atomically promotes the staging record into the production table.
- **Public API Safety**: Public queries (`GET /api/v1/public/posts`) query ONLY the production table by default. The internal route `GET /api/content/posts` requires authenticated admin session permissions.

Create your first post in the dashboard:
1. Navigate to **Content > Posts** and click **New Entry**.
2. Fill in the title `"Hello BeechCMS"`, write body text, and click **Publish**.

---

## Step 5: Consuming Content with `@beechcms/client`

Now connect any frontend to your BeechCMS backend using the official Client SDK.

1. Install `@beechcms/client`:

<PackageManagerTabs command="@beechcms/client" />

2. Initialize the client and query your published posts:

```typescript
import { createBeechServerClient } from '@beechcms/client/server'
import { renderRichText } from '@beechcms/client/richtext'

interface Post {
  id: string
  title: string
  slug: string
  cover_image?: string
  body: string | Record<string, unknown>
  created_at: number
  updated_at: number
}

interface AppRegistry {
  posts: Post
}

// Initialize the Beech client with baseUrl and apiKey
const client = createBeechServerClient<AppRegistry>({
  baseUrl: 'http://localhost:8789',             // Your Worker URL
  apiKey: 'dev-read-key-changeme'               // PUBLIC_READ_API_KEY from wrangler.jsonc / .dev.vars
})

async function fetchPosts() {
  const result = await client.content('posts').list({
    sort: { created_at: 'desc' },
    limit: 10
  })

  if (result.error) {
    console.error('Failed to fetch posts:', result.error.detail)
    return
  }

  const posts = result.data.data
  console.log('Published Posts:', posts)

  // Example: Convert TipTap richtext to HTML
  if (posts[0]?.body) {
    const html = renderRichText(posts[0].body)
    console.log('Rendered HTML:', html)
  }
}

fetchPosts()
```

---

## Step 6: Edge Deployment to Cloudflare

When you are ready to deploy your production edge CMS:

1. **Log in to Cloudflare**:
   ```bash
   npx wrangler login
   ```

2. **Automated Cloudflare Provisioning**:
   Let the Beech CLI provision your D1 database, R2 media bucket, and secrets:
   ```bash
   npx beech setup:cloudflare
   ```

3. **Deploy to Cloudflare Workers**:
   ```bash
   npx beech deploy
   ```

Your CMS API and embedded Admin Dashboard are now live worldwide on Cloudflare's global edge network with zero cold starts!

---

## Next Steps

- Explore [Schema Modeling & Evolution](/build/schema-modeling) for advanced field types and relations.
- Connect your frontend with dedicated [Framework Quickstarts](/start/frameworks/react).
- Learn about [Field Policies & ALE Encryption](/build/field-policies).
