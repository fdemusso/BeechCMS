# Sprint: docs-start-and-build-migration

### Pre-Computation Analysis
a) **God Nodes:**
   - `docs/.vitepress/config.mts`: The central orchestrator for VitePress routing, navigation, and contextual sidebars.
   - `docs/guide.md`: Monolithic 258-line getting started & builder guide (~18KB) mixing introductory concepts, schema evolution, encryption, and CLI reference.
   - `docs/first-project.md`: Monolithic 665-line tutorial (~28KB) combining scaffolding, database bootstrap, visual modeling, front-end SDKs, and Cloudflare deployment.
   - `docs/api-reference.md`: Massive 65KB REST API monolith (strictly reserved for Sprint 3: `docs-reference-vertical-slicing`).
b) **Architectural Boundaries Affected:**
   - None in `@beechcms/core`, `apps/api`, or `apps/dashboard`.
   - The architectural scope is strictly contained within the `docs/` workspace (`docs/start/**`, `docs/build/**`, `docs/.vitepress/config.mts`, `docs/.vitepress/theme/components/FrameworkGrid.vue`).
c) **Impact Analysis (`graphify affected`):**
   - `graphify affected "vitepress" --depth 2` output: `vitepress [imports] package.json:L96`.
   - `graphify path "vitepress" "D1Database"` confirms zero direct dependency chains between the documentation layer and core database primitives (`createD1Database`).
   - Zero runtime CMS services, edge worker handlers, or D1 database migrations are affected or broken.

### VETO Audit
- **Botanical Dialect:** Validated. Zero direct SQLite or D1 queries bypass `@beechcms/core` because no database queries are created or executed in this sprint.
- **Vertical Slice Architecture:** Validated. All documentation files in `docs/start/` and `docs/build/` are decoupled static markdown units conforming to vertical slice isolation. No cross-slice runtime dependencies are introduced. No modifications to `apps/api/features/` or `apps/dashboard/src/features/`.
- **YAGNI & Cloudflare Purity:** Validated. Adheres strictly to the static VitePress generation paradigm. No dynamic runtime code execution or interactive web consoles are introduced. Package manager preferences utilize lightweight `localStorage` with in-memory fallback, and AI prompts utilize client-side copy with dynamic link injection.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
Following the completion of Sprint 1 (`docs-infrastructure-and-theme`), the BeechCMS documentation site has the structural shell for 6 top-level macro-areas, contextual sidebar navigation, and custom Vue presentation components (`PackageManagerTabs`, `LlmPromptNode`, `FrameworkGrid`). However, the `Start` and `Build` macro-areas currently contain bare stub pages (`index.md`), and the homepage framework cards point generically to `/start/` without guiding developers through concrete integrations.

This sprint exists to resolve the primary adoption bottleneck identified in the Feature Brief: the lack of guided onboarding and the presence of monolithic guides (`guide.md` and `first-project.md`). By populating the `Start` macro-area (introducing the core architecture, a streamlined 5-minute First Project, and 8 dedicated framework onboarding nodes with copyable LLM prompts) and the `Build` macro-area (introducing schema modeling, field security policies, custom widgets, developer CLI workflows, and vertical slice architecture guidelines), developers can immediately onboard with their frontend framework of choice (React, Next.js, Astro, Vue, Nuxt, Remix, SvelteKit, Hono) and learn how to model and extend the edge CMS.

This sprint strictly precedes Sprint 3 (`docs-reference-vertical-slicing`), because practical onboarding and developer workflows must be isolated and stabilized before dismantling the 65KB REST API specification monolith.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- `docs/.vitepress/config.mts` defines the top-level `nav` with 6 items, but `sidebar['/start/']` and `sidebar['/build/']` contain only single-item stub entries:
  - `'/start/': [ { text: 'Start', items: [ { text: 'Introduction', link: '/start/' } ] } ]`
  - `'/build/': [ { text: 'Build', items: [ { text: 'Integration', link: '/build/' } ] } ]`
