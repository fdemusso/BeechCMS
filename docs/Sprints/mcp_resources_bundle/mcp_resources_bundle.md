### Pre-Computation Analysis

**a) God Nodes identified via CLI:**
- `MCP Server (\`@beechcms/mcp\`)` (community hub, degree 13, `docs_reference_mcp_server_mcp_server_beechcms_mcp`) — the doc-graph hub for the whole `@beechcms/mcp` package. All existing tool contracts (`Tools Reference`, `Architectural Principles`, `Additive Invariant & Danger Zone Endpoints`, `Permission Model & Known Limitations`) hang off it. New "Resources" behavior extends this same node's doc, not a new one.
- No god node exists yet for a "Resources" capability — confirms this is genuinely new surface, not a refactor of existing hubs.

**b) Architectural boundaries affected:**
- `@beechcms/mcp` (`packages/mcp/src/index.ts`, `package.json`) — ONLY boundary touched. New `resources.ts`, a build-time copy script, and `index.ts` handler registration.
- `@beechcms/core` — NOT touched. No schema/branch/Botanical Engine change.
- `apps/api` — NOT touched. No new HTTP route; resources are static files bundled into the npm package, served over stdio by the MCP process itself.
- `apps/dashboard` — NOT touched.
- root `docs/` tree — read-only source for the curated bundle; root `typedoc.json` config unchanged (still outputs to `docs/api`), consumed as an upstream build artifact by the new `packages/mcp` copy script.

