# 1. Feature Definition and Core Value
The system currently relies on hardcoded heuristics (e.g., `isGalleryBranch`) to determine which views (Table, Gallery, Kanban) are available for a Seed. This causes poor UX (e.g., empty galleries are forced upon users) and prevents explicit control over UI presentation. This feature introduces an explicit, dynamic View Configuration system, giving admins absolute control over which views are authorized for a given seed directly from the interface, while removing implicit assumptions.

# 2. Domain Boundaries and Business Rules
- **Configuration Boundary:** Following the `SYSTEM_MAP.md` directives, the authorized views belong to the "dashboard-specific UI config" and MUST be stored within the `dashboard` field of the `Seed` schema definition (e.g., `DashboardSeedConfig`), not in external layout tables.
- **Architectural Boundary (VSA):** The frontend must adopt a `ViewRegistry` (similar to the existing `FieldRegistry`). Vertical slices like `features/content-gallery` or `features/content-kanban` must register themselves to this registry. Cross-feature imports to resolve views are strictly prohibited.
- **Fallback Rule:** The "table" view is the universal fallback because seeds are backed by relational D1 tables. If a user unchecks all views or accesses an unauthorized view URL, the system must fallback to the table view.

# 3. Primary Requirements (User Stories)
* AS A System Admin I WANT to explicitly select the authorized views (Table, Gallery, Kanban) during Seed creation/editing SO THAT I can prevent irrelevant views from cluttering the content manager's interface.
* AS A Content Manager I WANT to see only the views configured for the specific seed I am navigating SO THAT I have an optimized and context-appropriate workspace.

# 4. Secondary Requirements and Logical Constraints
- **Heuristics Removal:** All existing implicit logic to determine view availability (like checking for multiple asset-list files to enable Gallery) must be entirely removed.
- **Strict Fallback / URL Protection:** If an unauthorized view is accessed directly via URL (e.g., `?view=kanban` when only `table` is enabled), the system must intercept the request and securely fallback to rendering the `table` view without breaking.
- **Registry Initialization:** The frontend ViewRegistry must be populated at startup by the respective feature slices before the dashboard routes mount, complying with VSA.
- **Backward Compatibility:** Existing seeds without explicit `dashboard.views` configured should gracefully default to `['table']` (or a migration must automatically set it to maintain their current state).

# 5. Out of Scope (Discarded during sparring)
- **Database Schema View Abstraction:** We will not abstract views into the core `Seed` backend validation logic; they remain strictly a dashboard UI configuration (`DashboardSeedConfig`) to prevent coupling the public headless API with dashboard-specific rendering concerns.
- **Complex View-Specific Layouts in Seed:** The configuration of the views themselves (e.g., which fields go where in a Kanban card) remains in separate layout tables (`SeedViewConfig`), keeping the main `Seed` schema lightweight. Only the *authorization* of the view moves to the Seed schema.