- `docs/.vitepress/theme/components/FrameworkGrid.vue` contains an array of 8 frameworks, but every entry hardcodes `link: '/start/'` because dedicated framework guide pages do not yet exist.
- `docs/start/index.md` is a minimal 26-line stub.
- `docs/build/index.md` is a minimal 11-line stub.
- Existing guides in `docs/` remain monolithic or scattered at the root:
  - `docs/guide.md` (258 lines): contains Getting Started, Edge Architecture, Core Concepts, Quickstart, Scaffolding, Project Layout, Local Development, External Services, Branch Types Reference, Schema Evolution, Media Delivery, CLI Reference.
  - `docs/first-project.md` (665 lines): contains an end-to-end tutorial mixing setup, admin UI, SDKs, and deployment.
  - `docs/development.md` (172 lines): contains monorepo stack, Docker services, CLI commands, migrations, testing.
  - `docs/vertical-slice.md` (274 lines): contains VSA rationale, slice anatomy, thin handler pattern, middleware injection, and anti-patterns.
  - `docs/custom-widgets.md` (179 lines): contains `@beechcms/widget-sdk` architecture, postMessage bridge, widget schema.
- Graphify checks confirm no connections to `@beechcms/core`, `apps/api`, or `apps/dashboard`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `docs/.vitepress/config.mts`: Updated contextual sidebars for `'/start/'` and `'/build/'`.
- `docs/.vitepress/theme/components/FrameworkGrid.vue`: Updated links pointing to `/start/frameworks/<name>`.
- `docs/start/index.md`: Enhanced Start macro-area landing hub with edge architecture, quick installation, and pathways.
- `docs/start/first-project.md`: Streamlined 5-minute zero-to-fullstack tutorial (scaffolding, wrangler, database bootstrap, seed modeling, dual-table staging, `@beechcms/client` fetching, Cloudflare deployment).
- Framework Onboarding Nodes (8 files under `docs/start/frameworks/`):
  - `docs/start/frameworks/react.md`: React SPA / Vite quickstart with `<LlmPromptNode>` and `@beechcms/client`.
  - `docs/start/frameworks/nextjs.md`: Next.js App Router (Server Components & caching) quickstart with `<LlmPromptNode>`.
  - `docs/start/frameworks/astro.md`: Astro static / edge SSR quickstart with `<LlmPromptNode>`.
  - `docs/start/frameworks/vue.md`: Vue 3 SPA / Vite quickstart with `<LlmPromptNode>`.
  - `docs/start/frameworks/nuxt.md`: Nuxt 3 universal rendering quickstart with `<LlmPromptNode>`.
  - `docs/start/frameworks/remix.md`: Remix / React Router v7 edge loaders quickstart with `<LlmPromptNode>`.
  - `docs/start/frameworks/sveltekit.md`: SvelteKit edge adapter quickstart with `<LlmPromptNode>`.
  - `docs/start/frameworks/hono.md`: Hono edge API / worker consumer quickstart with `<LlmPromptNode>`.
- Build Macro-Area Modules (6 files under `docs/build/`):
  - `docs/build/index.md`: Enhanced Build macro-area hub with core capabilities and direct navigation cards.
  - `docs/build/schema-modeling.md`: Seeds, Branches, Fruits, Branch Types reference table, Botanical compilation pipeline, Additive Invariant, and Danger Zone safeguards.
  - `docs/build/field-policies.md`: Granular branch security policies, ALE encryption (AES-256-GCM), blind indexing (`<alias>_bidx` HMAC-SHA256), classification levels (`public`, `internal`, `confidential`, `restricted`), and masking rules.
  - `docs/build/custom-widgets.md`: `@beechcms/widget-sdk` integration, postMessage bridge, manifest format, sandbox isolation, props, and lifecycle events.
  - `docs/build/cli-workflows.md`: Beech CLI workflows, database migrations, onboarding verification, TypeScript type generation, form generation, Cloudflare setup, and monorepo vs consumer command matrix.
  - `docs/build/vertical-slice-architecture.md`: Vertical Slice Architecture development guide, API slice anatomy, thin handler pattern, middleware injection, dashboard slice anatomy, zero cross-slice import rules, and VETO checklist.
