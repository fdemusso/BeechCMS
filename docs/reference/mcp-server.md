---
title: MCP Server (@beechcms/mcp)
group: Official SDKs
category: MCP Server
---

# MCP Server (`@beechcms/mcp`)

`@beechcms/mcp` is the official **Model Context Protocol (MCP)** server for BeechCMS. It exposes the **AI Control Plane**, allowing IDE agents (Claude Desktop, Cursor, Antigravity, VSCode) to inspect schemas, validate content models, plan migrations, and execute additive schema evolutions safely through the Botanical Engine.

---

## Architectural Principles

BeechCMS treats Cloudflare D1 as the sole runtime authority for schemas. Rather than allowing agents to execute arbitrary SQL or manipulate non-authoritative local files, `@beechcms/mcp` implements a hardened, safety-first control loop:

```text
IDE Agent  ──(Stdio JSON-RPC)──►  @beechcms/mcp  ──(Authenticated HTTP)──►  BeechCMS Admin API (Hono)
                                                                                       │
                                                                           Botanical Engine + D1
```

### 1. Botanical Dialect Invariant
The MCP server never accesses Cloudflare D1, SQLite, or Wrangler directly. It contains zero database driver dependencies. All operations are performed exclusively over authenticated HTTP requests to the BeechCMS Admin API. Handlers delegate all DDL planning and execution to the `@beechcms/core` Botanical Engine.

### 2. Physical-State DDL Planning
Database migration statements cannot be planned accurately from abstract schema definitions alone. The API inspects the **physical columns** of the SQLite table (`PRAGMA table_info(content_{slug})`) to determine the exact DDL statements required (`ALTER TABLE ... ADD COLUMN`, junction tables, index creation).

### 3. Compare-and-Swap (OCC) Atomicity
To prevent race conditions between concurrent agents or dashboard administrators, schema mutations are guarded by **Optimistic Concurrency Control (OCC)**. Every plan records an `expectedVersion`. When applying, the API executes a single atomic SQLite batch (`db.batch()`) containing a compare-and-swap guard against `seed_meta.registry_version`. If another writer modified the schema in the interim, the guard trips, rolls back the entire batch, and returns `409 Conflict`.

### 4. Strictly Additive Safety Gate
The MCP apply endpoint (`mcp-apply`) is **strictly additive**. Any candidate schema that omits existing branch IDs, renames aliases, or alters field data types is detected as destructive intent, rejected with HTTP `422`, and referred to dedicated danger-zone endpoints.

---

## Installation & Build

`@beechcms/mcp` is a Node.js ESM package located in `packages/mcp`:

```bash
# Build the bundle (dist/index.js)
pnpm --filter @beechcms/mcp build
```

This compiles TypeScript definitions and bundles a standalone Node executable via `esbuild` to `packages/mcp/dist/index.js`.

---

## Client Configuration

Configure your MCP client (such as Claude Desktop, Cursor, or Antigravity) to launch the server over `stdio`:

### Configuration File (`.mcp.json` or `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "beechcms": {
      "command": "node",
      "args": ["/absolute/path/to/packages/mcp/dist/index.js"],
      "env": {
        "BEECH_API_URL": "http://localhost:8787",
        "BEECH_EMAIL": "admin@example.com",
        "BEECH_PASSWORD": "your-admin-password"
      }
    }
  }
}
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BEECH_API_URL` | No | `http://localhost:8787` | Target BeechCMS API origin. If unset and `.dev.vars` exists in `process.cwd()`, the server extracts `BEECH_API_URL` from that file. |
| `BEECH_EMAIL` | **Yes** | — | Administrator email address. |
| `BEECH_PASSWORD` | **Yes** | — | Administrator password. |

> [!NOTE]
> The server connects to `POST /auth/login` to obtain an administrative JWT with a 15-minute expiration. If the token expires during a session, the HTTP client performs a single transparent re-login before failing.

---

## Tools Reference

The server registers 6 tools prefixed with `beech_`:

### 1. `beech_list_seeds`

Lists active and deleted seeds registered in the database, along with the current global schema registry version.

