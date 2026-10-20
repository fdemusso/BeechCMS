# Roadmap: Documentation UX Rework & Vertical Slicing

Multi-sprint roadmap for the complete redesign of BeechCMS documentation, introducing a 6-area information architecture, contextual sidebars, and custom VitePress components for framework onboarding and package manager persistence.

---

### Sprint 1: `docs-infrastructure-and-theme` [COMPLETED]
- **Goal:** Reconfigure the VitePress information architecture (6 macro-areas) and develop the base visual components (Code Viewer with persistent preferences, Framework Hub grid) without massive content migration yet.
- **Status:** COMPLETED (Archived in `docs/Sprints/sprint_20260904-2343/`).
- **Deliverables:**
  - `docs/.vitepress/config.mts`: New configuration with 6 `nav` items (Start, Features, Build, Manage, Reference, Resources) and contextual `sidebar` logic for each path.
  - `docs/.vitepress/theme/`: Vue components for `PackageManagerTabs` (with `localStorage`), `FrameworkGrid`, and `LlmPromptNode`.
  - `docs/index.md`: New modular grid main page.
- **Dependency:** None.

---

### Sprint 2: `docs-start-and-build-migration` [COMPLETED]
- **Goal:** Populate the Start and Build macro-areas by fragmenting and reorganizing the existing guides (First Project, Client SDK, Forms SDK, Development) and integrating the framework nodes and LLM prompts.
- **Status:** READY FOR EXECUTION.
- **Deliverables:**
  - `docs/start/`: Overview, 5-minute First Project tutorial, and 8 dedicated framework onboarding nodes with LLM prompts (React, Next.js, Astro, Vue, Nuxt, Remix, SvelteKit, Hono).
  - `docs/build/`: Overview, Schema Modeling, Field Policies & Encryption, Custom Widgets, CLI Workflows, and Vertical Slice Architecture.
  - `docs/.vitepress/config.mts`: Deep contextual sidebar configuration for `/start/` and `/build/`.
  - `docs/.vitepress/theme/components/FrameworkGrid.vue`: Connected links to `/start/frameworks/<framework>`.
- **Dependency:** Depends on `docs-infrastructure-and-theme` (Sprint 1).

---

### Sprint 3: `docs-reference-vertical-slicing` []
- **Goal:** Dismantle the `api-reference.md` monolith and core documentation, splitting them into isolated vertical slices within the Reference macro-area, and set up legacy redirection rules.
- **Status:** COMPLETED.
- **Dependency:** Depends on `docs-start-and-build-migration` (Sprint 2).

---

### Sprint 4: `docs-features-manage-resources` [PENDING]
- **Goal:** Populate the Features, Manage, and Resources macro-areas by organizing deep dives into Botanical compiler, media delivery, automations, dashboard editor, and internal architecture.
- **Status:** READY FOR EXECUTION.
- **Dependency:** Depends on `docs-reference-vertical-slicing` (Sprint 3).