- Legacy Redirection Pointers:
  - Update root files (`docs/first-project.md`, `docs/development.md`, `docs/vertical-slice.md`, `docs/custom-widgets.md`, `docs/guide.md`) with clear canonical callouts pointing readers to the new modular URLs in `/start/` and `/build/`, guaranteeing zero broken bookmarks or links.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1: VitePress Sidebar Configuration (`docs/.vitepress/config.mts`)
Update the `sidebar` object in `docs/.vitepress/config.mts` to provide rich, grouped contextual navigation for both `/start/` and `/build/`:

```typescript
sidebar: {
  '/start/': [
    {
      text: 'Getting Started',
      items: [
        { text: 'Overview', link: '/start/' },
        { text: 'First Project (5 min)', link: '/start/first-project' }
      ]
    },
    {
      text: 'Framework Integration',
      items: [
        { text: 'React', link: '/start/frameworks/react' },
        { text: 'Next.js', link: '/start/frameworks/nextjs' },
        { text: 'Astro', link: '/start/frameworks/astro' },
        { text: 'Vue', link: '/start/frameworks/vue' },
        { text: 'Nuxt', link: '/start/frameworks/nuxt' },
        { text: 'Remix', link: '/start/frameworks/remix' },
        { text: 'SvelteKit', link: '/start/frameworks/sveltekit' },
        { text: 'Hono', link: '/start/frameworks/hono' }
      ]
    }
  ],
  '/build/': [
    {
      text: 'Overview',
      items: [
        { text: 'Building with BeechCMS', link: '/build/' }
      ]
    },
    {
      text: 'Content Modeling',
      items: [
        { text: 'Schema Modeling', link: '/build/schema-modeling' },
        { text: 'Field Policies & Encryption', link: '/build/field-policies' }
      ]
    },
    {
      text: 'Extension & Customization',
      items: [
        { text: 'Custom Widgets', link: '/build/custom-widgets' }
      ]
    },
    {
      text: 'Tooling & Architecture',
      items: [
        { text: 'CLI Workflows', link: '/build/cli-workflows' },
        { text: 'Vertical Slice Architecture', link: '/build/vertical-slice-architecture' }
      ]
    }
  ],
  '/features/': [
    {
      text: 'Features',
      items: [
        { text: 'Overview', link: '/features/' }
      ]
    }
  ],
  '/manage/': [
    {
      text: 'Manage',
      items: [
        { text: 'Management', link: '/manage/' }
      ]
    }
  ],
  '/reference/': [
    {
      text: 'Reference',
      items: [
        { text: 'API Reference', link: '/reference/' }
      ]
    }
  ],
  '/resources/': [
    {
      text: 'Resources',
      items: [
        { text: 'Assets', link: '/resources/' }
      ]
    }
  ]
}
```

### Task 2: FrameworkGrid Routing (`docs/.vitepress/theme/components/FrameworkGrid.vue`)
Update the `frameworks` array in `FrameworkGrid.vue` so that cards route directly to their dedicated framework quickstarts:

```typescript
const frameworks: FrameworkItem[] = [
  { name: 'React', link: '/start/frameworks/react', icon: 'react' },
  { name: 'Next.js', link: '/start/frameworks/nextjs', icon: 'nextjs' },
  { name: 'Astro', link: '/start/frameworks/astro', icon: 'astro' },
  { name: 'Vue', link: '/start/frameworks/vue', icon: 'vue' },
  { name: 'Nuxt', link: '/start/frameworks/nuxt', icon: 'nuxt' },
  { name: 'Remix', link: '/start/frameworks/remix', icon: 'remix' },
  { name: 'SvelteKit', link: '/start/frameworks/sveltekit', icon: 'svelte' },
  { name: 'Hono', link: '/start/frameworks/hono', icon: 'hono' }
]
```

