# 1. Feature Definition and Core Value

`@beechcms/mcp` currently exposes only *tools* (schema inspect/validate/plan/apply). It has no way to hand an AI agent BeechCMS's own conceptual knowledge — architecture, field policies, widget API, feature semantics. Agents are left guessing domain rules from tool output alone, producing schema proposals that are syntactically valid but semantically wrong (e.g. ignoring ALE policy constraints, misusing widget contracts).

The feature adds an **MCP Resources** surface to `@beechcms/mcp`: a curated, static snapshot of BeechCMS's consumer-facing documentation and generated API reference (typedoc), shipped inside the npm package itself, so any agent connected to the server can read authoritative docs before acting — without needing local repo access, network calls, or a live docs site.

Indispensable because: `@beechcms/mcp` is installed standalone via npm/pnpm into arbitrary consumer projects (never inside the BeechCMS monorepo). Today those installs have zero way to consult BeechCMS documentation — the agent's only knowledge is pretraining cutoff + tool schemas. This is the only mechanism to close that gap without depending on external fetches or repo paths that won't exist at install time.

# 2. Domain Boundaries and Business Rules

**Entities:**
- **Doc Source** — the `/docs` markdown tree in the BeechCMS monorepo (author-maintained, source of truth).
- **Typedoc Source** — generated API reference from project TypeScript, produced by `typedoc.json` at build time.
- **Resource Bundle** — a static, versioned snapshot (curated docs subset + pregenerated typedoc output) packaged inside `packages/mcp` at publish time.
- **MCP Resource Registry** — the list `@beechcms/mcp` exposes over the MCP resources protocol (URI, title, one-line description per entry).
- **MCP Client / Agent** — the consumer (Claude Desktop, Cursor, etc.) that lists and selectively reads resources.

**Rules:**
- The MCP server MUST NOT read `/docs` or typedoc output from the filesystem of the project it's installed into. It has zero guarantee such a path exists (standalone install, non-monorepo context). All resource content is bundled into the `@beechcms/mcp` package at publish time.
- The Resource Bundle is a **build-time artifact**, not runtime-generated. Typedoc is pregenerated and committed/bundled alongside the doc subset; there is no on-demand typedoc trigger inside the running MCP server.
- Resource selection is a **static allowlist** curated at build time (see subset below), not a runtime filter. Internal-only docs (monorepo-contributor guides, branding/starter-kit pages) are excluded at build time and never enter the bundle.
- No retrieval infrastructure (embeddings, vector index, precomputed similarity matrix) is in scope. The MCP resources list carries titles + one-line descriptions; the agent selects and reads full files itself. This is a deliberate YAGNI decision — corpus is small (~25 files, few hundred KB) and doesn't justify embedding-pipeline complexity or index-staleness risk.
- The Resource Bundle is versioned/refreshed only on `@beechcms/mcp` package publish. It has no live-update mechanism and can go stale relative to the monorepo's current `/docs` between releases — accepted tradeoff, not a defect to solve here.
- This feature adds **read-only resources**, strictly additive to the existing tool surface (`beech_list_seeds`, `beech_schema_plan`, etc.). It does not modify tool behavior, auth model, or the OCC/additive-safety invariants documented in `reference/mcp-server.md`.

# 3. Primary Requirements (User Stories)

* AS A developer using an AI coding assistant connected to `@beechcms/mcp` I WANT the assistant to read BeechCMS's own architecture, field-policy, and widget-API documentation as MCP resources SO THAT it proposes schema changes and code that respect BeechCMS's actual domain rules instead of guessing from tool output alone.

* AS A developer using an AI coding assistant I WANT the assistant to read pregenerated TypeDoc API reference as an MCP resource SO THAT it gets accurate type signatures for `@beechcms/core`, `@beechcms/client`, and other packages without needing local source access.

* AS AN MCP client (agent) I WANT a resource list with clear titles and one-line descriptions SO THAT I can select the relevant doc myself without fetching the entire corpus into context.

* AS A BeechCMS maintainer I WANT the resource bundle built and curated at package-publish time, sourced entirely from files packaged with `@beechcms/mcp` SO THAT the server works identically whether installed inside the monorepo or standalone in an arbitrary consumer project.

# 4. Secondary Requirements and Logical Constraints

- **Build-time curation list (final, locked during sparring):** include `docs/api/`, `docs/build/`, `docs/features/`, `docs/manage/`, `docs/reference/` (all `.md`), plus `docs/start/first-project.md` only.
- **Explicitly excluded and why:**
  - `docs/resources/architecture.md`, `docs/resources/development.md` — tagged `group: Developer Guide (Internals)`, written for monorepo contributors, explicitly redirect consumers elsewhere.
  - `docs/resources/community-assets.md` and `docs/resources/index.md` — branding/starter-kit links, no technical consulting value; with the two internals files gone, `resources/` is dropped entirely.
  - `docs/start/mcp.md` — MCP install/setup tutorial; an agent already running inside a configured MCP session has no use for its own installation instructions.
  - `docs/start/frameworks/*` — per-framework scaffolding snippets (astro/vue/nextjs/etc.), installer-specific, no domain/architecture value.
  - `docs/ci/` — GitHub Actions YAML, not documentation content.
  - `docs/examples/` — example package source (package.json/tsconfig), not documentation content.
  - `docs/public/` — binary image assets (svg/png), not consultable text.
  - `docs/personal/` — dated internal dev notes, not user-facing.
  - `docs/Sprints/` — internal planning artifacts.
- **Naming ambiguity resolved:** `reference/internal-content.md` is *kept* despite its name — it documents the authenticated admin Content API (a legitimate reference doc), not monorepo-internal engineering; distinct from the "Developer Guide (Internals)" tagged group which is excluded.
- **Mixed-content file resolved:** `build/cli-workflows.md` contains both consumer and monorepo-contributor sections; kept in full since consumer content is the majority and file isn't tagged internals-only.
- **Typedoc pregeneration:** run at `@beechcms/mcp` build/publish step (not at server runtime, not by the running MCP process), output bundled as static files alongside the doc subset.
- **Staleness is accepted:** bundle reflects docs/typedoc as of the last `@beechcms/mcp` publish; no live sync, no runtime regeneration, no cache-busting mechanism required for v1.
- **No new auth/permission surface:** resources are static and read-only; they carry no admin-gated content, so they don't need to sit behind the existing OAuth/JWT flow used by tools.

# 5. Out of Scope (Discarded during sparring)

- **Vector search / embeddings / precomputed similarity matrix for retrieval** — discarded as premature optimization. Corpus is ~25 files / a few hundred KB; MCP's native resource list (title + description) already lets the client select relevant files without an embedding pipeline, index-staleness risk, or extra runtime dependency.
- **Runtime/on-demand typedoc generation inside the MCP server** — discarded; typedoc is pregenerated at build time only, since the server must work standalone without local source or a build toolchain present.
- **Reading `/docs` from the filesystem at runtime** — discarded; incompatible with the standalone npm/pnpm install model, where no monorepo checkout is guaranteed to exist alongside the installed package.
- **Including monorepo-contributor / internals documentation** (`resources/architecture.md`, `resources/development.md`) — discarded; irrelevant and potentially misleading for an agent operating on a consumer project, not the BeechCMS engine itself.
- **Including framework-scaffolding guides and the MCP setup tutorial itself** — discarded; installer/onboarding content has no domain-consulting value for an agent already connected and working.
- **Live/auto-refreshing resource bundle** — discarded for v1; staleness between publishes is an accepted tradeoff, not solved here.
