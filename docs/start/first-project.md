# Your First Project

Follow this step-by-step guide to scaffold a BeechCMS edge backend, visually model your content schema, and query published entries with the official SDK in just 5 minutes.

## Architecture overview

BeechCMS eliminates server management by running natively on Cloudflare's serverless primitives:

<p align="center">
  <img src="/images/first-project-architecture.svg" alt="BeechCMS Full-Stack Edge Architecture" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## 1. Project scaffolding

Generate a new BeechCMS project using the scaffolding CLI:

<PackageManagerTabs
  npm="npx @beechcms/cms my-app"
  pnpm="pnpm dlx @beechcms/cms my-app"
  yarn="yarn dlx @beechcms/cms my-app"
  bun="bunx @beechcms/cms my-app"
/>

### Automated setup

To skip interactive prompts and scaffold immediately with sensible defaults:

```bash
npx @beechcms/cms my-app --yes
cd my-app
npm install
```

### Project layout

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

## 2. Local environment setup

### Bootstrap the D1 database

Apply the base system schema (`seeds`, `users`, `sessions`, `api_keys`, `media`) to your local Cloudflare D1 emulator:

```bash
npm run db:migrate:local
# or via CLI: npx beech init --db
```

### Launch the dev server

Start the local Wrangler Workers runtime:

```bash
npm run dev
```

Wrangler starts the local Workers emulator on `http://localhost:8789`.

### Open dashboard

Open [http://localhost:8789/admin](http://localhost:8789/admin) in your browser. Complete the initial setup by creating your administrator credentials.

---

## 3. Visual Seed modeling

BeechCMS models content through **Seeds** (Blueprints) containing **Branches** (Fields).

### Create the Posts Seed

1. In the Admin Dashboard navigation, click **Content Modeling** (or **Seeds**).
2. Click **Create Seed** and configure the blueprint:
   - **Label**: `Posts`
   - **Slug**: `posts`
   - **Display Name Branch**: `title`
   - **Public Read Access**: Toggle **ON** (`allowPublicRead: true`) to enable public REST API queries.
   - **Drafts Workflow**: Toggle **ON** (`allowDrafts: true`) to enable dual-table draft staging.

### Configure Branches

Add the following Branches to the Seed:
- **Title**: Type `text`, alias `title`, required, search indexed (`search: true`).
- **Slug**: Type `text`, alias `slug`, required.
- **Cover Image**: Type `file`, alias `cover_image`, accept `image`.
- **Body**: Type `richtext`, alias `body`.

Click **Save Seed**. Under the hood, the Botanical Engine compiles the SQLite DDL: provisioning `content_posts`, the draft mirror table `content_posts_drafts`, B-tree indexes, and the full-text search virtual table `fts_content_posts`.

---

## 4. Publish content

BeechCMS guarantees draft isolation using **Dual-Table Mirror Staging**:

<p align="center">
  <img src="/images/dual-table-drafts-pipeline.svg" alt="Dual-Table Mirror Staging Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

### Dual-Table Mirror Staging

- **Draft Table (`content_posts_drafts`)**: Every draft save or live edit is written to the staging table. Editors can preview unpublished drafts safely without leaking unapproved changes.
- **Production Table (`content_posts`)**: When you click **Publish**, BeechCMS atomically promotes the staging record into the production table.
- **Public API Safety**: Public queries (`GET /api/v1/public/posts`) query ONLY the production table by default. The internal route `GET /api/content/posts` requires authenticated admin session permissions.

### Publish your first post

1. Navigate to **Content > Posts** in the dashboard and click **New Entry**.
2. Fill in the title `"Hello BeechCMS"`, write some body text, and click **Publish**.

---

## 5. Query with SDK

Connect your frontend to BeechCMS using the official `@beechcms/client` SDK.

### Install the SDK

<PackageManagerTabs command="@beechcms/client" />

### Fetch published posts

Create a script or module to query your published entries:

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

## 6. Cloudflare edge deployment

When you are ready to deploy your production edge CMS to Cloudflare:

### Authenticate with Wrangler

```bash
npx wrangler login
```

### Provision edge resources

Let the Beech CLI provision your D1 database, R2 media bucket, and secrets:

```bash
npx beech setup:cloudflare
```

### Deploy to Workers

```bash
npx beech deploy
```

Your CMS API and embedded Admin Dashboard are now live worldwide on Cloudflare's global edge network with zero cold starts!

---

## Next steps

- Explore [Schema Modeling & Evolution](/build/schema-modeling) for advanced field types and relations.
- Connect your frontend with dedicated [Framework Quickstarts](/start/frameworks/react).
- Learn about [Field Policies & ALE Encryption](/build/field-policies).