### Task 3: Start Macro-Area Content

1. **`docs/start/index.md` (Overview)**:
   - High-level value proposition: edge-native headless CMS on Cloudflare Workers, D1, and R2.
   - Quick installation snippet with `<PackageManagerTabs command="@beechcms/cms my-app" />`.
   - Architectural diagram (`/images/architecture-cloudflare.svg`).
   - Core concepts breakdown: Seeds (Blueprints), Branches (Fields), Fruits (Records).
   - Global AI Quickstart prompt using `<LlmPromptNode />`.
   - Onboarding pathways: First Project (5-minute tutorial) and Framework Quickstarts.

2. **`docs/start/first-project.md` (5-Minute Tutorial)**:
   - Extracted and streamlined from `docs/first-project.md`.
   - Step 1: Scaffolding with `npx @beechcms/cms my-app` and directory layout breakdown (`worker.ts`, `wrangler.jsonc`, `.dev.vars`).
   - Step 2: Database bootstrap with `npm run db:migrate:local` (or `npx beech init --db`) and dev server launch (`npm run dev`).
   - Step 3: Visual Seed Modeling in the Admin Dashboard: creating the `posts` seed with title, slug, cover image, and body branches.
   - Step 4: Staging vs Production: Explanation of Dual-Table Draft Staging and atomic publishing.
   - Step 5: Consuming Content with `@beechcms/client`: initializing `BeechClient` and querying `/api/content/posts`.
   - Step 6: Edge Deployment to Cloudflare with `npx beech deploy`.

3. **Framework Onboarding Nodes (`docs/start/frameworks/*.md`)**:
   Every framework guide MUST follow this standardized vertical template:
   - **Page Title & Subtitle**: e.g., `# Integrate BeechCMS with Next.js`.
   - **AI Assistant Prompt Block**: Rendered at the top of the guide:
     ```html
     <LlmPromptNode
       framework="<FrameworkName>"
       title="<FrameworkName> Integration Prompt"
       description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your <FrameworkName> integration code:"
     />
     ```
   - **Step 1: Install Official Client SDK**:
     ```html
     <PackageManagerTabs command="@beechcms/client" />
     ```
   - **Step 2: Initialize BeechClient**:
     TypeScript initialization snippet setting `baseURL` (e.g. `http://localhost:8789` or production URL) and optional token.
   - **Step 3: Fetching Content**:
     Typed content query fetching published entries from a Seed (e.g., `client.getEntries('posts')`).
   - **Step 4: Idiomatic Framework Rendering**:
     - **React (`react.md`)**: `useEffect` / custom hook pattern, state management, and JSX card list.
     - **Next.js (`nextjs.md`)**: Next.js 14/15 App Router Server Component, `fetch` caching / `revalidate` tags, and dynamic route with `generateStaticParams`.
     - **Astro (`astro.md`)**: Astro frontmatter fetch (`const { data } = await client.getEntries('posts')`) and zero-JS HTML template rendering.
     - **Vue (`vue.md`)**: Vue 3 Composition API (`<script setup lang="ts">`), `ref`, and `onMounted`.
     - **Nuxt (`nuxt.md`)**: Nuxt 3 `useAsyncData` / `$fetch` integration with SSR hydration.
     - **Remix (`remix.md`)**: Remix / React Router v7 `loader` function returning `json(entries)` and `useLoaderData`.
     - **SvelteKit (`sveltekit.md`)**: `+page.server.ts` load function with typed `PageServerLoad` and `+page.svelte` markup.
     - **Hono (`hono.md`)**: Edge worker middleware and route handler fetching from BeechCMS API and returning JSON / HTML responses.

### Task 4: Build Macro-Area Content