- **Parameters**: None (`{}`)
- **Transport**: `GET /api/seeds`
- **Returns**:
  ```json
  {
    "seeds": [
      {
        "slug": "posts",
        "label": "Posts",
        "status": "active",
        "branchCount": 4,
        "updatedAt": 1709670000
      }
    ],
    "schemaVersion": 4
  }
  ```
  *(Returns compact summaries to minimize LLM context window consumption; `schemaVersion` is extracted from the `X-Schema-Version` response header).*

---

### 2. `beech_get_seed`

Retrieves the complete canonical seed definition for a given slug.

- **Parameters**:
  - `slug` (string, required): The unique identifier of the content type.
- **Transport**: `GET /api/seeds/:slug`
- **Returns**: Full `SeedRecord` object containing the `definition` (with all branches, rules, policies, and layouts), `status`, `source`, `createdAt`, and `updatedAt`.
- **Errors**: `404 Not Found` if the seed does not exist.

---

### 3. `beech_schema_export`

Exports the entire active schema registry, including all seed blueprints, branch configurations, and layout metadata.

- **Parameters**: None (`{}`)
- **Transport**: `GET /api/schema`
- **Returns**: JSON dictionary of all active seed definitions enriched with layout configurations.

---

### 4. `beech_schema_validate`

Performs an offline structural and relational validation of a candidate seed definition against the live set of active seeds.

- **Parameters**:
  - `candidate` (Seed object, required): The proposed seed structure.
- **Transport**: Local execution in `@beechcms/core` (`validateSeedDefinitions`) after retrieving active seeds via `beech_list_seeds`.
- **Returns**:
  ```json
  {
    "issues": [
      {
        "slug": "posts",
        "fatal": false,
        "messages": ["Validation passed with no errors."]
      }
    ]
  }
  ```
  *(Validates relation targets, reserved alias collisions like `id` or `created_at`, slug formatting, and branch rules).*

---

### 5. `beech_schema_plan`

Computes a dry-run migration plan on the server against the physical D1 table structure. Stores the resulting plan in memory and returns a short-lived `planId`.

- **Parameters**:
  - `slug` (string, required): Content type slug.
  - `candidate` (Seed object, required): Proposed seed definition.
- **Transport**: `POST /api/seeds/:slug/mcp-plan`
- **Returns**:
  ```json
  {
    "planId": "b3f14892-d610-4d82-8a9e-05a8b792345e",
    "slug": "products",
    "classification": "create",
    "requiresConfirmation": false,
    "applicable": true,
    "blockedReasons": [],
    "statements": [
      "CREATE TABLE IF NOT EXISTS content_products (...);",
      "CREATE INDEX IF NOT EXISTS idx_products_sku ON content_products (sku);"
    ],
    "ftsRebuildNeeded": false,
    "expectedVersion": 4,
    "expiresInSeconds": 600,
    "issues": []
  }
  ```

#### Safety Classifications:
- **`create`**: The table does not exist; provisions new tables and indexes.
- **`additive`**: Only new branches or harmless metadata changes were added.
- **`destructive`**: Dropped branches, alias renames, or type alterations detected. `applicable` is set to `false` and `blockedReasons` explains what was blocked.

---

### 6. `beech_schema_apply`

Executes an atomic, OCC-guarded migration using a previously planned `planId`.

- **Parameters**:
  - `planId` (string, required): The UUID returned by `beech_schema_plan`.
- **Transport**: `POST /api/seeds/:slug/mcp-apply`
- **Returns**:
  ```json
  {
    "slug": "products",
    "newVersion": 5,
    "ftsRebuilt": false
  }
  ```
- **Error Conditions**:
  - `unknown` / `expired` plan ID (TTL of 10 minutes exceeded).
  - `already used` plan ID (single-use enforcement).
  - `destructive` classification: Refused immediately with `422`.
  - `409 Conflict`: Registry version drift. The response instructs the agent to re-run `beech_schema_plan`.

---

## Resources

In addition to tools, `@beechcms/mcp` exposes a curated snapshot of `docs/` as MCP **resources** — read-only reference material an agent can list and fetch without calling a tool.

