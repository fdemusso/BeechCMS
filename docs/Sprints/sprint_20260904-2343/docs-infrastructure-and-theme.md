# Sprint: docs-infrastructure-and-theme

### Pre-Computation Analysis
a) **God Nodes:** VitePress configuration (`docs/.vitepress/config.mts`) is the central orchestrator for the navigation and sidebars. `api-reference.md` is a monolithic file (65KB) acting as a god node for documentation, which will be dismantled in Sprint 3.
b) **Architectural Boundaries Affected:** None in `@beechcms/core`, `apps/api`, or `apps/dashboard`. The scope is strictly isolated to the static generation environment in the `docs/` directory.
c) **Impact Analysis:** `graphify affected "vitepress"` reveals only `package.json` is affected. No breaking changes are introduced to the CMS runtime or edge workers.

### VETO Audit
- **Botanical Dialect:** Validated. This sprint involves zero interactions with SQLite or D1. No queries bypass `@beechcms/core` because no queries are made.
- **Vertical Slice Architecture:** Validated. The `docs/` directory operates independently from the application code. Component additions inside `docs/.vitepress/theme/` do not create cross-imports with `apps/api` or `apps/dashboard`.
- **YAGNI & Cloudflare Purity:** Validated. The documentation remains a statically generated VitePress site. We strictly adhere to "Separazione tra Contenuto e Presentazione" and "Assoluta Staticità" as mandated in the feature brief. No interactive environments are introduced.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint establishes the foundational Information Architecture and presentation layer for the documentation redesign without getting bogged down in massive content migration. Before splitting the monolithic `api-reference.md` or rewriting guides, the VitePress engine must be configured to support the 6 isolated macro-areas (Start, Features, Build, Manage, Reference, Resources) via a contextual sidebar system. Additionally, the custom VitePress theme components (Package Manager tabs with local storage persistence, modular Framework Grid, and LLM Prompt Nodes) must be built and tested. Adhering to YAGNI, we build the structure first so that subsequent content sprints have the correct slots and components to drop markdown files into.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- The VitePress configuration (`docs/.vitepress/config.mts`) currently uses a single global sidebar `'/': [ ... ]` structure with a linear list of topics.
- The `docs/.vitepress/theme/index.ts` is minimal (109 bytes) and `custom.css` (13KB) contains global styling.
- Navigation (`nav` array) only contains "Guide" and "API".
- There is no custom Vue component for persisting package manager preferences or displaying LLM prompts.
- All documentation is treated as a flat hierarchy without contextual isolation.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `docs/.vitepress/config.mts`: Rewritten to define the 6 new `nav` items and a multi-path `sidebar` object that scopes sidebars contextually to each macro-area.
- `docs/.vitepress/theme/components/PackageManagerTabs.vue`: A new custom Vue component for displaying code blocks with persistent package manager selection (`npm`, `pnpm`, `yarn`, `bun`) saved in browser `localStorage` (with fallback for no-storage).
- `docs/.vitepress/theme/components/FrameworkGrid.vue`: A visual grid component for the homepage, guiding users to specific framework integrations.
- `docs/.vitepress/theme/components/LlmPromptNode.vue`: A component that displays a pre-filled LLM prompt block with copy functionality and permanent references to BeechCMS URLs.
- `docs/.vitepress/theme/index.ts`: Updated to register the new Vue components globally.
- `docs/index.md`: Refactored to act as the modular Main Hub landing page using the new `FrameworkGrid`.
- Scaffolded landing pages for the macro-areas (`docs/start/index.md`, `docs/features/index.md`, `docs/build/index.md`, `docs/manage/index.md`, `docs/reference/index.md`, `docs/resources/index.md`) to ensure the contextual sidebars render correctly.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
**Task 1: VitePress Configuration (`docs/.vitepress/config.mts`)**
- Replace the `nav` array with 6 items:
  - `{ text: 'Start', link: '/start/' }`
  - `{ text: 'Features', link: '/features/' }`
  - `{ text: 'Build', link: '/build/' }`
  - `{ text: 'Manage', link: '/manage/' }`
  - `{ text: 'Reference', link: '/reference/' }`
  - `{ text: 'Resources', link: '/resources/' }`
