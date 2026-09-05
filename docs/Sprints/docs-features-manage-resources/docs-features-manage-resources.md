### Pre-Computation Analysis
a) **"God Nodes" identified**: `Documentation` (Conceptual boundary in `docs/`). No TypeScript god nodes are affected since this sprint targets static Markdown files in the VitePress workspace.
b) **Architectural boundaries affected**: None across `@beechcms/core`, `apps/api`, or `apps/dashboard`. This sprint is strictly bounded to the documentation frontend (`docs/` directory).
c) **`graphify affected` impact analysis**: Modifying Markdown files in `docs/` generates zero impact on the TypeScript compiler, test pipelines, or Edge deployment. No breaking changes detected.

### VETO Audit
The proposed sprint architecture targets the `docs/` workspace without altering business logic or runtime systems.
- **YAGNI Check**: The redesign is strictly required to finalize the roadmap defined in the feature brief.
- **Botanical Dialect**: No D1 queries or core systems are modified.
- **Vertical Slice Architecture**: No cross-imports are introduced. The documentation is isolated by macro-areas (Features, Manage, Resources) respecting domain separation without polluting the API or Engine.
APPROVED. HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This is the final sprint in the documentation redesign roadmap. It exists to populate the remaining three macro-areas (Features, Manage, and Resources) by migrating and organizing deep dives into automations, media delivery, dashboard editor, and internal architecture. This ensures the documentation architecture is fully aligned with the 6-area information model defined in the feature brief, completing the separation of concerns without coupling documentation to the core engine.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
The VitePress configuration (`docs/.vitepress/config.mts`) is already set up with the 6 macro-areas (Start, Features, Build, Manage, Reference, Resources). `Start`, `Build`, and `Reference` are populated with vertical slices. The `Features`, `Manage`, and `Resources` areas contain only placeholder directories or basic overviews. Legacy documentation files like `automations.md`, `email-module.md`, `observability-and-notifications.md`, `content-editor-guide.md`, `forms-sdk.md`, and `search-sdk.md` still reside in the root of `docs/` and need to be sliced into the new structure.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `docs/features/`: Populated with vertical slices for Automations, Media Delivery, Email Module, Search, Forms, and Observability.
- `docs/manage/`: Populated with guides for Dashboard Editor, Content Management, and Environment Configuration.
- `docs/resources/`: Populated with Community Assets, UI Kits, and Integration Examples.
- `docs/.vitepress/config.mts`: Updated sidebar configuration for the `/features/`, `/manage/`, and `/resources/` routes to point to the newly created vertical slices.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
1. **Features Slicing**:
   - Move/refactor `docs/automations.md` to `docs/features/automations.md`.
   - Move/refactor `docs/email-module.md` to `docs/features/email-module.md`.
   - Move/refactor `docs/observability-and-notifications.md` to `docs/features/observability.md`.
   - Move/refactor `docs/search-sdk.md` to `docs/features/search.md`.
   - Move/refactor `docs/forms-sdk.md` to `docs/features/forms.md`.

2. **Manage Slicing**:
   - Move/refactor `docs/content-editor-guide.md` to `docs/manage/content-editor.md`.
   - Ensure a `docs/manage/environments.md` file exists or is created to explain AppEnv and variables management.

3. **Resources Slicing**:
   - Ensure `docs/resources/` contains entry points for assets, UI Kits, and external tools (e.g. `docs/resources/community-assets.md`).

4. **VitePress Configuration (`docs/.vitepress/config.mts`)**:
   - Update sidebar entries for `/features/`, `/manage/`, and `/resources/`.
     ```typescript
     // Sidebar configuration to add/update:
     '/features/': [
       {
         text: 'Core Features',
         items: [
           { text: 'Overview', link: '/features/' },
           { text: 'Automations', link: '/features/automations' },
           { text: 'Email Module', link: '/features/email-module' },
           { text: 'Observability', link: '/features/observability' },
           { text: 'Search', link: '/features/search' },
           { text: 'Forms', link: '/features/forms' }
         ]
       }
     ],
     '/manage/': [
       {
         text: 'Management',
         items: [
           { text: 'Overview', link: '/manage/' },
           { text: 'Content Editor', link: '/manage/content-editor' },
           { text: 'Environments', link: '/manage/environments' }
         ]
       }
     ],
     '/resources/': [
       {
         text: 'Resources',
         items: [
           { text: 'Overview', link: '/resources/' },
           { text: 'Community Assets', link: '/resources/community-assets' }
         ]
       }
     ]
     ```

5. **Cleanup**:
   - Remove the old root-level Markdown files (`docs/automations.md`, `docs/email-module.md`, etc.) once migrated to prevent duplication.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
- `pnpm run docs:build` (in the root directory) to verify VitePress static generation completes with zero dead links.
- `pnpm run docs:preview` (in the root directory) to manually verify the sidebar rendering and content paths for the Features, Manage, and Resources sections.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] All legacy feature markdown files (`automations.md`, `email-module.md`, `observability-and-notifications.md`, `search-sdk.md`, `forms-sdk.md`, `content-editor-guide.md`) are migrated from `docs/` into `docs/features/` or `docs/manage/`.
- [ ] The VitePress sidebar config (`config.mts`) correctly registers all the new paths without 404s.
- [ ] The build command `pnpm run docs:build` completes successfully with zero dead links.
- [ ] No application source code (`@beechcms/core`, `apps/api`, `apps/dashboard`) is modified.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Modifying the VitePress theme or custom Vue components (completed in Sprint 1).
- Modifying the Start, Build, or Reference macro-areas (completed in Sprints 2 and 3).
- Any TypeScript code changes, API implementations, or dashboard React modifications.