- **URI scheme**: `beechcms-docs://<path>`, e.g. `beechcms-docs://features/analytics.md`.
- **Discovery**: `resources/list` returns `{ uri, name, description, mimeType }` for every bundled document; `resources/read` returns the full Markdown text for a given `uri`.
- **Bundled subset**: `docs/api`, `docs/build`, `docs/features`, `docs/manage`, `docs/reference`, and `docs/start/first-project.md`. Internal/CI/example/personal docs, sprint notes, and the MCP quickstart itself are excluded.
- **Staleness caveat**: resources are static files copied into the package at **build time** (`pnpm --filter @beechcms/mcp build`), not read from disk at runtime. Content reflects the last `@beechcms/mcp` publish, not the live `docs/` tree — there is no live-refresh or cache-busting mechanism.

---

## Plan Lifecycle & Security

```text
[ Agent ] ──beech_schema_plan──► [ In-Memory Store ] ──(planId, TTL 10m)──► [ Agent ]
                                         │
                                   takePlan(planId)
                                  [Destructive Read]
                                         │
                                         ▼
                               [ beech_schema_apply ]
```

### In-Memory TTL & Single-Use Consumption
Plans are stored in a process-local `Map<string, StoredPlan>` inside the running MCP server instance:
- **10-Minute TTL**: Plans expire automatically after 600 seconds. Expired plans are purged lazily on subsequent plan requests.
- **Replay Protection**: Reading a plan via `takePlan(planId)` is **destructive**. The plan is deleted from memory as soon as it is retrieved for application. It cannot be executed twice.

### Optimistic Concurrency Control (OCC)
The API prevents blind overwrites using a compare-and-swap primary key trick in Cloudflare D1:

```sql
INSERT INTO seed_meta (id, value)
SELECT 'registry_version', 'occ-conflict'
WHERE (SELECT value FROM seed_meta WHERE id = 'registry_version') <> CAST(? AS TEXT);
```

1. If `expectedVersion` matches the live version in `seed_meta`, the `SELECT` returns zero rows and the statement succeeds silently as a no-op.
2. If `expectedVersion` does not match, SQLite attempts to insert a duplicate primary key `'registry_version'` row, triggering a `UNIQUE constraint failed: seed_meta.id` error.
3. Because all statements run inside a single `db.batch([guard, ...ddl, upsert, bump])`, the entire batch rolls back, preserving database integrity.
4. The API returns HTTP `409 Conflict` with the latest live version.

---

## Additive Invariant & Danger Zone Endpoints

`beech_schema_apply` enforces strict additive safety. If an agent attempts destructive modifications, the operation is blocked:

| Proposed Change | Classification | Blocked Reason | Dedicated Endpoint to Use Instead |
|---|---|---|---|
| Dropping a branch | `destructive` | `branch 'br_XX' would be dropped` | `DELETE /api/seeds/:slug/branches/:branchId` |
| Renaming an alias | `destructive` | `branch 'br_XX' alias rename` | `PATCH /api/seeds/:slug/branches/:branchId/rename` |
| Changing a field type | `destructive` | `branch 'br_XX' type change` | `PATCH /api/seeds/:slug/branches/:branchId/retype` |
| Deleting a seed | — | Not supported via MCP | `DELETE /api/seeds/:slug` or `.../hard` |

---

## FTS5 Rebuild Handling

SQLite virtual tables (`fts5`) cannot be modified using standard `ALTER TABLE ADD COLUMN` statements. When a new branch with search indexing (`policies: { search: true }`) is added to an existing table:

1. `beech_schema_plan` flags `ftsRebuildNeeded: true`.
2. The additive DDL and seed upsert commit in the primary atomic batch.
3. Immediately after commitment, the server runs `planFtsRebuild` via `execDestructive` to recreate virtual tables and triggers.
4. If the rebuild encounters a failure, `beech_schema_apply` returns `200 OK` with a `warning` property directing the user to trigger `POST /api/seeds/:slug/fts/rebuild`.

---

## Permission Model & Known Limitations

Every route used by `@beechcms/mcp` sits behind `authMiddleware()` (JWT Bearer) and the `requireAdmin` role gate:

