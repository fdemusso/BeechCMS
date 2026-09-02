---
title: First Project
group: User & Builder Guide
category: Getting Started
---

# First Project: From Zero to Full-Stack with BeechCMS

This end-to-end tutorial guides you from an empty directory to a fully functioning **BeechCMS** backend, a configured content management workspace, and a connected frontend application.

Along the way, you will learn how to configure all core system variables, define content models visually through the admin interface, customize your dashboard and editor layouts, trigger automated workflows, and consume content using BeechCMS's official SDKs (**Client SDK**, **Forms SDK**, and **Search SDK**).

## Overview

<p align="center">
  <img src="/images/first-project-architecture.svg" alt="BeechCMS Full-Stack Edge Architecture and Official SDKs" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

## Prerequisites

### Essential
- **Node.js**: `v20.0.0` or higher (`v22 LTS` recommended).
- **Package Manager**: `pnpm` (recommended), `npm`, or `yarn`.
- **Cloudflare Account**: A free tier account is sufficient. [Sign up here](https://dash.cloudflare.com/sign-up) (only needed for edge deployment; local development runs completely offline).

### Optional Integrations
- **Resend Account (Optional)**: Only required if you want to deliver live transactional emails (password resets, notifications) in production. In local development, BeechCMS routes emails to local Mailpit without requiring any API key or third-party account.
- **Upstash Account / QStash (Optional)**: Only needed if you require serverless HTTP queues with automated retry backoff for high-volume background notifications and webhooks. When omitted, BeechCMS seamlessly processes background tasks in-memory.

## Scaffolding

BeechCMS provides an automated scaffolding CLI that configures a production-ready edge backend in seconds:

```bash
npx @beechcms/cms my-app
```

> [!TIP]
> **Non-Interactive Quickstart**:
> To scaffold immediately and skip the interactive prompts, run:
> ```bash
> npx @beechcms/cms my-app --yes
> cd my-app
> pnpm install # or npm install
> ```
> For an in-depth explanation of the scaffolding flags, system requirements, and architecture, refer to the **[Getting Started Guide](./guide.md)**.

### Generated Project Structure

```
my-app/
├── worker.ts       # Cloudflare Worker entry point (delegates to @beechcms/api)
├── wrangler.jsonc  # Cloudflare bindings, environment variables, and assets
├── .dev.vars       # Local secrets (R2 tokens, private keys — git-ignored)
├── .gitignore      # Git ignore rules for state and dependencies
├── tsconfig.json   # TypeScript configuration for the Workers runtime
└── package.json    # Project scripts and dependencies
```

The entire CMS engine, admin dashboard, and REST API are packaged inside `@beechcms/api`. Your application repository contains purely your configuration, while content models (**Seeds**) are managed dynamically in the Cloudflare D1 database.

## Configuration

BeechCMS relies on Cloudflare bindings and specific environment variables to manage authentication, media storage, email delivery, and public API access.

Let's configure both your **local development** environment and your **production secrets**.

### Wrangler Bindings (`wrangler.jsonc`)

Open `wrangler.jsonc` and inspect the configuration:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-app-api",
  "main": "worker.ts",
  "compatibility_date": "2026-02-13",
  "compatibility_flags": ["nodejs_compat"],

  // 1. Bundled React Admin SPA served directly via Workers Assets
  "assets": {
    "binding": "ASSETS",
    "directory": "node_modules/@beechcms/api/assets/dashboard",
    "not_found_handling": "none"
  },

  // 2. Cloudflare D1 Database Binding
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-app-db",
      "database_id": "YOUR_D1_DATABASE_ID_ON_DEPLOY",
      "migrations_dir": "node_modules/@beechcms/api/migrations"
    }
  ],

  // 3. Cloudflare R2 Media Bucket Binding
  "r2_buckets": [
    {
      "binding": "MEDIA_BUCKET",
      "bucket_name": "my-app-media"
    }
  ],

  // 4. Local Development Variables (wrangler dev)
  "vars": {
    "ENV": "development",
    "APP_URL": "http://localhost:8789",
    "CORS_ORIGINS": "http://localhost:5173,http://localhost:3000,http://localhost:4321",
    "PUBLIC_READ_API_KEY": "dev-read-key-changeme",
    "PUBLIC_WRITE_API_KEY": "dev-write-key-changeme",
    "PUBLIC_PUBLISHED_ONLY": "true",
    "DATE_FORMAT": "DD-MM-YYYY",
    "EMAIL_PROVIDER": "smtp", // Points to local Mailpit in dev
    "SMTP_HOST": "localhost",
    "SMTP_PORT": "8025", // Mailpit HTTP API port (BeechCMS routes local email via Mailpit's REST API)
    "EMAIL_FROM": "Beech CMS <dev@my-app.local>"
  },

  // 5. Production Overrides
  "env": {
    "production": {
      "vars": {
        "ENV": "production",
        "APP_URL": "https://my-app.workers.dev",
        "CORS_ORIGINS": "https://my-site.com,https://admin.my-site.com",
        "PUBLIC_PUBLISHED_ONLY": "true",
        "DATE_FORMAT": "DD-MM-YYYY",
        "EMAIL_PROVIDER": "resend",
        "EMAIL_FROM": "Beech CMS <noreply@my-site.com>"
      }
    }
  }
}
```

### Local Secrets (`.dev.vars`)

Create or update `.dev.vars` in the root of your project. This file is read automatically by `wrangler dev` and should **never** be committed to Git:

```bash
# Admin Session Token Signing (generate a 32+ character random hex string)
JWT_SECRET=4f8b9e6a7c3d2e1f0b5a8c7d6e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f