1. **`docs/build/index.md` (Build Overview)**:
   - Introduction to the BeechCMS build, modeling, and extension architecture.
   - Grid cards linking to:
     - `/build/schema-modeling`: Content Blueprints, Branches, and Database Evolution.
     - `/build/field-policies`: ALE Encryption, Blind Indexing, and Security Classification.
     - `/build/custom-widgets`: Custom Dashboard Controls via `@beechcms/widget-sdk`.
     - `/build/cli-workflows`: Scaffolding, Migrations, Typegen, and Verification.
     - `/build/vertical-slice-architecture`: Monorepo Feature Slicing & Engineering Standards.

2. **`docs/build/schema-modeling.md` (Schema Modeling & Evolution)**:
   - Core concepts: Seeds, Branches, Fruits.
   - Canonical D1 Database Authority: How schemas are persisted in the `seeds` D1 system table, with `seed_meta.registry_version` invalidation counter.
   - Complete Branch Types Reference table (10 types: text, number, boolean, date, file, relation, tags, repeater, richtext, json) with D1 storage representations and options.
   - Botanical Engine Compilation Pipeline: Dynamic table provisioning (`content_{slug}`), column additions, index generation, and FTS5 search tables.
   - The Additive Invariant: Why `PUT /api/seeds/:slug` rejects destructive mutations or inline alias renames with `422`.
   - Danger Zone Operations: Explicit safeguards for soft vs hard seed deletion (`DELETE /api/seeds/:slug/hard` requiring `{"confirm": "<slug>"}`), branch alias renames, branch retyping, and relational back-reference checks (`backrefMap`).

3. **`docs/build/field-policies.md` (Field Security & ALE Encryption)**:
   - Granular Branch policy definitions (8 policy properties: classification, privacy, visibility, public, publicEdit, filter, sort, search).
   - Application-Level Encryption (ALE): AES-256-GCM encryption at rest (`v1:<iv>:<ciphertext>`).
   - Blind Indexing: Generating deterministic HMAC-SHA256 search tokens in `<alias>_bidx` to enable fast B-tree indexed lookups on encrypted columns without decrypting database records.
   - Master key provisioning: Configuring `PRIVACY_MASTER_KEY` in `.dev.vars` (local) and via `npx wrangler secret put` (Cloudflare production).
   - Data Classification Tiers: `public`, `internal`, `confidential`, `restricted`, and API masking behavior (`••••••••`).

4. **`docs/build/custom-widgets.md` (Custom Widgets SDK)**:
   - Architecture of `@beechcms/widget-sdk` and iframe sandbox security.
   - Widget manifest specification (`widget.json` / `WidgetManifest`).
   - Bidirectional PostMessage communication protocol: `BEECH_INIT`, `BEECH_CHANGE`, `BEECH_RESIZE`.
   - Standard props passed to widgets: `value`, `schema`, `disabled`, `locale`, `theme`.
   - Step-by-step example: Authoring a custom Color Picker or Markdown component.

5. **`docs/build/cli-workflows.md` (Unified Developer CLI)**:
   - Scope separation: Monorepo Contributor vs Generated Consumer Project commands.
   - Command matrix:
     - Scaffolding & Setup: `npx @beechcms/cms`, `npx beech onboard`, `npx beech init --db`.
     - Database Management: `npx beech db:migrate`, `npx beech db:reset`, `npx beech reset`.
     - Code & Form Generation: `npx beech gen types typescript`, `npx beech forms`.
     - Cloudflare Edge Setup & Deploy: `npx beech setup:cloudflare`, `npx beech deploy`.
     - Health & Verification: `npx beech doctor`, `npx beech validate`.
     - Local Monorepo Dev: `npx beech dev`, `npx beech dev:stop`, `npx beech logs`.