- **Current Behavior**: All tool calls require credentials belonging to an account with role `admin`.
- **Known Limitation**: Read-only tools (`beech_list_seeds`, `beech_get_seed`) require admin privileges because `/api/seeds` is gated as a whole. Fine-grained machine tokens with scoped permissions (read-only vs. plan vs. apply) are tracked for a future release (Issue #328).

---

## Failure Semantics Matrix

| HTTP Status | Error Type | Cause | Agent Remediation |
|---|---|---|---|
| **400** | `invalid-json` | Malformed JSON, invalid slug characters, or non-integer `expectedVersion`. | Fix payload syntax. Do not retry identical request. |
| **401** | `unauthorized` | Invalid credentials or expired session after re-login retry. | Verify `BEECH_EMAIL` and `BEECH_PASSWORD`. |
| **403** | `forbidden` | Authenticated user lacks `admin` role. | Provide credentials with administrator role. |
| **409** | `conflict` | Registry version mismatch (`expectedVersion` ≠ current database version). | Discard old plan, call `beech_schema_plan` again, and review new diff. |
| **422** | `destructive-change-not-supported` | Candidate attempts to drop, rename, or retype a field. | Reject request or guide developer to dedicated endpoints. |
| **422** | `validation-failed` | Syntax or relational schema validation error. | Correct candidate structure according to `@beechcms/core` rules. |
| **422** | `ddl-failed` | SQLite syntax or execution error during batch DDL. | Inspect DDL statements in server logs. |
| **ECONNREFUSED** | Connection Refused | API server is not running on target `BEECH_API_URL`. | Run `pnpm beech dev` in your local project directory. |

---

## Audit Trail & Observability

Every successful or attempted `mcp-apply` invocation is logged to the BeechCMS `activity_log` table:

```json
{
  "action": "create",
  "entityType": "seed",
  "entityId": "products",
  "details": {
    "op": "mcp-apply",
    "planId": "b3f14892-d610-4d82-8a9e-05a8b792345e",
    "classification": "create",
    "expectedVersion": 4,
    "newVersion": 5,
    "ddlCount": 2,
    "ftsRebuilt": false,
    "outcome": "ok"
  },
  "actor": {
    "id": "usr_admin_01",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

---

## Worked Agent Session

Here is an end-to-end example of an AI agent creating a new `products` seed and subsequently extending it with an additive `price` branch:

```typescript
// Step 1: Validate candidate definition
await beech_schema_validate({
  candidate: {
    slug: "products",
    label: "Product",
    labelPlural: "Products",
    displayNameAlias: "title",
    branches: [
      { alias: "title", label: "Title", type: "text", requiredOnCreate: true }
    ]
  }
})
// => { issues: [] }

// Step 2: Request server migration plan
const plan1 = await beech_schema_plan({
  slug: "products",
  candidate: {
    slug: "products",
    label: "Product",
    labelPlural: "Products",
    displayNameAlias: "title",
    branches: [
      { alias: "title", label: "Title", type: "text", requiredOnCreate: true }
    ]
  }
})
// => {
//   planId: "4f7e2a91-...",
//   classification: "create",
//   applicable: true,
//   statements: ["CREATE TABLE content_products (...)"],
//   expectedVersion: 10,
//   expiresInSeconds: 600
// }

// Step 3: Apply the creation plan
await beech_schema_apply({ planId: "4f7e2a91-..." })
// => { slug: "products", newVersion: 11, ftsRebuilt: false }

// Step 4: Add a new "price" branch
const plan2 = await beech_schema_plan({
  slug: "products",
  candidate: {
    slug: "products",
    label: "Product",
    labelPlural: "Products",
    displayNameAlias: "title",
    branches: [
      { id: "br_01", alias: "title", label: "Title", type: "text", requiredOnCreate: true },
      { alias: "price", label: "Price", type: "number" }
    ]
  }
})
// => {
//   planId: "8b12c094-...",
//   classification: "additive",
//   applicable: true,
//   statements: ["ALTER TABLE content_products ADD COLUMN price REAL"],
//   expectedVersion: 11,
//   expiresInSeconds: 600
// }

// Step 5: Apply the additive migration
await beech_schema_apply({ planId: "8b12c094-..." })
// => { slug: "products", newVersion: 12, ftsRebuilt: false }
```

---

## Related Documentation

- [AI & MCP Setup Guide](/start/mcp) — Getting started with Claude Desktop, Cursor, and IDE assistants.
- [Seed Builder & Schema Mutation API](/reference/seed-builder) — Low-level REST API contracts and endpoints.
- [Schema Modeling & Evolution](/build/schema-modeling) — Botanical Engine mental model and field specifications.
