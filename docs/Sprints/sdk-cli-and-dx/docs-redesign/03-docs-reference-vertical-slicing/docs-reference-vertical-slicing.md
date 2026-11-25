# Sprint Plan: docs-reference-vertical-slicing

### Pre-Computation Analysis
a) **God Nodes:**
   - `docs/api-reference.md`: Massive 65KB REST API monolith acting as a God Node for all technical contracts, security details, endpoints, widget APIs, and error models.
   - `docs/.vitepress/config.mts`: Central orchestrator for VitePress routing and sidebar navigation.
b) **Architectural Boundaries Affected:**
   - No runtime code in `@beechcms/core`, `apps/api`, or `apps/dashboard` is affected.
   - Modifications are strictly contained within `docs/reference/**` and `docs/.vitepress/config.mts`.
   - Legacy files (`docs/api-reference.md`) will receive redirection notices and be hollowed out.
c) **Impact Analysis (`graphify affected`):**
   - `graphify affected "vitepress" --depth 2` output: `vitepress [imports] package.json:L96`.
   - No direct runtime dependencies exist between the documentation layer and core application modules. Zero risk of breaking D1 schemas or API responses.

### VETO Audit
- **Botanical Dialect:** Validated. No SQLite or D1 queries bypass the core because no database queries are created or executed. This is purely a documentation refactoring.
- **Vertical Slice Architecture:** Validated. The monolithic API reference is being dismantled into isolated, cohesive documentation slices (e.g., Security, Auth, Content API, Media) inside `docs/reference/`. No cross-slice runtime dependencies are introduced.
- **YAGNI & Cloudflare Purity:** Validated. Follows strict static VitePress principles. No runtime environments, interactive terminals, or heavy generation tools are added.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
Following the completion of Sprint 2 (`docs-start-and-build-migration`), the BeechCMS documentation site has successfully populated the Start and Build macro-areas with targeted onboarding flows. However, the core technical documentation still relies on `api-reference.md`, a monolithic 65KB file spanning over 2,000 lines. 

This monolith violates the principles of modular vertical slicing, making it exceedingly difficult for frontend and backend developers to pinpoint specific API contracts or security details without scrolling through unrelated topics. This sprint dismantles the monolith into focused, isolated documentation slices within the `Reference` macro-area, enabling faster lookups, cleaner maintenance, and seamless deep-linking. By executing this immediately after Sprint 2, we finalize the structural migration of the documentation architecture before introducing new feature documentation in subsequent sprints.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- `docs/.vitepress/config.mts` defines the `/reference/` sidebar as a single stub: `[ { text: 'Reference', items: [ { text: 'API Reference', link: '/reference/' } ] } ]`.
- `docs/reference/index.md` is a stub file (~600 bytes).
- `docs/api-reference.md` is a monolithic file (2001 lines, 65KB) containing 12 major sections (Security Stack, Auth Endpoints, Internal Content API, Media Engine, Public API, Error Model, Widget API, Automations API, Seed Builder API, Architecture, Dashboard Layout API).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
- `docs/.vitepress/config.mts`: Updated with a granular, grouped sidebar for the `/reference/` section.
- `docs/reference/index.md`: An organized hub page for the Reference macro-area.
- `docs/reference/security-stack.md`: Extracted documentation for JWT Auth and ALE.
- `docs/reference/auth-endpoints.md`: Extracted documentation for `/api/auth/*`.
- `docs/reference/internal-content.md`: Extracted documentation for internal content APIs.
- `docs/reference/media-engine.md`: Extracted documentation for the media and proxy endpoints.
- `docs/reference/public-api.md`: Extracted documentation for external API-key gated endpoints.
- `docs/reference/error-model.md`: Extracted RFC 7807 problem details and codes.
- `docs/reference/widget-api.md`: Extracted documentation for widget integrations.
- `docs/reference/automations-api.md`: Extracted webhook and trigger documentation.
- `docs/reference/seed-builder.md`: Extracted schema mutation and D1 table provisioning documentation.
- `docs/reference/architecture.md`: Extracted deep technical architecture details.
- `docs/reference/dashboard-layout.md`: Extracted layout configuration contracts.
- `docs/api-reference.md`: Updated to serve as a redirection stub with a prominent `> [!WARNING]` banner pointing to the new `docs/reference/` slices.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
1. **Dismantle the Monolith**:
   Extract content from `docs/api-reference.md` and create the following independent files in `docs/reference/`:
   - `security-stack.md` (from "2. Security Stack")
   - `auth-endpoints.md` (from "3. Auth Endpoints")
   - `internal-content.md` (from "4. Internal Content API")
   - `media-engine.md` (from "5. Media Engine")
   - `public-api.md` (from "6. Public API")
   - `error-model.md` (from "7. Error Model")
   - `widget-api.md` (from "8. Widget API")
   - `automations-api.md` (from "10. Automations API")
   - `seed-builder.md` (from "10. Seed Builder & Schema Mutation API")
   - `architecture.md` (from "11. Technical Architecture (v0.4.0 Refactor)")
   - `dashboard-layout.md` (from "12. Dashboard Layout API")

