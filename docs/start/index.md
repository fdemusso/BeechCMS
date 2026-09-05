# Start with BeechCMS

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

## Quick Installation

Scaffold a production-ready edge backend in seconds:

<PackageManagerTabs
  npm="npx @beechcms/cms my-app"
  pnpm="pnpm dlx @beechcms/cms my-app"
  yarn="yarn dlx @beechcms/cms my-app"
  bun="bunx @beechcms/cms my-app"
/>

## Core Concepts

Understanding BeechCMS boils down to three core concepts:

- **Seeds (Content Blueprints)**: A Seed is a content model (such as `posts`, `authors`, or `products`). Each Seed defines an identifying `slug`, UI labels, branches, and presentation policies. Seeds configure REST API permissions (`allowPublicRead`, `allowPublicPost`, `allowPublicEdit`), content staging (`allowDrafts`), and GDPR retention.
- **Branches (Fields & Attributes)**: Individual properties inside a Seed (such as `title`, `cover_image`, `body`, or `tags`). Every branch carries a permanent identifier (`id: 'br_...'`, e.g. `br_01`, `br_02`) that preserves database integrity and relationships even across alias renames.
- **Fruits (Content Records)**: Concrete content items generated from a Seed and persisted in Cloudflare D1 (`Entry` records).

```text
Seed (Blueprint)  ──►  Branches (Fields)  ──►  Fruits (Records)
```

## AI Assistant Quickstart

Accelerate your integration by copying this prompt directly into your AI coding assistant:

<LlmPromptNode />

## Onboarding Pathways

Choose the fastest path to integrate BeechCMS into your stack:

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, dual-table staging, and Cloudflare deployment.
- **Framework Quickstarts**: Jump straight to an idiomatic integration guide for your frontend framework:
  - [React](/start/frameworks/react) — Single-page application with `@beechcms/client`.
  - [Next.js](/start/frameworks/nextjs) — Server Components, caching, and dynamic static generation.
  - [Astro](/start/frameworks/astro) — Zero-JS static builds and edge server rendering.
  - [Vue](/start/frameworks/vue) — Composition API with reactive content loading.
  - [Nuxt](/start/frameworks/nuxt) — Universal rendering with `useAsyncData`.
  - [Remix](/start/frameworks/remix) — Edge loaders and typed data hooks.
  - [SvelteKit](/start/frameworks/sveltekit) — Universal load functions and reactive stores.
  - [Hono](/start/frameworks/hono) — High-throughput edge consumer APIs.
