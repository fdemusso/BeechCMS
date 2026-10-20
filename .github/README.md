![beechLogoDark.png](../docs/public/images/beechLogoDark.png)

# BeechCMS

**A headless CMS your client can run for $0 a month.**

You build the site. You hand it over. Your client edits their own content for as long as they like, on their own Cloudflare account, with no hosting bill and no maintenance contract.

BeechCMS runs entirely on Cloudflare: Workers for the API, D1 (SQLite at the edge) for the database, R2 for media. For most content sites that fits inside the free tier.

**See it running:** [a construction company's website](https://impresa-edile-web.demusso1617.workers.dev). Its blog, photos and content are all managed through BeechCMS, on the free tier. A read-only guest login for the dashboard is in progress, so you will be able to look around the back office too.

> [!WARNING]
> **Beta.** BeechCMS runs one live client site today, but it is still in Beta. 1.0 is almost here, and I want it to be perfect. Until then, known security vulnerabilities and data-loss risks are still open, and there is no warranty or liability. The recommended use is evaluation and MVPs. Pin a version, keep a D1 export, and update to the latest release to pick up fixes. Found a security problem? Report it privately through the Security tab of this repository.

## Quick start

```bash
npx @beechcms/cms my-app
```

The wizard scaffolds the project. Add `--yes` to skip it and use the starter template.

Then create the database tables:

```bash
npx beech onboard
```

`npx beech init --db` does the same job. From there, the [docs](https://fdemusso.github.io/BeechCMS/start/) take you through configuration and deployment.

## Why Beech

### Your client pays nothing to keep it running

Cloudflare's free tier covers Workers, D1 and R2 for most content sites. The client gets a dashboard, an API and media uploads, all self-managed. The only account they need is a Cloudflare one.

### Real SQL tables, not JSON blobs

Most flexible CMSs store content as JSON blobs. BeechCMS compiles every content type into its own dedicated D1 table. You get native B-Tree indexes, REAL and INTEGER columns you can do math on, CHECK constraints for data integrity, and FTS5 full-text search.

### Declarative Content Modeling: Seeds, Branches & Fruit

Content types are **seeds**, fields are **branches**, and entries are **fruit**. You can model your content directly in the visual dashboard or declaratively in code via `beech.schema.ts` using the `@beechcms/core/schema` DSL.

The manifest is **typed, version-controlled desired state** in Git, while D1 remains the single runtime authority. The Botanical Engine compiles your definitions into deterministic SQL DDL:

```typescript
// beech.schema.ts
import { defineSchema, defineSeed, defineField, defineGroup } from '@beechcms/core/schema'

// Reusable field bundle (macro expanded at author time)
const seo = defineGroup('seo', [
  defineField.text({ alias: 'meta_title', label: 'Meta title' }),
  defineField.text({ alias: 'meta_description', label: 'Meta description' }),
])

export default defineSchema({
  seeds: [
    defineSeed({
      slug: 'authors',
      label: 'Author',
      labelPlural: 'Authors',
      displayNameAlias: 'name',
      allowPublicRead: true,
      branches: [
        defineField.text({ alias: 'name', label: 'Name', requiredOnCreate: true }),
        defineField.richtext({ alias: 'bio', label: 'Biography' }),
        defineField.text({
          alias: 'contact_email',
          label: 'Contact email',
          policies: { classification: 'Confidential', privacy: 'encrypt', public: false },
        }),
      ],
    }),

    defineSeed({
      slug: 'posts',
      label: 'Post',
      labelPlural: 'Posts',
      displayNameAlias: 'title',
      allowPublicRead: true,
      allowDrafts: true,
      softDelete: true,
      branches: [
        defineField.text({ alias: 'title', label: 'Title', requiredOnCreate: true }),
        defineField.richtext({ alias: 'body', label: 'Body' }),
        defineField.file({ alias: 'cover', label: 'Cover image' }),
        defineField.tags({ alias: 'tags', label: 'Tags' }),
        defineField.relation({
          alias: 'author',
          label: 'Author',
          targetSeed: 'authors',
          onDelete: 'SET NULL',
        }),
        seo, // Splices meta_title and meta_description into this seed
      ],
    }),
  ],
})
```

Reconcile code with the live database in an explicit, safe GitOps loop:

```bash
npx beech schema export   # Snapshot live D1 schema to beech.schema.ts
npx beech schema diff     # Check drift between manifest and database
npx beech schema plan     # Dry-run and preview SQL DDL changes
npx beech schema apply    # Safely apply changes (strictly additive migrations)
npx beech types generate  # Generate end-to-end TypeScript types
```

### Type-Safe Querying with the Fluent Client SDK

Consume your content with the official TypeScript client (`@beechcms/client`). Enjoy automatic type inference, relation subqueries, and eager expansion:

```typescript
import { createClient } from '@beechcms/client'

const client = createClient({ baseUrl: 'https://cms.my-client.workers.dev' })

// Fluent, type-safe queries with relation expansion
const posts = await client
  .collection('posts')
  .where('status', 'eq', 'published')
  .include('author')
  .orderBy('created_at', 'desc')
  .all()
```

### Full-Featured Edge Content Platform

- **Flexible Editorial Views:** Switch effortlessly between Table, drag-and-drop Kanban, and Gallery views.
- **Field-Level Localization:** Multilingual content per branch without DDL complexity or duplicate tables.
- **Trash & Soft Delete:** Reversible deletions with automated GDPR retention and cleanup.
- **Granular RBAC:** Custom roles, permission evaluation, and secure invitation workflows.
- **Event Automations:** Webhook delivery, cron triggers, and transactional email notifications via Resend and QStash.
- **AI-Native Control Plane:** Integrated Model Context Protocol (`@beechcms/mcp`) so AI assistants (Cursor, Claude, Antigravity) can safely inspect, plan, and evolve your schema.

### A dependency, not a boilerplate

Your project holds configuration and nothing else. The engine, the dashboard and the API live in `@beechcms/api`, and updating is one command: `npx beech update`.

## Built with

Cloudflare Workers (V8 isolates), Hono v4, D1 (SQLite), R2, React 19 with Vite 7, Tailwind CSS v4 with shadcn/ui, TanStack Query v5, TipTap v3, Zod v4, `jose` JWT with bcryptjs for auth, Turborepo v2 and Vitest v3. Monorepo packages: `@beechcms/core` (Botanical Engine & Schema Manifest DSL), `@beechcms/client` (fluent query builder), `@beechcms/cli`, `@beechcms/mcp`, `@beechcms/forms-react`, `@beechcms/widget-sdk`.

## Documentation

Full docs: https://fdemusso.github.io/BeechCMS/

- [Start with BeechCMS](https://fdemusso.github.io/BeechCMS/start/): installation and core concepts.
- [Your first project](https://fdemusso.github.io/BeechCMS/start/first-project.html): a step-by-step tutorial.
- [Schema Manifest (`beech.schema.ts`)](https://fdemusso.github.io/BeechCMS/build/schema-manifest.html): declarative schema DSL, seed declaration, and GitOps migrations.
- [Client SDK](https://fdemusso.github.io/BeechCMS/reference/client-sdk.html): fluent query builder, relation includes, and type safety.
- [Features](https://fdemusso.github.io/BeechCMS/features/): editorial views, localization, trash, automations, and search.
- [Reference](https://fdemusso.github.io/BeechCMS/reference/): REST API endpoints, MCP server, and configuration details.
- [System map](https://github.com/fdemusso/BeechCMS/blob/master/_config/SYSTEM_MAP.md): folder structure, dependencies and codebase rules.

## Why I built this

In 2025 I lost a €2,000 contract for a React website for a construction company. They needed a blog with photos of new builds and a contact form. WordPress had already burned them once, and every other option meant a dedicated backend, hosting and a managed database. The running costs pushed my quote above what a bigger agency with its own tooling could offer.

So I built the CMS I needed. Workers, D1 and R2 on Cloudflare's free tier made the whole backend free to run. BeechCMS is my first serverless project: I learned Workers and D1 by building it, and it is heading toward a public 1.0.

The name came from the beech wood desktop I had just finished building, while I was staring at a CMS with no name. Then the model fell into place: seeds, branches, fruit.

## Licensing

| Package | License | Details |
|---|---|---|
| `@beechcms/*` (`core`, `client`, `cli`, `mcp`, `widget-sdk`, `forms-react`) | MIT | Free for any use, including commercial |
| `apps/api` | BUSL-1.1 | Free for self-hosting; see the Additional Use Grant |
| `apps/dashboard` | BUSL-1.1 | Free for self-hosting; see the Additional Use Grant |

Self-hosting is always free. The BUSL-1.1 only restricts offering BeechCMS as a managed SaaS service in direct competition with BeechCMS Cloud. After 2030-05-26, these components convert automatically to GPL v2+.

More detail in the [licensing guide](https://github.com/fdemusso/BeechCMS/blob/master/docs/LICENSING.md). For commercial licensing inquiries: demusso1617@gmail.com
