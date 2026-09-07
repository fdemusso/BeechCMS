# @beechcms/mcp

BeechCMS AI Control Plane — a Stdio MCP server that lets IDE agents inspect and safely evolve
BeechCMS content schemas through the Botanical Engine's Admin API. It never touches D1 directly:
every write goes through `POST /api/seeds/:slug/mcp-plan` and `POST /api/seeds/:slug/mcp-apply`.

## Install & configure

```bash
pnpm --filter @beechcms/mcp build
```

Add it to your MCP client config (e.g. `.mcp.json`, `claude_desktop_config.json`):

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

- `BEECH_API_URL` defaults to `http://localhost:8787`; if unset, the server falls back to a
  `BEECH_API_URL=` line in a local `.dev.vars` file (never credentials — `.dev.vars` holds Worker
  secrets, not user accounts).
- `BEECH_EMAIL` / `BEECH_PASSWORD` are required — the server authenticates via
  `POST /auth/login` like any other admin user. There is no API-key / service-token path.

## Tools

| Tool | Input | Output | Errors |
|---|---|---|---|
| `beech_list_seeds` | `{}` | `{ seeds: { slug, label, status, branchCount, updatedAt }[], schemaVersion }` | 401 |
| `beech_get_seed` | `{ slug }` | Full `SeedRecord` | 404 |
| `beech_schema_export` | `{}` | Full registry snapshot (definitions + layouts) | 401 |
| `beech_schema_validate` | `{ candidate }` | `{ issues: { slug, fatal, messages }[] }` | — (local, no D1 write) |
| `beech_schema_plan` | `{ slug, candidate }` | `{ planId, classification, requiresConfirmation, applicable, blockedReasons, statements, ftsRebuildNeeded, expectedVersion, issues, expiresInSeconds }` | 400, 401, 403 |
| `beech_schema_apply` | `{ planId }` | `{ slug, newVersion, ftsRebuilt, warning? }` | unknown/expired/used planId, destructive classification, 409 drift, 401, 403 |

## Permission model

Every route lives behind `apiProtected` (JWT Bearer, `authMiddleware()`) and `seedsApp`'s
`requireAdmin` gate. **Known limitation**: read-only tools (`beech_list_seeds`, `beech_get_seed`)
currently need the same `admin` role as the write tools, because `seedsApp` is admin-gated as a
whole — there are no finer-grained read/plan/apply scopes yet. A scoped service-token subsystem
is tracked as a follow-up (Issue #328), not part of this release.

## Failure semantics

| Status | Meaning | Agent action |
|---|---|---|
| 400 | Bad input (bad slug, non-object candidate, non-integer `expectedVersion`) | Fix the input, do not retry blindly |
| 401 | Auth failed after one re-login attempt | Check `BEECH_EMAIL` / `BEECH_PASSWORD` |
| 403 | Account lacks `admin` role | Ask the developer for an admin account |
| 409 | Registry drift — another writer moved `registry_version` | Re-run `beech_schema_plan` |
| 422 | Validation failure, destructive intent, or DDL failure | Show the developer the detail; do not retry the same candidate |
| connection refused | API unreachable | `pnpm beech dev` |

## Worked agent session

```
1. beech_schema_validate({ candidate: { slug: "products", label: "Product", branches: [...] } })
   → { issues: [] }

2. beech_schema_plan({ slug: "products", candidate: { ... } })
   → { planId: "b3f1...", classification: "create", applicable: true,
       statements: ["CREATE TABLE content_products (...)", ...],
       expectedVersion: 4, expiresInSeconds: 600 }

3. beech_schema_apply({ planId: "b3f1..." })
   → { slug: "products", newVersion: 5, ftsRebuilt: false }

4. beech_schema_plan({ slug: "products", candidate: { ...same, branches: [...prev, { alias: "price", type: "number" }] } })
   → { planId: "9a02...", classification: "additive", applicable: true,
       statements: ["ALTER TABLE content_products ADD COLUMN price REAL"],
       expectedVersion: 5, expiresInSeconds: 600 }

5. beech_schema_apply({ planId: "9a02..." })
   → { slug: "products", newVersion: 6, ftsRebuilt: false }
```