# Resend API Key for Transactional Emails & Automations (Optional in dev)
RESEND_API_KEY=re_123456789_abcdefghijklmnopqrstuvwxyz

# Webhook Verification Secret (for signed outbound webhooks)
WEBHOOK_SECRET=my-super-secret-webhook-signing-key

# R2 S3 Direct Presigned Uploads (Credentials from Cloudflare R2 API Tokens)
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_ENDPOINT=https://<YOUR_CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com
R2_BUCKET_NAME=my-app-media

# Upstash QStash (Background Queues & Notifications — Optional)
# QSTASH_TOKEN=ey...
# QSTASH_CURRENT_SIGNING_KEY=sig_...
# QSTASH_NEXT_SIGNING_KEY=sig_...
# QSTASH_CALLBACK_URL= (Populated automatically by the Cloudflare tunnel during `pnpm dev:full`)
```

### Environment Variables Reference

| Variable | Requirement | Purpose |
| :--- | :---: | :--- |
| `JWT_SECRET` | **Required** | Cryptographically signs session tokens for dashboard users. Keep in `.dev.vars` or Cloudflare secrets. |
| `APP_URL` | **Recommended** | Canonical base URL used for password recovery links and notifications. |
| `CORS_ORIGINS` | **Required** | Comma-separated list of allowed frontend origins (e.g. `https://my-site.com`). |
| `PUBLIC_READ_API_KEY` | **Required** | Passed via `X-API-Key` by your frontend to read content (`GET /api/v1/public/*`). |
| `PUBLIC_WRITE_API_KEY` | **Optional** | Passed via `X-API-Key` by frontend forms to submit entries (`POST /api/v1/public/*`). |
| `R2_ACCESS_KEY_ID` & `R2_SECRET_ACCESS_KEY` | **Required (Media)** | S3-compatible credentials used to generate **direct presigned upload URLs (SigV4)** to Cloudflare R2 without hitting Worker memory limits. |
| `RESEND_API_KEY` | **Optional** | Production transactional emails. In local development, BeechCMS routes to Mailpit with zero config. |
| `EMAIL_PROVIDER` | **Optional** | `smtp` for local testing (Mailpit) or `resend` for cloud production. |
| `SMTP_HOST` & `SMTP_PORT` | **Optional** | Host and HTTP port for local Mailpit (`localhost` and `8025`). In local dev, BeechCMS delivers emails via Mailpit's REST API. |
| `EMAIL_FROM` | **Optional** | Sender address displayed to recipients (e.g. `Beech CMS <noreply@yourdomain.com>`). |
| `WEBHOOK_SECRET` | **Optional** | Secret key used to generate SHA-256 HMAC signatures (`X-BeechCMS-Signature`) on outbound webhooks. |
| `QSTASH_TOKEN` | **Optional** | Upstash QStash Bearer token for serverless message queues, automated retries, and high-volume background notifications. |
| `QSTASH_CURRENT_SIGNING_KEY` & `QSTASH_NEXT_SIGNING_KEY` | **Optional** | HMAC SHA-256 signing keys used to cryptographically verify inbound callbacks sent to `/api/webhooks/qstash`. |
| `QSTASH_CALLBACK_URL` | **Optional** | Public Worker URL called by QStash. Auto-populated by `pnpm dev:full` tunnel; falls back to local in-memory processing when omitted. |

