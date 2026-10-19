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

Most flexible CMSs store content as JSON blobs. BeechCMS compiles every content type into its own D1 table. You get native B-Tree indexes, REAL and INTEGER columns you can do math on, CHECK constraints for data integrity, and FTS5 full-text search.

### Define your models in the dashboard or in TypeScript

Content types are seeds, fields are branches, entries are fruit. Create them in the dashboard or write them in TypeScript. The Botanical Engine, our schema compiler, turns either one into SQL at runtime, so you never write that SQL by hand.

### A dependency, not a boilerplate

Your project holds configuration and nothing else. The engine, the dashboard and the API live in `@beechcms/api`, and updating is one command: `npx beech update`.

## Built with

Cloudflare Workers (V8 isolates), Hono v4, D1, R2, React 19 with Vite 7, Tailwind CSS v4 with shadcn/ui, TanStack Query v5, TipTap v3, Zod v4, `jose` JWT with bcryptjs for auth, Turborepo v2 and Vitest v3. The shared engine, types and validation live in `@beechcms/core`.

## Documentation

Full docs: https://fdemusso.github.io/BeechCMS/

- [Start with BeechCMS](https://fdemusso.github.io/BeechCMS/start/): installation and core concepts.
- [Your first project](https://fdemusso.github.io/BeechCMS/start/first-project.html): a step-by-step tutorial.
- [Features](https://fdemusso.github.io/BeechCMS/features/): what the engine does.
- [Reference](https://fdemusso.github.io/BeechCMS/reference/): API and configuration details.
- [System map](https://github.com/fdemusso/BeechCMS/blob/master/_config/SYSTEM_MAP.md): folder structure, dependencies and the rules the codebase keeps.

## Why I built this

In 2025 I lost a €2,000 contract for a React website for a construction company. They needed a blog with photos of new builds and a contact form. WordPress had already burned them once, and every other option meant a dedicated backend, hosting and a managed database. The running costs pushed my quote above what a bigger agency with its own tooling could offer.

So I built the CMS I needed. Workers, D1 and R2 on Cloudflare's free tier made the whole backend free to run. BeechCMS is my first serverless project: I learned Workers and D1 by building it, and it is heading toward a public 1.0.

The name came from the beech wood desktop I had just finished building, while I was staring at a CMS with no name. Then the model fell into place: seeds, branches, fruit.

## Licensing

| Package | License | Details |
|---|---|---|
| `@beechcms/core` | MIT | Free for any use, including commercial |
| `apps/api` | BUSL-1.1 | Free for self-hosting; see the Additional Use Grant |
| `apps/dashboard` | BUSL-1.1 | Free for self-hosting; see the Additional Use Grant |

Self-hosting is always free. The BUSL-1.1 only restricts offering BeechCMS as a managed SaaS service in direct competition with BeechCMS Cloud. After 2030-05-26, these components convert automatically to GPL v2+.

More detail in the [licensing guide](https://github.com/fdemusso/BeechCMS/blob/master/docs/LICENSING.md). For commercial licensing inquiries: demusso1617@gmail.com
