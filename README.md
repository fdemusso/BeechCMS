![beecinserisci ihLogoDark.png](docs/images/beechLogoDark.png)

**BeechCMS** is a headless CMS built for developers who build websites for clients.

The pitch is simple: you build the site, you hand it over, and your client can manage their own content forever — with **zero hosting costs**. No monthly subscriptions, no server bills, no maintenance contract needed just to keep the lights on.

This is possible because BeechCMS runs entirely on **Cloudflare's free tier** — Workers for the API, D1 (SQLite at the edge) for the database, and R2 for media storage. A Cloudflare account is all the infrastructure a client ever needs.

---

## Why Beech?

### Zero running costs for your clients

Cloudflare's free tier covers D1, R2, and Workers for the vast majority of real-world content sites. You deliver a fully self-managed product — dashboard, API, media uploads — and the client pays nothing to keep it running. That's a compelling offer.

### One schema, everything follows

Define your content model once in `seeds.ts`. BeechCMS generates the REST API, the admin dashboard, the validation rules, the public endpoints, and the filter/sort options automatically. No glue code, no drift between layers.

### Rename a field without a migration

The **Botanical Engine** separates human-readable field aliases (`title`, `publishedAt`) from immutable internal IDs (`br_01`, `br_02`). Rename an alias in your seed definition and it propagates instantly — no SQL, no deployment coordination.

### Works as a dependency, not a boilerplate

Your project is four files. The BeechCMS engine, dashboard, and API live inside `node_modules/@beech/api`. Update with `npm update @beech/api`.

---

## Getting Started

```bash
npx beech-cms
```

The interactive wizard scaffolds a ready-to-use project in seconds. For everything from configuration to deployment, see the **[Developer Guide](./docs/guide.md)**.

---

## The Botanical Engine

The Botanical Engine is the translation layer at the heart of BeechCMS. Every field has two identities:

| Identity | Example | Mutable? |
|---|---|---|
| **Branch ID** — immutable DB key | `br_01` | Never |
| **Alias** — human-readable API name | `title` | Any time |

Two pure functions handle all translation:

```typescript
apiToDb(seed, { title: 'Hello' })   // → { br_01: 'Hello' }
dbToApi(seed, { br_01: 'Hello' })   // → { title: 'Hello' }
```

Every read and write passes through these functions. Field aliases are free to evolve; the database never knows they changed.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Edge runtime | Cloudflare Workers (V8 Isolates) |
| API framework | Hono v4 |
| Database | Cloudflare D1 (SQLite at the edge) |
| Object storage | Cloudflare R2 (zero egress cost) |
| Shared logic | `@beech/core` — Botanical Engine, types, validation |
| Dashboard | React 19 + Vite 7 |
| UI | Tailwind CSS v4 + Shadcn/ui |
| Server state | TanStack Query v5 |
| Rich text | TipTap v3 + KaTeX |
| Auth | `jose` JWT + bcryptjs |
| Validation | Zod v4 |
| Testing | Vitest v3 |
| Build orchestration | Turborepo v2 |


---
## Documentation

| Document | Description |
|---|---|
| [Developer Guide](./docs/guide.md) | End-to-end guide: scaffolding, seeds, API consumption, deployment |
| [Architecture](./docs/nuovidocs/architecture.md) | Monorepo topology, Botanical Engine data flow, D1 model |
| [API Reference](./docs/nuovidocs/api-reference.md) | Auth, Content CRUD, Media Engine, Public API, rate limiting |
| [Frontend Guide](./docs/nuovidocs/frontend-guide.md) | FieldRenderer registry, TanStack Query patterns, adding field types |
| [System Map](./docs/SYSTEM_MAP.md) | Folder structure, conventions, and architectural constraints |

---
# Faq about BeechCMS
## Why "Beech"?

One afternoon I was staring at half a CMS with no name. I'd spent weeks building my desk setup — monitors, peripherals, the works — and the last thing I added was a beech wood desktop. I cut it, shaped it, sanded it, finished it until it was exactly right.

I was sitting at that desk trying to think of a name, looked to the side, and saw the wood. Beech. And then it clicked — seeds, branches, the forest, the fruit. The whole metaphor was already there in the project: content types are seeds, fields are branches, the data that grows from them is the fruit. The name took about three seconds.

Sometimes the best names aren't invented. They're found.

## Why I Built This

In 2025 I lost a €2,000 contract for a React showcase site for a construction company. The client needed two things beyond a static site: a blog where they could post photos of new builds, and a contact form. Simple requests — but they turned the project into a problem.

The tools that existed were either too heavy (WordPress, which the client had already had a bad experience with), too expensive once you added hosting and a managed database, or simply not designed to work alongside a modern React frontend without standing up a dedicated backend. The monthly running costs pushed my quote above what a larger agency — one that already had its own internal tooling — could offer. I lost the contract.

That was the moment I understood the real gap. Small agencies and freelancers don't lose on talent or quality. They lose because they don't have the same leverage as larger competitors who've already amortized the cost of building their own CMS. I decided to build mine.

**Why Cloudflare?** I was already looking for an alternative to Vercel that didn't require a paid plan for commercial projects. When I discovered that Cloudflare's free tier included not just Workers but also D1 (a relational database at the edge) and R2 (S3-compatible object storage), the whole architecture became clear. A full CMS backend — API, database, media storage, auth — with zero monthly cost for the client.

**Why the Botanical Engine?** BeechCMS is designed to be used by developers who are not me. They define their own content schemas with their own field names. I needed the internal database layer to be stable regardless of what names a developer chose — or renamed later. The solution was to separate the two concerns completely: every field gets an immutable internal ID (`br_01`, `br_02`) that the database never sees change, and a human-readable alias (`title`, `coverImage`) that the developer controls freely. Renaming a field is a one-line change in `seeds.ts`. The database is never touched.

**What I learned building it.** BeechCMS is my first serious serverless project. I had no prior experience with Cloudflare Workers, edge computing, or D1. Everything I know about this stack I learned by building this — reading documentation, hitting limits, understanding why they exist, and finding the right abstractions. The project is currently in active development toward a public 1.0 release and is already available on npm.

---

_BeechCMS — Precision-engineered content infrastructure for the edge._