**c) `graphify affected` impact analysis:**
```
graphify affected "MCP Server (`@beechcms/mcp`)" --depth 2
Relations: calls, indirect_call, references, imports, imports_from, dynamic_import, re_exports, inherits, extends, implements, uses, mixes_in, embeds, requires
Depth: 2
No affected nodes found.
```
Zero code nodes depend on the MCP server (it's a standalone CLI-invoked process, `bin: beechcms-mcp`, never imported by `apps/api` or `apps/dashboard`). Confirms this sprint is fully additive and isolated — no breaking-change surface anywhere else in the monorepo.

---

### VETO Audit

- **Botanical Invariant (no D1 bypass, no hardcoded fields, Branch IDs):** N/A — this sprint adds zero database interaction. Resources are static markdown files copied at build time and served verbatim over MCP stdio. `beech_schema_*` tools in `index.ts` are untouched; no new field/branch logic introduced. **PASS.**
- **VSA Enforcement (no cross-feature imports):** `packages/mcp` is a single self-contained package, not `apps/api/features/*` or `apps/dashboard/src/features/*`. The new `resources.ts` module is imported only by `packages/mcp/src/index.ts` within the same package. No cross-slice import created. **PASS.**
- **Cloudflare Purity:** No Worker/D1/R2 code touched. The MCP server is a Node.js stdio process (pre-existing pattern, `bin` script) — not edge-deployed, so this rule doesn't apply to this package's runtime, consistent with its existing architecture. **PASS.**
- **Minimalist Blueprint (YAGNI):** Rejected in `feature_brief.md` Section 5: vector search/embeddings, runtime typedoc generation, runtime `/docs` filesystem reads, live-refresh bundle. Plan below uses the MCP protocol's native resource list (title + description, client selects) — zero retrieval infra. **PASS.**
- **Additive-only tool surface:** Brief confirms resources are strictly additive to existing tools; no existing `TOOLS` array entry or `handleTool` case modified. **PASS.**

No violations found. Plan proceeds as scoped.

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
`@beechcms/mcp` is published standalone to npm and installed into arbitrary consumer projects with zero guarantee of monorepo access. Every prior and future tool-surface change to this package assumes the agent calling it already knows BeechCMS's domain rules (ALE policy, widget contracts, Botanical Engine semantics) — today it doesn't, because there's no way to hand it that knowledge without a live repo checkout or network fetch. This sprint closes that gap first, before any further tool work, because:
- It's a pure package-local addition (`packages/mcp` only, confirmed zero affected nodes via `graphify affected`), so it can't destabilize `@beechcms/core`, `apps/api`, or `apps/dashboard` — safest possible increment.
- It respects VSA: one self-contained package, one new internal module (`resources.ts`), no cross-slice import.
- It respects the Botanical Invariant by construction: resources are static file serving, no DB path exists to bypass `@beechcms/core` through.
- Every later `@beechcms/mcp` capability (better tool descriptions, richer agent guidance) benefits from this foundation existing, so building it now avoids retrofitting resource wiring around future tool additions.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
- `packages/mcp/src/index.ts` constructs a single `Server` instance: `new Server({ name: 'beechcms-mcp', version: '0.1.0' }, { capabilities: { tools: {} } })` (line 316). Capabilities object currently declares `tools` only — no `resources` key.
- Two request handlers are registered: `ListToolsRequestSchema` and `CallToolRequestSchema` (lines 318, 320), both imported from `@modelcontextprotocol/sdk/types.js`. No `ListResourcesRequestSchema` / `ReadResourceRequestSchema` handlers exist yet.
- `packages/mcp/src/` contains: `index.ts`, `client.ts` (HTTP client to `apps/api`), `oauth.ts`, `plans.ts`, `token-store.ts`, plus their `*.test.ts` files. No `resources.ts` module exists.
- `packages/mcp/package.json` build script: `tsc --noEmit && esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js`. `files: ["dist", "SKILL.md"]` — this is the exact npm-publish allowlist; anything not listed here (or not inside `dist/`) never reaches consumer installs.
- Repo-root `typedoc.json` already generates markdown API docs to `docs/api/` for `packages/core`, `client`, `forms-react`, `search-client`, `widget-sdk`, `cli` via root script `"docs:generate": "turbo run build && typedoc"`. This is a separate, pre-existing pipeline — NOT a turbo `build` task, so `packages/mcp`'s own `turbo run build` does not implicitly regenerate it.
- `graphify affected "MCP Server (\`@beechcms/mcp\`)" --depth 2` → `No affected nodes found` — confirms nothing in `apps/api`/`apps/dashboard` imports or depends on this package; it is purely CLI-invoked (`bin: { "beechcms-mcp": "./dist/index.js" }`).
- Doc source formats verified directly (Read, per graphify decision heuristic — exact files already known from the brief):
  - `docs/features/*.md` and `docs/manage/*.md` carry VitePress frontmatter: `--- title: ... description: ... ---`.
  - `docs/reference/*.md` mostly have NO frontmatter — first line is a bare `# H1` heading, no description field.
  - `docs/api/**/*.md` (typedoc output) has NO frontmatter — first content line is a markdown breadcrumb link (`[**BeechCMS**](../../index.md)`), heading appears a few lines down.
  - `docs/build/*.md`, `docs/start/first-project.md` — mixed, need runtime handling for both cases.
- File counts for the locked curation list: `docs/api` (491 `.md`), `docs/features` (15), `docs/manage` (3), `docs/reference` (14), `docs/build` (6), `docs/start/first-project.md` (1). Total ≈ 530 files.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
1. `packages/mcp/scripts/bundle-resources.mjs` (NEW) — Node build script. Copies the curated doc subset from repo-root `docs/` into `packages/mcp/resources/`, plus generates `packages/mcp/resources/manifest.json` (the static resource registry: uri, title, description, relative file path).
2. `packages/mcp/src/resources.ts` (NEW) — Runtime module: loads `resources/manifest.json` at process start, exposes `listResources()` and `readResource(uri: string)` used by the MCP server's resource handlers.
3. `packages/mcp/src/resources.test.ts` (NEW) — Unit tests for `listResources`/`readResource` against a fixture manifest + fixture files (not the real 530-file bundle).
4. `packages/mcp/src/index.ts` (MODIFIED) — Add `resources: {}` to server capabilities; import and register `ListResourcesRequestSchema` and `ReadResourceRequestSchema` handlers backed by `resources.ts`.
5. `packages/mcp/package.json` (MODIFIED) — `build` script runs `bundle-resources.mjs` before `esbuild`; `files` array gains `"resources"`.
6. `packages/mcp/.gitignore` (NEW) — ignores generated `resources/` (build artifact, same treatment as `dist/`).
7. `docs/reference/mcp-server.md` (MODIFIED) — new `## Resources` subsection documenting the resource list, URI scheme, and staleness caveat (mirrors existing `## Tools Reference` structure).

Excluded from this sprint: no changes to `apps/api`, `apps/dashboard`, `@beechcms/core`, or the root `typedoc.json`/`docs:generate` pipeline itself — this sprint only *consumes* `docs/api`'s existing output, it does not change how that output is produced.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**No D1/SQL changes in this sprint.**

**4.1 — `packages/mcp/scripts/bundle-resources.mjs`**

```js
#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const DOCS_ROOT = join(REPO_ROOT, 'docs')
const OUT_DIR = join(__dirname, '..', 'resources')

/** Curated allowlist. Directories are copied recursively (.md only); single files copied as-is. */
const INCLUDE = [
  { type: 'dir', src: 'api', dest: 'api' },
  { type: 'dir', src: 'build', dest: 'build' },
  { type: 'dir', src: 'features', dest: 'features' },
  { type: 'dir', src: 'manage', dest: 'manage' },
  { type: 'dir', src: 'reference', dest: 'reference' },
  { type: 'file', src: 'start/first-project.md', dest: 'start/first-project.md' },
]

function walkMarkdown(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMarkdown(full))
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

function extractTitleAndDescription(absPath, fallbackRelPath) {
  const raw = readFileSync(absPath, 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const title = fm[1].match(/^title:\s*(.+)$/m)?.[1]?.trim()
    const description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim()
    if (title) return { title, description: description ?? '' }
  }
  const heading = raw.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim()
  return { title: heading ?? fallbackRelPath, description: '' }
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const manifest = []

for (const item of INCLUDE) {
  const srcAbs = join(DOCS_ROOT, item.src)
  if (item.type === 'file') {
    const destAbs = join(OUT_DIR, item.dest)
    mkdirSync(dirname(destAbs), { recursive: true })
    cpSync(srcAbs, destAbs)
    const { title, description } = extractTitleAndDescription(srcAbs, item.dest)
    manifest.push({ uri: `beechcms-docs://${item.dest}`, title, description, file: item.dest })
    continue
  }
  const files = walkMarkdown(srcAbs)
  for (const absFile of files) {
    const rel = relative(srcAbs, absFile)
    const destRel = join(item.dest, rel)
    const destAbs = join(OUT_DIR, destRel)
    mkdirSync(dirname(destAbs), { recursive: true })
    cpSync(absFile, destAbs)
    const { title, description } = extractTitleAndDescription(absFile, destRel)
    manifest.push({ uri: `beechcms-docs://${destRel.split('\\').join('/')}`, title, description, file: destRel.split('\\').join('/') })
  }
}

