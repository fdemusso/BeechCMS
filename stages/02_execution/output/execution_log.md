# Execution Log — MCP Resources Bundle

## Section 6 — Acceptance Criteria

- [x] `pnpm --filter @beechcms/mcp build` succeeds and produces `packages/mcp/resources/manifest.json` plus every curated `.md` file physically copied under `packages/mcp/resources/`.
- [x] `packages/mcp/resources/manifest.json` contains one entry per bundled file, each with non-empty `uri`, `title`, `file`; `description` may be `''` for files without frontmatter.
- [x] Every manifest `uri` is unique and prefixed `beechcms-docs://`.
- [x] `server` capabilities object includes `resources: {}` alongside the existing `tools: {}`.
- [x] `ListResourcesRequestSchema` handler returns all manifest entries mapped to `{ uri, name, description, mimeType }`.
- [x] `ReadResourceRequestSchema` handler returns exact file content (`text/markdown`) for a known URI, throws for an unknown URI.
- [x] `resources.ts` has zero dependency on `@beechcms/core`, `client.ts`, `oauth.ts`, `plans.ts`, `token-store.ts`.
- [x] No existing `TOOLS` array entry, `handleTool` case, or tool `inputSchema` modified.
- [x] `resources/` listed in `packages/mcp/package.json`'s `files` array and in `packages/mcp/.gitignore`.
- [x] `pnpm --filter @beechcms/mcp type-check` and `lint` pass with zero errors.
- [x] `pnpm beech test --diff` passes with 100% coverage across all metrics (resolved via issue #389).
- [x] `graphify affected "MCP Server (\`@beechcms/mcp\`)" --depth 2` reports `No affected nodes found`.

## Validation Output

```
$ pnpm docs:generate  (prerequisite)
...
[info] markdown generated at ./docs/api

$ pnpm --filter @beechcms/mcp build
bundle-resources: wrote 530 resources to .../packages/mcp/resources
dist/index.js  20.7kb
⚡ Done in 2ms

$ pnpm --filter @beechcms/mcp type-check
$ tsc --noEmit
(no output, exit 0)

$ pnpm --filter @beechcms/mcp lint
$ eslint .
(no output, exit 0)
```

### `pnpm beech test --diff` (resolved in issue #389)

Added `packages/mcp` to `WORKSPACES` in `scripts/test-coverage-diff.mjs`:
```
$ pnpm beech test --diff
PASS  All 1 changed file(s) meet coverage thresholds.
File: packages/mcp/src/resources.ts: 100% Stmts, 100% Branch, 100% Funcs, 100% Lines
```

Ran the package's own suite as equivalent validation:

```
$ pnpm --filter @beechcms/mcp test
$ vitest run
 Test Files  6 passed (6)
      Tests  40 passed (40)
```

Includes new `resources.test.ts` (known-URI read, unknown-URI throw, listResources mapping).

### Smoke checks

```
$ ls packages/mcp/resources
api  build  features  manage  manifest.json  reference  start

$ node -e "const m=require('./packages/mcp/resources/manifest.json'); console.log(m.length, m[0])"
530 { uri: 'beechcms-docs://api/@beechcms/cli/functions/dbMigrate.md', title: 'Function: dbMigrate()', description: '', file: '...' }
```

Manifest verified programmatically: 530/530 unique `uri`s, all prefixed `beechcms-docs://`, zero entries under any excluded path (`resources/`, `ci/`, `examples/`, `public/`, `personal/`, `Sprints/`, `start/mcp.md`, `start/frameworks/`).

```
$ graphify affected "MCP Server (`@beechcms/mcp`)" --depth 2
No affected nodes found.
```

```
$ graphify update .
Graph has 11820 nodes, 20773 edges, 926 communities. graphify-out updated.
```
