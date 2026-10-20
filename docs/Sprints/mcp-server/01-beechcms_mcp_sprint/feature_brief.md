# 1. Feature Definition and Core Value

The shift introduced in PR #370 established Cloudflare D1 as the sole canonical runtime authority for Seed definitions and abolished static configuration files (`seeds.ts`) on disk. This architectural decision permanently eliminated the risk of split-brain state between filesystem files and the live database. However, it introduced a critical operational void: AI coding agents (Antigravity, Cursor, Claude Desktop, Windsurf) operating inside the IDE are left completely blind and disarmed regarding the project's content architecture.

Because Seeds are DB-resident and modeled exclusively through the web dashboard, agents have no local source files to inspect or modify. If an agent attempts to create or alter content models using raw SQL or arbitrary DDL, it catastrophically violates the invariants of the Botanical Engine (`@beechcms/core`):
* Destruction or desynchronization of Dual-Table Mirror Staging (`content_<slug>_drafts`).
* Breakdown of FTS5 full-text virtual tables (`fts_content_<slug>`) and corresponding update triggers.
* Foreign key constraint violations and corrupted many-to-many junction tables.
* Complete circumvention of audit trails and security policies.

Issue #328 delivers `@beechcms/mcp` and the official BeechCMS Agent Skill, completing the final requirement of the v0.8.0 milestone ("AI-Native Ecosystem & Core Polish"). 

The core value of `@beechcms/mcp` is providing a 100% JSON-First and 100% D1-First AI Control Plane conforming to the Model Context Protocol. It empowers AI agents to inspect, validate, plan, and apply content model changes directly against Cloudflare D1 in real time. It guarantees zero file drift, zero AST parsing fragility, full transaction atomicity, and ironclad Optimistic Concurrency Control, elevating BeechCMS to a native platform for autonomous AI-assisted development.

---

# 2. Domain Boundaries and Business Rules

## Logical Entities

1. **AI Agent Client**: An external autonomous development tool or LLM operating within the developer's IDE (Cursor, Antigravity, Claude Desktop) communicating over standard JSON-RPC via Stdio.
2. **MCP Control Plane Server (`@beechcms/mcp`)**: A lightweight, stateless translation bridge exposing discovery, static validation, dynamic planning, and atomic execution tools to the AI Agent Client.
3. **Botanical Engine (`@beechcms/core`)**: The authoritative business logic domain responsible for compiling DDL, enforcing schema constraints, sorting dependency hierarchies, and determining mutation safety classifications.
4. **Admin Backend API (`apps/api`)**: The running Cloudflare Workers service providing authenticated HTTP endpoints for reading and mutating Seed definitions.
5. **Runtime Cloudflare D1 Database**: The physical SQLite edge database holding canonical `seeds` records, the registry version counter (`seed_meta.registry_version`), content tables, draft mirrors, junction tables, and FTS5 search indexes.
6. **Schema Change Plan**: An ephemeral, structured data representation of a proposed migration containing a unique identifier (`planId`), ordered DDL statements, safety classification, expected schema version, and required confirmation tokens.
7. **BeechCMS Agent Skill (`SKILL.md`)**: A standardized system prompt specification packaged with the project that instructs AI agents on domain rules, constraints, and the mandatory human-in-the-loop confirmation workflow.

## Ironclad Business Rules

1. **D1 Single Source of Truth**: The runtime database is the sole authority for content schemas. No local schema files, TypeScript declarations, or manifest files are treated as runtime authority.
2. **Strict Plan-and-Apply Pipeline**: Direct, uninspected mutations are strictly prohibited. Every change to the schema must originate from a valid Seed JSON proposal, pass through deterministic planning, and be applied via its unique plan reference.
3. **Optimistic Concurrency Control (OCC)**: Every plan is strictly bound to the `registry_version` captured during planning. An apply request must fail immediately with a conflict status if the database version has progressed in the interim.
4. **Native Batch Atomicity**: Schema mutations applied to Cloudflare D1 must execute inside a single transactional batch. Any failure during execution triggers an immediate full rollback, ensuring no partial or orphaned tables remain.
5. **Guarded Destructive Mutations**: Any operation classified as destructive (dropping tables, dropping columns, incompatible type re-definitions, or FTS virtual table recreations) requires a specific string confirmation token matching the target resource. Generic boolean approval flags are rejected.
6. **Human Confirmation Enforcement**: When a plan requires confirmation, the Agent Skill obligates the AI agent to render the full structural diff to the developer in the IDE chat and wait for explicit human approval before calling the apply tool.
7. **Process Passivity**: The MCP server operates purely as an RPC interface and HTTP client. It must never attempt process supervision, daemon management, or container orchestration (Docker or local background worker processes).

---

# 3. Primary Requirements (User Stories)