manifest.sort((a, b) => a.uri.localeCompare(b.uri))
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

console.log(`bundle-resources: wrote ${manifest.length} resources to ${OUT_DIR}`)
```

Fails loudly (uncaught `ENOENT`) if `docs/api` doesn't exist yet — this is intentional: it forces `pnpm docs:generate` to run before `@beechcms/mcp` is built/published (documented as a Section 5 prerequisite, not silently handled with an empty-dir fallback).

**4.2 — `packages/mcp/src/resources.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RESOURCES_DIR = join(__dirname, '..', 'resources')

export interface ResourceEntry {
  uri: string
  title: string
  description: string
  file: string
}

let cachedManifest: ResourceEntry[] | null = null

function loadManifest(): ResourceEntry[] {
  if (cachedManifest) return cachedManifest
  const raw = readFileSync(join(RESOURCES_DIR, 'manifest.json'), 'utf8')
  cachedManifest = JSON.parse(raw) as ResourceEntry[]
  return cachedManifest
}

/** Lists all bundled MCP resources (title + description only, no file content). */
export function listResources(): { uri: string; name: string; description: string; mimeType: string }[] {
  return loadManifest().map(entry => ({
    uri: entry.uri,
    name: entry.title,
    description: entry.description,
    mimeType: 'text/markdown',
  }))
}

