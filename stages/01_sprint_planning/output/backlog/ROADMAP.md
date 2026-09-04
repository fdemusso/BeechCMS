# Roadmap: Documentation UX Rework & Vertical Slicing

Multi-sprint roadmap for the complete redesign of BeechCMS documentation, introducing a 6-area information architecture, contextual sidebars, and custom VitePress components for framework onboarding and package manager persistence.

---

### Sprint 1: `docs-infrastructure-and-theme` [CURRENT]
- **Goal:** Reconfigure the VitePress information architecture (6 macro-areas) and develop the base visual components (Code Viewer with persistent preferences, Framework Hub grid) without massive content migration yet.
- **Status:** READY FOR EXECUTION.
- **Deliverables:**
  - `docs/.vitepress/config.mts`: New configuration with 6 `nav` items (Start, Features, Build, Manage, Reference, Resources) and contextual `sidebar` logic for each path.
  - `docs/.vitepress/theme/`: Vue components for `PackageManagerTabs` (with `localStorage`), `FrameworkGrid`, and `LlmPromptNode`.
  - `docs/index.md`: New modular grid main page.
- **Dependency:** None.

---

### Sprint 2: `docs-start-and-build-migration` [PENDING]
- **Goal:** Populate the Start and Build macro-areas by fragmenting and reorganizing the existing guides (First Project, Client SDK, Forms SDK, Development) and integrating the framework nodes and LLM prompts.
- **Status:** PENDING.
- **Dependency:** Depends on `docs-infrastructure-and-theme` (Sprint 1).

---

### Sprint 3: `docs-reference-vertical-slicing` [PENDING]
- **Goal:** Dismantle the `api-reference.md` monolith and core documentation, splitting them into isolated vertical slices within the Reference macro-area, and set up legacy redirection rules.
- **Status:** PENDING.
- **Dependency:** Depends on `docs-infrastructure-and-theme` (Sprint 1).