6. **`docs/build/vertical-slice-architecture.md` (Vertical Slice Architecture)**:
   - Foundational architectural principles: High cohesion, low coupling, zero cross-slice imports.
   - Anatomy of an API Slice (`apps/api/src/features/<slice>/`):
     - Entry point (`index.ts`) registering Hono sub-app.
     - The Thin Handler Pattern: Handlers must not contain raw SQL/D1 queries; they orchestrate services and return RFC 9457 Problem Details or success responses.
     - Middleware & Interface Injection: Contracts defined in `@beechcms/core`, D1 persistence implemented in shared layers, and injected via `c.get(...)`.
   - Anatomy of a Dashboard Slice (`apps/dashboard/src/features/<slice>/`):
     - Public barrel rule: Only exports explicit UI components and hooks through `index.ts`.
     - Internal folder isolation (`components/`, `hooks/`, `types/`).
   - Anti-patterns to avoid: Direct database queries in handlers, synchronous side-effects, cross-slice internal imports.
   - Ponytail Architectural VETO checklist.

### Task 5: Legacy Route Pointers
Update pre-existing monolithic root files (`docs/first-project.md`, `docs/development.md`, `docs/vertical-slice.md`, `docs/custom-widgets.md`, `docs/guide.md`) with clear canonical callouts directing users to their new modular locations:
- `docs/first-project.md` -> Callout directing to `/start/first-project`.
- `docs/vertical-slice.md` -> Callout directing to `/build/vertical-slice-architecture`.
- `docs/custom-widgets.md` -> Callout directing to `/build/custom-widgets`.
- `docs/development.md` -> Callouts directing to `/build/cli-workflows` and `/build/vertical-slice-architecture`.
- `docs/guide.md` -> Navigation index pointing to `/start/` and `/build/` sub-modules.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
Validation must be executed using the unified CLI and workspace build tools:

```bash
# 1. Verify workspace package dependencies
pnpm install

# 2. Build the documentation site and verify zero broken links or SSR errors
pnpm exec vitepress build docs

# 3. Update the knowledge graph to reflect newly structured files
graphify update .
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `docs/.vitepress/config.mts` implements structured multi-group sidebars for both `'/start/'` and `'/build/'`.
- [ ] `FrameworkGrid.vue` contains working links for all 8 frameworks pointing to `/start/frameworks/<name>`.
- [ ] `docs/start/index.md` and `docs/start/first-project.md` are populated, fully formatted, and pass VitePress compilation.
- [ ] All 8 framework guides exist under `docs/start/frameworks/` (`react.md`, `nextjs.md`, `astro.md`, `vue.md`, `nuxt.md`, `remix.md`, `sveltekit.md`, `hono.md`), each including an AI assistant `<LlmPromptNode>` and SDK `<PackageManagerTabs>`.
- [ ] All 6 build modules exist under `docs/build/` (`index.md`, `schema-modeling.md`, `field-policies.md`, `custom-widgets.md`, `cli-workflows.md`, `vertical-slice-architecture.md`).
- [ ] Pre-existing root documentation files (`first-project.md`, `development.md`, `vertical-slice.md`, `custom-widgets.md`, `guide.md`) have canonical redirect notices preventing broken links.
- [ ] `pnpm exec vitepress build docs` completes with zero errors and zero unhandled dead links.
- [ ] Zero files outside `docs/` are modified (no changes to `@beechcms/core`, `apps/api`, or `apps/dashboard`).
- [ ] `Pre-Computation Analysis` and `VETO Audit` are explicitly present at the top of the plan.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Dismantling or reorganizing the `docs/api-reference.md` monolith (Strictly reserved for Sprint 3: `docs-reference-vertical-slicing` per ROADMAP.md).
- Migrating content for the Features, Manage, and Resources macro-areas (Reserved for Sprint 4: `docs-features-manage-resources` per ROADMAP.md).
- Any modification to `@beechcms/core`, `apps/api`, or `apps/dashboard` runtime code.
- Implementing dynamic browser code execution, client-side SQLite REPLs, or live playground runners.