* AS AN AI developer agent I WANT to list all active Seeds and their high-level metadata from D1 SO THAT I understand the project content architecture and current schema version before proposing changes.
* AS AN AI developer agent I WANT to retrieve the complete JSON specification of a single Seed SO THAT I can inspect existing field structures, relationships, and indexing rules.
* AS AN AI developer agent I WANT to export the full schema snapshot of the entire database in JSON format SO THAT I can analyze system-wide entity relationships and dependencies.
* AS AN AI developer agent I WANT to run static validation on a proposed Seed JSON definition without contacting the database SO THAT I can catch syntax errors, naming violations, and reserved keyword conflicts with zero latency.
* AS AN AI developer agent I WANT to submit a desired Seed JSON to generate a migration plan against D1 SO THAT I can inspect the generated DDL statements, verify dependency order, and receive a safety classification.
* AS AN AI developer agent I WANT to apply an approved plan using its unique identifier and expected schema version SO THAT the schema changes are committed atomically to D1 without race conditions.
* AS A developer using an AI-powered IDE I WANT the agent to present an explicit diff and ask for my consent whenever a plan is destructive SO THAT no tables or columns are dropped without my deliberate approval.
* AS A developer I WANT the MCP server to resolve local development secrets automatically SO THAT I can use AI tools in my IDE without manually generating or configuring authentication tokens.
* AS AN AI developer agent I WANT clear diagnostic error messages when the backend server is offline SO THAT I can guide the developer to start the local environment with the appropriate command.
* AS A developer I WANT an embedded BeechCMS Agent Skill in the package SO THAT any compliant AI agent automatically respects Botanical Engine constraints and follows safe migration workflows.

---

# 4. Secondary Requirements and Logical Constraints

## Concurrency and Conflict Handling
* **Schema Drift Rejection (409 Conflict)**: When applying a plan, the target `expectedSchemaVersion` is compared against D1's current `seed_meta.registry_version`. If they do not match, the request fails with a structured conflict error, and the agent is instructed to regenerate the plan.
* **Registry Version Bump**: Upon successful execution of an atomic D1 batch, `seed_meta.registry_version` is incremented by exactly 1 within the same transaction.

## Plan Lifecycle and Storage
* **Ephemeral In-Memory Lifecycle**: Plans are stored exclusively in an in-memory cache within the MCP server process with a strict time-to-live (10 minutes). No plan artifacts or temporary files are persisted in D1 or committed to version control.
* **Single-Use Invalidation**: Once a plan has been successfully applied, its `planId` is immediately invalidated to prevent replay attacks or accidental duplicate executions.

## Botanical Engine Constraints and Validations
* **Slug and Alias Formats**: Slugs must strictly match `^[a-z0-9_]+$`. Branch identifiers must match `^br_[A-Za-z0-9]+$`. Aliases cannot match SQLite reserved words or internal system columns (`id`, `created_at`, `updated_at`, `status`).
* **Relational Integrity**: If a branch defines a relation, the target Seed slug must exist in D1 or be part of the current multi-seed planning batch. Plans must topologically sort Seed creations using the dependency graph so foreign key targets are provisioned prior to dependent tables.
* **Dual-Table Mirroring**: Any Seed configured with draft capabilities must automatically have both `content_<slug>` and `content_<slug>_drafts` planned with matching schemas.
* **FTS5 Detection and Rebuilds**: Adding, altering, or removing text branches with search policies enabled must emit FTS5 rebuild plans, accounting for trigger detachment, virtual table recreation, and row re-indexing.

## Operational Resilience and Security
* **Offline Backend Guidance**: If HTTP requests to the backend fail with connection refused, the MCP server returns an actionable error instructing the user or agent to run `pnpm beech dev` or `npm run dev`.
* **Local Secret Auto-Discovery**: In local development environments, the MCP server reads project configuration from `.dev.vars` or standard environment variables to obtain the Admin API secret without manual user intervention.
* **Zero Code Invariant**: This specification strictly excludes all programming code blocks to maintain clean architectural requirements for downstream design.

---

# 5. Out of Scope (Discarded during sparring)

* **Content Entry CRUD**: Creating, reading, editing, drafting, or publishing individual content records is excluded from `@beechcms/mcp`. Content operations remain the domain of `@beechcms/client` and standard REST endpoints.
* **Media and File Uploads to R2 / MinIO**: Presigned upload generation, binary file handling, and media asset management remain strictly within the Dashboard and core API.
* **TypeScript AST Parsing and File Generation (`beech.schema.ts`)**: Decoupled entirely from Issue #328. Static manifest generation remains an independent human developer feature handled via CLI (Issue #381).
* **Direct Unplanned Mutations**: Direct mutation tools (`beech_create_seed`, `beech_add_branch`) that bypass the planning pipeline were discarded to prevent partial table failures, race conditions, and API duplication.
* **Process and Container Management**: Supervising Docker containers (MinIO, Mailpit) or launching background server daemons via MCP is excluded to avoid zombie processes, port collisions, and IDE RPC timeouts.
* **Arbitrary SQL Execution**: Exposing generic SQL query execution tools to the agent is prohibited to prevent catastrophic corruption of Botanical Engine invariants.
* **Pessimistic Application-Level Locks**: Custom locking tables or long-lived database reservation mechanisms were discarded due to orphan lock risks during IDE crashes; native D1 atomic batch locks and OCC provide superior safety.