- Replace the global `sidebar: { '/': [...] }` with contextual sidebars:
  - `'/start/': [ { text: 'Start', items: [ { text: 'Introduction', link: '/start/' } ] } ]`
  - `'/features/': [ { text: 'Features', items: [ { text: 'Overview', link: '/features/' } ] } ]`
  - `'/build/': [ { text: 'Build', items: [ { text: 'Integration', link: '/build/' } ] } ]`
  - `'/manage/': [ { text: 'Manage', items: [ { text: 'Management', link: '/manage/' } ] } ]`
  - `'/reference/': [ { text: 'Reference', items: [ { text: 'API Reference', link: '/reference/' } ] } ]`
  - `'/resources/': [ { text: 'Resources', items: [ { text: 'Assets', link: '/resources/' } ] } ]`
- Ensure that the entire VitePress site (all `text` and `lang` configuration options) is explicitly set to English.

**Task 2: Theme Registration (`docs/.vitepress/theme/index.ts`)**
- Import `PackageManagerTabs`, `FrameworkGrid`, and `LlmPromptNode`.
- In the `enhanceApp({ app })` block, register them using `app.component('PackageManagerTabs', PackageManagerTabs)`, `app.component('FrameworkGrid', FrameworkGrid)`, and `app.component('LlmPromptNode', LlmPromptNode)`.

**Task 3: Custom Vue Components**
- **PackageManagerTabs.vue**: Create a tabbed interface. On mount, read `beechcms_pkg_mgr` from `localStorage` within a `try/catch` to gracefully handle restrictive storage permissions. Render slots for each package manager and only show the active one. Sync changes to `localStorage` deterministically.
- **FrameworkGrid.vue**: Render a CSS grid layout applying BeechCMS branding/colors. Ensure responsive fluid transition to single-column on mobile screens.
- **LlmPromptNode.vue**: Display a formatted text block intended for AI coding assistants. Include a one-click copy button and inject the absolute documentation URL dynamically.

**Task 4: Scaffold Main Hub and Sections**
- `docs/index.md`: Remove monolithic text. Insert the `<FrameworkGrid />` component. Direct users to the 6 macro areas.
- Create simple markdown files for `/start/index.md`, `/features/index.md`, `/build/index.md`, `/manage/index.md`, `/reference/index.md`, `/resources/index.md` with an `# H1` and basic intro text to test the router and sidebars.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
```bash
# 1. Install dependencies just in case
pnpm install

# 2. Start the VitePress build process (dry run to check config syntax)
pnpm --filter @beechcms/docs exec vitepress build docs
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `config.mts` successfully implements the 6 macro-areas in the top navigation.
- [ ] Contextual sidebars correctly isolate navigation (e.g., visiting `/start/` only shows the Start sidebar).
- [ ] `PackageManagerTabs` successfully switches between package managers and persists the state in `localStorage` without breaking in strict/incognito mode.
- [ ] The Main Hub (`docs/index.md`) contains the modular Framework Grid and direct pathways.
- [ ] `pnpm --filter @beechcms/docs exec vitepress build docs` builds successfully without structural errors.
- [ ] No changes are made outside the `docs/` workspace.
- [ ] `Pre-Computation Analysis` and `VETO Audit` are present in the plan.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Migrating or splitting the massive `api-reference.md` (This belongs to Sprint 3: `docs-reference-vertical-slicing`).
- Rewriting the content of existing guides to fit the vertical slice methodology (This belongs to Sprint 2: `docs-start-and-build-migration`).
- Any modification to `@beechcms/core`, `apps/api`, or `apps/dashboard`.
- Implementing dynamic APIs or interactive backend runners inside the documentation.
