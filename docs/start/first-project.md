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

Click **Save Seed**. Under the hood, the Botanical Engine compiles the SQLite DDL: provisioning `content_posts`, the draft mirror table `content_posts_drafts`, B-tree indexes, and the full-text search virtual table `fts_posts`.

> [!TIP]
> **AI-Assisted Modeling:** Prefer using an AI coding assistant in your editor? You can connect Cursor, Claude Desktop, Antigravity, or VSCode to create and evolve seeds automatically via the native [AI & MCP Setup](/start/mcp).

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

## 5. Invite your team

The account you created during setup is the **Developer / instance owner** — the only account that can evolve schemas. Everyone else is onboarded through **scoped RBAC**: an account plus one or more `(role, scope)` assignments.

Open **Settings → Access**. Three entries appear there, each gated by what you hold:

| Tab | Visible when | What it does |
|---|---|---|
| **Users** | `manage_users` on any scope | Create accounts, assign roles per scope, deactivate |
| **Roles** | `manage_users` or `manage_roles` on any scope | Author permission bundles |
| **Invitations** | `manage_users` on any scope | Send, regenerate and revoke 72-hour invite links |

### Create a role

In **Roles → Create role**, give it a name, pick a lucide **icon**, and tick permissions grouped as **Content** (`content:read`, `content:create`, `content:update`, `content:delete`) and **System** (`manage_users`, `manage_roles`, `view_analytics`).

For a blog editor, `content:read` + `content:create` + `content:update` is enough. A permission you do not hold yourself is disabled in the form — you can never mint a role more powerful than you are.

`SuperAdmin` is seeded by migration with the full set and is read-only: its edit and delete buttons are permanently disabled.

### Option A — create the account directly

**Users → Create account** asks for email, password, name and surname. The account is created **zero-trust**: it has no role, no scope and sees nothing until you assign one. It appears in the table as *No access*.

Click the account's roles button, pick the role and a **scope** — either a single seed (`posts`) or **All seeds (global)** — and add the assignment. The scope dropdown only ever lists scopes *you* may grant on.

### Option B — invite by email

**Invitations → Invite** takes the email plus the same `(role, scope)` pair, then emails a link valid for **72 hours**. No account exists until the invitee redeems it.

The invitee lands on `/admin/accept-invite?token=…`, sees "you were invited as *Role* on *Scope*", chooses a password, and is sent to the login page. Their authority is re-checked at that moment: if you were deactivated or lost the permission in the meantime, the invitation stops working.

Rows show a derived status — `pending`, `expired` or `accepted` — with actions to regenerate (a fresh token and a new 72-hour window) or revoke.

> [!NOTE]
> Invitations need a configured email provider. Locally that is Mailpit (`EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=8025`); in production, `RESEND_API_KEY`. Without either, the invite button returns `email-unavailable`. Option A works with no email configured at all.

Full model and API: [Roles & Permissions](/manage/roles-permissions) and the [RBAC Administration API](/reference/rbac-api).

---

## 6. Query with SDK

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
  const result = await client
    .collection('posts')
    .orderBy('created_at', 'desc')
    .limit(10)
    .list()

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

### Refine the query

`collection(seed)` returns a chainable query builder. Each method compiles to the Public API query string — there is no second query language to learn:

```typescript
// Filter, search, project, paginate
const result = await client
  .collection('posts')
  .where({ status: 'published', views: { gte: 100 } })
  .search('edge rendering')
  .select(['id', 'title', 'slug'])
  .orderBy('created_at', 'desc')
  .limit(12)
  .page(1)
  .list()

// A single entry by slug — .first() returns a 404 problem when nothing matches
const post = await client.collection('posts').where({ slug: 'hello-world' }).first()

// Pull related entries in the SAME request instead of an N+1 follow-up
const withAuthor = await client
  .collection('posts')
  .where({ slug: 'hello-world' })
  .include(['author'])
  .first()
// → entry.author holds the raw id, entry._includes.author holds the expanded record

// Filter through a relation, resolved server-side
const byAuthorName = await client
  .collection('posts')
  .whereRelation('author', { where: { name: { contains: 'Jane' } } })
  .list()
```

> [!TIP]
> Stop hand-writing the row interfaces above: `npx beech types generate` reads the live schema and writes `beech.generated.ts`. Pass its `BeechDatabase` type as the client generic and every seed slug, field name, and sort key becomes compile-checked. Full reference: [Client SDK](/reference/client-sdk).

---

## 7. Cloudflare edge deployment

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
- Move your content model into reviewable code with a [`beech.schema.ts` manifest](/build/schema-manifest).
- Read the [Client SDK](/reference/client-sdk) reference for the full query builder, relation expansion, and typed registries.
- Set up your team with [Roles & Permissions](/manage/roles-permissions) — scopes, invitations, and anti-escalation rules.
- Connect your AI assistant via [AI & MCP Setup](/start/mcp) to inspect and evolve content models directly from your editor.
- Connect your frontend with dedicated [Framework Quickstarts](/start/frameworks/react).
- Learn about [Field Policies & ALE Encryption](/build/field-policies).