## Database & Setup

Once variables are in place, BeechCMS is ready to initialize and launch.

### Initialize Database

Provision the local SQLite D1 database and apply core system migrations:

```bash
npm run db:migrate:local
# or using the Beech CLI:
npx beech onboard
```

This prepares your local Cloudflare D1 environment (`.wrangler/state/v3/d1`) with the core tables for authentication, content definitions, layouts, and automations.

### Start Local Server

Launch the development server:

```bash
npx wrangler dev --port 8789
```

Open your browser at **[http://localhost:8789/admin](http://localhost:8789/admin)**.

### First-Time Onboarding

Because BeechCMS detects a fresh database, it automatically presents the initial **Setup Wizard**:

1. **Administrator Profile**: Enter your full name, email address, and a secure password.
2. **Site Preferences**: Select your site title, default language (`en`, `it`, etc.), timezone, and currency.
3. Click **Complete Setup & Launch Dashboard**.

You are now logged in to the live BeechCMS administration console.

## Seeds & Admin UI

In BeechCMS, Cloudflare D1 is the **canonical single source of truth**. You do not need to edit static schema files on disk; content types (**Seeds**) and fields (**Branches**) are created and evolved directly through the visual dashboard.

When you define a Seed, the **Botanical Engine** compiles it into native SQLite DDL, indexes, and full-text search tables in D1.

### Create Seed in Builder

1. Navigate to **Settings** (gear icon in the bottom-left sidebar) → **Content Types**.
2. Click **+ New Content Type**.
3. Configure the general properties:
   - **Name (Singular)**: `Post`
   - **Name (Plural)**: `Posts`
   - **Slug**: `posts`
   - **Icon**: Select `FileText` or `BookOpen`.
   - **Group**: `Editorial`
   - **Public Read Access**: Toggle **ON** (allows public frontend reading via API).
   - **Drafts Workflow**: Toggle **ON** (enables Draft vs Published state staging).
   - **Display Name Field**: Select `title`.

4. Add the **Branches (Fields)** for your post:

| Field Alias | Label | Type | Settings / Policies |
| :--- | :--- | :--- | :--- |
| `title` | Title | `text` | **Required**, Enable Search & Sort policies |
| `slug` | URL Slug | `text` | **Required**, Unique, Enable Filter policy |
| `cover_image` | Cover Image | `file` | Accept: `image/*` |
| `excerpt` | Summary | `text` | Multi-line excerpt for SEO & article cards |
| `body` | Article Content | `richtext` | Long-form rich text editor |
| `tags` | Tags | `tags` | Array of string tags (or `json`) |

> [!NOTE]
> **The Botanical Invariant (`id: 'br_...'`)**:
> Every field created receives a permanent identifier under the hood (e.g. `br_pst1`). Even if you rename an alias (e.g., changing `title` to `headline`), your database integrity, triggers, search tables, and automations remain intact without data loss.

Click **Save Seed**. The Botanical Engine executes `CREATE TABLE content_posts` and sets up FTS5 search indexes automatically.

### Views & Customization

Once your Seed is created, you can customize how content is displayed and monitored:

- **List Views (Table, Gallery, Kanban)**:
  Open your **Posts** collection from the sidebar. Use the view switcher in the top right:
  - **Table View**: Classic high-density spreadsheet view with sorting and bulk actions.
  - **Gallery View**: Visual grid displaying the `cover_image` and excerpt.
  - **Kanban View**: Status board grouped by `Draft` and `Published`, allowing drag-and-drop state changes.
- **Custom Metrics & Dashboard Customization**:
  The main dashboard home screen is modular. You can arrange metric widgets, activity feeds, and charts into responsive sections and columns.
- **The Widget SDK**:
  Need to display bespoke analytics, Stripe revenues, or external service metrics directly in the admin dashboard? BeechCMS provides the official **`@beechcms/widget-sdk`**.
  Explore the full guide at **[Custom Dashboard Widgets](./custom-widgets.md)**.

### Entry Editor Layout

BeechCMS allows you to tailor the editing experience **for each individual Seed** directly inside the Entry Editor:

1. **Open the Entry Editor**: Navigate to any Seed from the sidebar (e.g., **Posts**) and click **+ New Post** (or open an existing entry to edit it).
2. **Launch the Layout Builder**: In the top-right header of the editor modal, administrators will see the **Edit Layout** icon button (the layout template icon next to the close button). Click it to switch the dialog into **Builder Mode**.
3. **Customize Layout via Drag & Drop**:
   - **Tabs**: Create and organize tabs to divide lengthy content models (e.g., *Article Body*, *SEO & Social Cards*, *Publishing Meta*).
   - **Sections & Multi-Column Rows**: Arrange fields side-by-side in 1, 2, or 3-column responsive grid rows.
   - **Full-Width Blocks**: Reserve full-width sections for TipTap rich text editors (`body`) or code blocks.
   - **Sidebars & Metadata**: Group secondary branches (`cover_image`, `tags`, author relations) into a compact sidebar column.
   - **Field Picker & Context Menu**: Add unassigned branches or configure section headers and descriptions.
4. **Save**: Click **Save Layout**. All team members creating or editing entries in that Seed will immediately benefit from your customized form layout.
5. **Per-Seed Personalization**: Repeat this process for any other Seed (**Authors**, **Clients**, **Products**) to give each content type its ideal editing structure.

For more on the editor interface and publishing lifecycle, see the **[Content Editor Guide](./content-editor-guide.md)**.

### Setting Up Automations

Automations in BeechCMS are scoped directly to the Seed you are working on and configured without leaving the content workspace:

1. **Open the Automations Panel**: In the sidebar, select the Seed you want to automate (e.g., **Posts** or **Customers**). In the top toolbar of the listing views (next to the Table/Gallery/Kanban view switcher), click the **Automations** button.
2. **Automations Lateral Sheet**: A dedicated side panel slides out from the right displaying the active automations for this Seed, along with toggle switches to enable or disable them. Click **+ New automation**.
3. **Configure Trigger & Actions (Editor Modal)**: The visual Automation Editor opens in the center:
   - **Name**: Give your automation a descriptive name (e.g., *Publish Alert to Slack* or *Customer Confirmation Email*).
   - **When (Trigger)**: Select the initiating lifecycle event (`create`, `update`, `delete`, or recurring `cron` schedule) and attach any optional filter conditions (e.g., `status == 'published'`).
   - **Do (Actions Pipeline)**: Click **+ Add action** to chain operations:
     - **Send email**: Sends transactional emails via Resend (e.g. sending a confirmation email upon contact form submission).
     - **Webhook**: Dispatches signed HTTP requests to external services (n8n, Zapier, Slack, Discord) with automated retry backoff via QStash.
     - **Edit field**: Automatically mutates entry values (e.g. setting an approved date or assigning a ticket).
     - **Create entry**: Spawns an entry in another Seed (e.g. generating an audit log).
     - **Set variable**: Preloads and aggregates data from other Seeds for use in later actions.
4. **Enable**: Click **Enable**. Your edge workflow is immediately active.

For variables interpolation syntax (`\{\{this.field\}\}`), aggregates, and webhook signature verification, see the **[Automations Guide](./automations.md)**, the **[Email Module Guide](./email-module.md)**, and **[Observability & Notifications](./observability-and-notifications.md)**.

## Frontend & SDKs

Now that your CMS is running with published content, let's connect your frontend application.

BeechCMS provides both a standardized **Public REST API** and dedicated **Official SDKs**:

| SDK | Package | Core Capabilities |
| :--- | :--- | :--- |
| **Client SDK** | `@beechcms/client` | Type-safe content querying, auto-pagination, webhook signature verification |
| **Forms SDK** | `@beechcms/forms-react` | Dynamic schema rendering, invisible honeypot & time-trap anti-bot, auto-save |
| **Search SDK** | `@beechcms/search-client` | Client-side hybrid search (FTS + vector embeddings) with 250ms debouncing |

### Public REST API

All seeds configured with `allowPublicRead: true` expose public endpoints authenticated with `PUBLIC_READ_API_KEY`:

```bash
# Fetch published posts ordered by publication date
curl -X GET "http://localhost:8789/api/v1/public/posts?orderBy=created_at&orderDir=desc" \
  -H "X-API-Key: dev-read-key-changeme"
```

**JSON Response (`200 OK`)**:

```json
{
  "data": [
    {
      "id": "a1b2c3d4-0000-0000-0000-123456789abc",
      "slug": "welcome-to-beechcms",
      "status": "published",
      "created_at": 1741507200,
      "title": "Welcome to BeechCMS",
      "excerpt": "Edge-native headless CMS built on Cloudflare Workers.",
      "cover_image": "https://my-app.workers.dev/api/media/cover-image.webp",
      "body": "<p>Content delivered at lightning speed with zero cold starts.</p>",
      "tags": ["cms", "cloudflare", "edge"]
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "returned": 1,
    "seed": "posts"
  }
}
```

For advanced querying, relational joins, and filter operators, see the **[Content API Reference](./content-api.md)**.

### Client SDK (`@beechcms/client`)

The **Client SDK** provides an ergonomic, type-safe HTTP client for Node.js, Astro, Next.js, Remix, and Nuxt.

Install the client:

```bash
pnpm add @beechcms/client # or npm install @beechcms/client
```

#### TypeScript Setup & Content Queries

```typescript
// lib/beech.ts
import { createBeechClient } from '@beechcms/client/server'

// 1. Define your Seed interfaces
export interface Post {
  id: string
  slug: string
  title: string
  excerpt: string
  cover_image?: string
  body: unknown // RichText TipTap AST or HTML string
  tags?: string[]
  created_at: number
}

// 2. Map Seed slugs to types
export interface AppRegistry {
  posts: Post
}

// 3. Instantiate the typed client
export const beech = createBeechClient<AppRegistry>({
  baseUrl: process.env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: process.env.BEECH_READ_API_KEY || 'dev-read-key-changeme',
})
```

#### Fetching in an Astro Page (`src/pages/index.astro`)

```astro
---
// src/pages/index.astro
import { beech } from '../lib/beech'

const result = await beech.content('posts').list({
  limit: 10,
  sort: { created_at: 'desc' },
})

const posts = result.data ? result.data.data : []
---

<html lang="en">
  <head>
    <title>My BeechCMS Blog</title>
  </head>
  <body class="max-w-3xl mx-auto py-12 px-4">
    <h1 class="text-4xl font-bold mb-8">Latest Articles</h1>
    <div class="space-y-6">
      {posts.map((post) => (
        <article class="p-6 border rounded-lg">
          {post.cover_image && <img src={post.cover_image} alt={post.title} class="rounded mb-4" />}
          <h2 class="text-2xl font-bold">
            <a href={`/blog/${post.slug}`}>{post.title}</a>
          </h2>
          <p class="text-gray-600 mt-2">{post.excerpt}</p>
        </article>
      ))}
    </div>
  </body>
</html>
```

#### Fetching in Next.js App Router (`app/blog/[slug]/page.tsx`)

```tsx
// app/blog/[slug]/page.tsx
import { notFound } from 'next/navigation'
import { beech } from '@/lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const result = await beech.content('posts').get({ slug })
  if (result.error || !result.data) {
    notFound()
  }

  const post = result.data.data

  return (
    <article className="max-w-3xl mx-auto py-12 px-4">
      <h1 className="text-4xl font-extrabold mb-4">{post.title}</h1>
      {post.cover_image && (
        <img src={post.cover_image} alt={post.title} className="w-full h-64 object-cover rounded-xl mb-6" />
      )}
      <div className="prose" dangerouslySetInnerHTML={{ __html: renderRichText(post.body) }} />
    </article>
  )
}
```

Learn more in the **[Client SDK Guide](./client-sdk.md)** (including webhook signature verification via `verifyBeechWebhookSignature`).

### Forms SDK (`@beechcms/forms-react`)

Need to collect leads, newsletter signups, contact messages, or customer feedback directly into your BeechCMS database?

The **Forms SDK** eliminates manual form state management, validation boilerplate, and anti-spam configurations.

Install the Forms SDK:

```bash
pnpm add @beechcms/forms-react # or npm install @beechcms/forms-react
```

> [!TIP]
> **CLI Form Generator**:
> BeechCMS can scaffold a form component tailored to your schema and framework:
> ```bash
> npx beech forms
> ```
> Supports React, Vue 3, Svelte 5, and Vanilla JS / Web Components.

#### One-Line Dynamic Form Component

```tsx
import React from 'react'
import { BeechForm } from '@beechcms/forms-react'

export function ContactSection() {
  return (
    <div className="max-w-lg mx-auto p-6 bg-white rounded-xl shadow-sm border">
      <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
      <BeechForm
        seed="contact_requests"
        baseUrl={process.env.NEXT_PUBLIC_BEECH_API_URL || 'http://localhost:8789'}
        apiKey={process.env.NEXT_PUBLIC_BEECH_WRITE_API_KEY || 'dev-write-key-changeme'}
        onSuccess={({ id }) => alert(`Thank you! Message received (ID: ${id})`)}
      />
    </div>
  )
}
```

#### What the Forms SDK Handles Automatically:
1. **Dynamic Schema Fetching**: Queries `GET /api/v1/public/:seed/schema` to render exact validation rules.
2. **Invisible Anti-Bot Defense**: Embeds an invisible HMAC time-trap token and camouflaged honeypot—blocking automated spam bots without irritating CAPTCHAs.
3. **Draft Auto-Save**: Saves unsubmitted form entries in `localStorage` so visitors never lose typed data on accidental page refreshes.
4. **Headless Hook (`useBeechForm`)**: Full UI freedom to build completely custom form controls with Tailwind CSS or Shadcn UI.

Read the complete guide at **[Forms SDK](./forms-sdk.md)**.

### Search SDK (`@beechcms/search-client`)

BeechCMS includes a dedicated edge-native vector and hybrid search engine. The **Search SDK** brings hybrid search directly to your client frontend.

Install the Search SDK:

```bash
pnpm add @beechcms/search-client # or npm install @beechcms/search-client
```

#### Implementation

```tsx
import React, { useState, useEffect } from 'react'
import { SearchClient } from '@beechcms/search-client'

const client = new SearchClient('http://localhost:8789')

export function SearchModal() {
  const [results, setResults] = useState<any[]>([])

  useEffect(() => {
    // 1. Preload cached search index manifest and vector binary (hosted on R2 or CDN)
    client.loadIndex(
      'https://cdn.my-site.com/search/manifest.json',
      'https://cdn.my-site.com/search/vectors.bin'
    )
  }, [])

  const handleQueryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // 2. Automatically debounced hybrid search (Reciprocal Rank Fusion)
    const hits = await client.search(e.target.value, 5)
    setResults(hits)
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg">
      <input
        type="search"
        placeholder="Search articles and docs..."
        onChange={handleQueryChange}
        className="w-full p-3 border rounded-lg"
      />
      <ul className="mt-4 divide-y">
        {results.map((hit) => (
          <li key={hit.record.id} className="py-2">
            <h4 className="font-semibold">{hit.record.title}</h4>
            <p className="text-sm text-gray-500">{hit.record.excerpt}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

#### Why It Is Fast:
- **Reciprocal Rank Fusion (RRF)**: Combines lexical keyword matching with vector semantic embeddings.
- **In-Memory Calculations**: Vector dot-product calculations run in browser memory with zero server lag.
- **Built-in Debouncing**: Safely handles real-time keystroke searches with a 250ms debounce window.

Read the complete guide at **[Search SDK](./search-sdk.md)**.

## Edge Deployment

When your application is ready for production, deploying BeechCMS to Cloudflare takes just a few steps:

### Authenticate Cloudflare

```bash
npx wrangler login
```

### Provision Resources

Create your production D1 database and R2 media bucket:

```bash
# Create D1 database
npx wrangler d1 create my-app-db

# Create R2 storage bucket
npx wrangler r2 bucket create my-app-media
```

Copy the generated `database_id` and update `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "my-app-db",
    "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "migrations_dir": "node_modules/@beechcms/api/migrations"
  }
]
```

### Production Secrets

Set production secrets securely on Cloudflare. Only the core credentials are strictly required; Resend and QStash secrets are optional:

```bash
# ── Core Required Secrets ──
npx wrangler secret put JWT_SECRET --env production
npx wrangler secret put PUBLIC_READ_API_KEY --env production
npx wrangler secret put R2_ACCESS_KEY_ID --env production
npx wrangler secret put R2_SECRET_ACCESS_KEY --env production