2. **Update VitePress Config**:
   Modify `docs/.vitepress/config.mts` to replace the stub `/reference/` sidebar with:
   ```typescript
      '/reference/': [
        {
          text: 'Core Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'Security Stack', link: '/reference/security-stack' },
            { text: 'Error Model', link: '/reference/error-model' },
            { text: 'Architecture', link: '/reference/architecture' }
          ]
        },
        {
          text: 'API Endpoints',
          items: [
            { text: 'Auth Endpoints', link: '/reference/auth-endpoints' },
            { text: 'Internal Content', link: '/reference/internal-content' },
            { text: 'Public API', link: '/reference/public-api' },
            { text: 'Media Engine', link: '/reference/media-engine' },
            { text: 'Seed Builder', link: '/reference/seed-builder' }
          ]
        },
        {
          text: 'Extensions',
          items: [
            { text: 'Widget API', link: '/reference/widget-api' },
            { text: 'Automations', link: '/reference/automations-api' },
            { text: 'Dashboard Layout', link: '/reference/dashboard-layout' }
          ]
        }
      ],
   ```

3. **Establish Redirections**:
   Replace the content of `docs/api-reference.md` with a legacy redirection notice:
   ```markdown
   ---
   title: Core API Reference (Deprecated)
   ---

   # API Reference (Moved)

   > [!WARNING]
   > **Documentation Restructured**:
   > The monolithic API Reference has been dismantled into isolated vertical slices. 
   > Please navigate to the **[Reference Hub](/reference/)** to find specific technical contracts for Auth, Content, Media, and Extensions.
   ```
   (Ensure you completely empty out the remaining 2,000 lines of the old file).

4. **Populate the Reference Hub**:
   Update `docs/reference/index.md` to be a functional landing page providing a modular overview or links to the newly created vertical slices.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
`pnpm exec vitepress build docs`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `docs/api-reference.md` is hollowed out and contains a clear migration banner.
- [ ] 11 new granular markdown files exist inside `docs/reference/`, corresponding to the old monolithic sections.
- [ ] `docs/.vitepress/config.mts` defines a structured, multi-group sidebar for `/reference/`.
- [ ] `docs/reference/index.md` serves as a comprehensive hub page for all reference documentation.
- [ ] `pnpm exec vitepress build docs` completes with zero errors and zero broken links.
- [ ] No changes are made to application source code (`@beechcms/core`, `apps/api`, `apps/dashboard`).
- [ ] `Pre-Computation Analysis` and `VETO Audit` are explicitly present at the top of this plan.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Writing new API documentation or altering existing technical contracts. This is strictly a structural extraction.
- Reorganizing the `Features`, `Manage`, or `Resources` macro-areas (reserved for Sprint 4).
- Modifying UI components in `docs/.vitepress/theme/`.
- Changes to any `.ts` or `.tsx` files outside of `docs/`.