/** Reads the full text content of a single resource by URI. Throws if the URI is unknown. */
export function readResource(uri: string): { uri: string; mimeType: string; text: string } {
  const entry = loadManifest().find(e => e.uri === uri)
  if (!entry) throw new Error(`Unknown resource URI '${uri}'.`)
  const text = readFileSync(join(RESOURCES_DIR, entry.file), 'utf8')
  return { uri: entry.uri, mimeType: 'text/markdown', text }
}
```

**4.3 — `packages/mcp/src/index.ts` additions**

Add to the existing import from `@modelcontextprotocol/sdk/types.js` (line 22):
```ts
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { listResources, readResource } from './resources.js'
```

Change server construction (line 316) capabilities to:
```ts
const server = new Server({ name: 'beechcms-mcp', version: '0.1.0' }, { capabilities: { tools: {}, resources: {} } })
```

After the existing `CallToolRequestSchema` handler (after line 327), add:
```ts
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listResources() }))

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri, mimeType, text } = readResource(req.params.uri)
  return { contents: [{ uri, mimeType, text }] }
})
```
`readResource` throwing on an unknown URI is intentional — the SDK's request-handler dispatch already converts a thrown `Error` into a JSON-RPC error response, matching existing `handleTool` error semantics.

**4.4 — `packages/mcp/package.json` changes**

```diff
   "files": [
     "dist",
+    "resources",
     "SKILL.md"
   ],
   "scripts": {
-    "build": "tsc --noEmit && esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js",
+    "build": "tsc --noEmit && node scripts/bundle-resources.mjs && esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js",
     "dev": "esbuild src/index.ts --bundle --packages=external --platform=node --format=esm --outfile=dist/index.js --watch",
```

**4.5 — `packages/mcp/.gitignore` (new file)**
```
resources/
```

**4.6 — `docs/reference/mcp-server.md` addition**

Insert a new `## Resources` subsection after the existing `## Tools Reference` section (currently starts at L85), documenting: the `beechcms-docs://` URI scheme, that resources are read-only static snapshots pinned to package-publish time (staleness caveat from the brief), and the curated subset list (api/build/features/manage/reference + start/first-project.md). Match the existing heading depth and tone of surrounding sections — no code sample needed beyond one example URI (`beechcms-docs://features/analytics.md`).

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
Prerequisite (must run once, before validating `packages/mcp`, since typedoc output isn't a turbo `build` task):
```
pnpm docs:generate
```

Then, from repo root:
```
pnpm --filter @beechcms/mcp build
pnpm --filter @beechcms/mcp type-check
pnpm --filter @beechcms/mcp lint
pnpm beech test --diff
```
Manual smoke check (resources dir + manifest were actually produced with the expected shape):
```
ls packages/mcp/resources
node -e "const m=require('./packages/mcp/resources/manifest.json'); console.log(m.length, m[0])"
```

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] `pnpm --filter @beechcms/mcp build` succeeds and produces `packages/mcp/resources/manifest.json` plus every curated `.md` file physically copied under `packages/mcp/resources/`.
- [ ] `packages/mcp/resources/manifest.json` contains one entry per bundled file, each with non-empty `uri`, `title`, `file`; `description` may be `''` for files without frontmatter (e.g. most of `docs/reference`, all of `docs/api`).
- [ ] Every manifest `uri` is unique and prefixed `beechcms-docs://`.
- [ ] `server` capabilities object includes `resources: {}` alongside the existing `tools: {}`.
- [ ] `ListResourcesRequestSchema` handler returns all manifest entries mapped to `{ uri, name, description, mimeType }`.
- [ ] `ReadResourceRequestSchema` handler returns the exact file content (`text/markdown`) for a known URI, and throws/errors (JSON-RPC error, not a crash) for an unknown URI.
- [ ] `resources.ts` has zero dependency on `@beechcms/core`, `client.ts`, `oauth.ts`, `plans.ts`, or `token-store.ts` — purely reads its own bundled `resources/` directory.
- [ ] No existing `TOOLS` array entry, `handleTool` case, or tool `inputSchema` is modified.
- [ ] `resources/` is listed in `packages/mcp/package.json`'s `files` array and in `packages/mcp/.gitignore`.
- [ ] `docs/api`, `docs/resources/*`, `docs/ci`, `docs/examples`, `docs/public`, `docs/personal`, `docs/Sprints`, `docs/start/mcp.md`, `docs/start/frameworks/*` are NOT copied except `docs/api` itself (which IS included) — verify the manifest contains zero entries with `file` paths under `resources/`, `ci/`, `examples/`, `public/`, `personal/`, `Sprints/`, `start/mcp.md`, or `start/frameworks/`.
- [ ] `pnpm --filter @beechcms/mcp type-check` and `pnpm --filter @beechcms/mcp lint` pass with zero errors.
- [ ] `pnpm beech test --diff` passes, including new `resources.test.ts` coverage for both a known and an unknown URI.
- [ ] `graphify affected "MCP Server (\`@beechcms/mcp\`)" --depth 2` still reports `No affected nodes found` after the change (confirms no accidental new coupling into `apps/api`/`apps/dashboard`).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Vector search, embeddings, or any precomputed similarity/retrieval index over the resource corpus — explicitly discarded in `feature_brief.md` §5 as premature for a ~530-file / few-hundred-KB corpus.
- Runtime or on-demand typedoc (re)generation inside the running MCP server process — typedoc stays a pre-existing, separate root-level pipeline (`pnpm docs:generate`); this sprint only consumes its output at `@beechcms/mcp` build time.
- Reading `docs/` from the filesystem at MCP server *runtime* — all resource content is bundled into `dist`-adjacent `resources/` at build time; the running server never touches paths outside its own package.
- A live/auto-refreshing resource bundle, cache-busting, or staleness-detection mechanism — accepted tradeoff per brief; bundle is only as fresh as the last `@beechcms/mcp` publish.
- Any change to `@beechcms/core`, `apps/api`, `apps/dashboard`, or the OAuth/JWT auth flow used by existing tools — resources are unauthenticated, read-only, and carry no admin-gated content per brief §2.
- Any change to the root `typedoc.json` config or the set of packages it documents (`core`, `client`, `forms-react`, `search-client`, `widget-sdk`, `cli`) — out of this sprint's boundary; consumed as-is.
- Rewriting or restructuring existing `docs/reference/mcp-server.md` content beyond the additive `## Resources` subsection.
- This feature is fully single-sprint (confirmed via `graphify affected` = zero impact, single-package boundary); no `output/backlog/ROADMAP.md` was produced.