# ── Optional: Public Write API Key (for frontend forms) ──
npx wrangler secret put PUBLIC_WRITE_API_KEY --env production

# ── Optional: Transactional Email & Outbound Webhooks (Resend) ──
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put WEBHOOK_SECRET --env production

# ── Optional: Serverless Queues & Background Retries (Upstash QStash) ──
npx wrangler secret put QSTASH_TOKEN --env production
npx wrangler secret put QSTASH_CURRENT_SIGNING_KEY --env production
npx wrangler secret put QSTASH_NEXT_SIGNING_KEY --env production
```

### Deploy Command

Run the deployment workflow:

```bash
npm run deploy
# or using the Beech CLI wrapper (which includes an automated /admin reachability check):
npx beech deploy
```

The deploy process compiles the Worker, uploads dashboard static assets to Cloudflare Workers Assets, and validates that your production `/admin` endpoint is live and reachable.

Once deployed, visit `https://my-app-api.<your-subdomain>.workers.dev/admin` to complete your production onboarding.

## SDK Ecosystem

Here is a quick reference to all official BeechCMS packages and their documentation:

| Package | Role | Documentation Link |
| :--- | :--- | :--- |
| **`@beechcms/cms`** | Project creation & CLI scaffolding assistant | **[Getting Started](./guide.md)** |
| **`@beechcms/cli`** | Local DB migrations, schema diffing, type generation, and deployments | **[CLI Reference](./guide.md#cli-reference)** |
| **`@beechcms/client`** | Lightweight TypeScript HTTP client for fetching content & verifying webhooks | **[Client SDK](./client-sdk.md)** |
| **`@beechcms/forms-react`** | Zero-config dynamic forms with invisible anti-bot & auto-save | **[Forms SDK](./forms-sdk.md)** |
| **`@beechcms/widget-sdk`** | Custom dashboard widgets, analytics cards, and KPI charts | **[Custom Widgets](./custom-widgets.md)** |
| **`@beechcms/search-client`**| Edge-native hybrid search (full-text + vector semantic search) | **[Search SDK](./search-sdk.md)** |
| **Automations & Email** | Native lifecycle workflows, Resend transactional emails, and webhooks | **[Automations](./automations.md)** & **[Email Module](./email-module.md)** |
| **Queues & Notifications** | Serverless background tasks, QStash queues, and activity audit logging | **[Observability & Notifications](./observability-and-notifications.md)** |
