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

## AI Assistant Quickstart

Accelerate your integration by copying this prompt directly into your AI coding assistant:

<LlmPromptNode />

## Core Concepts

BeechCMS is designed around an intuitive botanical mental model, inspired by the growth cycle of a beech tree. Rather than dealing with sterile technical terms, content modeling follows a natural journey from blueprint to harvest:

- **The Seed (Blueprint)**: Every content type begins as a Seed. It acts as the genetic blueprint—the schema defining the nature and rules of what can grow, without storing any practical data yet.
- **The Tree & Branches (Structure & Fields)**: When a Seed is planted, it grows into an organized structure defined by its Branches. Each Branch represents an individual field or property that shapes the attributes of your content.
- **The Fruits (Content Records)**: The harvest of your tree. Every time you create and publish an entry, the tree bears a Fruit—a concrete content record holding real, tangible data.
- **The Forest (Your Content Ecosystem)**: A complete digital experience is rarely a single tree. Multiple Seeds grow alongside each other, forming a rich, interconnected Forest that powers your entire project.

## Onboarding Pathways

Choose the fastest path to integrate BeechCMS into your stack:

- **[Your First Project](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, dual-table staging, and Cloudflare deployment.
- **Framework Quickstarts**: Jump straight to an idiomatic integration guide for your frontend framework:
  - [React](/start/frameworks/react) — Single-page application with `@beechcms/client`.
  - [Next.js](/start/frameworks/nextjs) — Server Components, caching, and dynamic static generation.
  - [Astro](/start/frameworks/astro) — Zero-JS static builds and edge server rendering.
  - [Vue](/start/frameworks/vue) — Composition API with reactive content loading.
  - [Nuxt](/start/frameworks/nuxt) — Universal rendering with `useAsyncData`.
  - [Remix](/start/frameworks/remix) — Edge loaders and typed data hooks.
  - [SvelteKit](/start/frameworks/sveltekit) — Universal load functions and reactive stores.
  - [Hono](/start/frameworks/hono) — High-throughput edge consumer APIs.
