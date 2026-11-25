# Sprint Plan — KeyModelDocs (publishable & secret keys, sprint 04)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, row 04. Feature brief:
`stages/00_ideation/output/feature_brief.md` (issue #995, #996, #997), section 4 "Documentazione" and the last user
story. Sprint 01 (`KeyRoleRuntime`) shipped in `3ad0b738` + `e280c5bd`. Sprint 02 (`ScaffoldSecrets`) and sprint 03
(`KeysMigrate`) passed review (archives `docs/Sprints/ScaffoldSecrets/`, `docs/Sprints/KeysMigrate/`) but are **not
committed yet**: their changes are in the working tree. This sprint builds on that working tree. The shared decisions
table in the ROADMAP is fixed and is not renegotiated here.

**Re-plan (2026-11-25, REWORK_PLAN from stage 03, `rejections.md`).** The first execution passed review except for one plan gap:
`docs/.vitepress/theme/components/LlmPromptNode.vue:56`, the copyable prompt readers paste into AI assistants, still says
"with baseUrl and apiKey". The census grepped for legacy key names, not for `apiKey`, and SECTION 7 forbade the theme folder.
This plan lifts that exclusion (T3), widens the fact-check to the theme sources (T1), and corrects the census. Everything
else passed review and is unchanged: the executor only does the delta marked **[REWORK]** below.

### Pre-Computation Analysis

**Graph refresh:** `graphify update . --force` → 33078 nodes, 48280 edges, 3146 communities (2026-11-25).

**a) God Nodes (via `graphify explain`)**

This is a docs sprint. The only code it adds is leaf tooling. No god node is edited. These nodes define what the docs
must say:

| Node | Source | Degree | Why it matters here |
|---|---|---|---|
| `authorizePublicKey()` | `apps/api/src/public/middleware/public-key-auth.ts:L45` | 6 | The single role decision, shared by `api-key-middleware.ts` and `publicAddHandler()`. Every status and problem type in the docs comes from here and `publicKeyProblem()` (`L76`). |
| `resolveConfig()` | `packages/client/src/http.ts:L20` | 3 | Validates the client config: `apiKey` throws `apiKey was removed: pass <keyName> to <factory>`, and a blank key throws `<keyName> is required and must be a non-empty string`. `resolveBrowserConfig()` (`L41`) refuses `beech_sk_…`. |
| `getMarkdownFiles()` | `scripts/docs-fact-check.mjs:L34` | 2 | The page list the new fact-check section scans. It skips `.vitepress`, `Sprints`, `personal`, `examples`. |
| `keyMigrationReport()` | `packages/cli/src/commands/keys-migrate.ts:L287` | 3 | The production order the changelog must repeat: `npm run deploy` first, then `wrangler secret put` (`L314-330`). |

**b) Architectural boundaries affected**

- `@beechcms/core`, `apps/api`, `apps/dashboard`, `packages/client`, `packages/cli`, `bin/`: **no change**. The docs
  follow the code. The code does not change to fit the docs.
- `docs/.vitepress/theme/components/LlmPromptNode.vue` **[REWORK]**: one line of prompt text (T3).
- `docs/` (hand-written pages): 8 framework guides, `start/first-project.md`, `start/index.md`,
  `reference/public-api.md`, `reference/client-sdk.md`, `reference/error-model.md`, `manage/environments.md`,
  `features/forms.md`, `features/backrefs.md`, and one table row in `build/cli-workflows.md`.
- `docs/api/` (TypeDoc output, tracked): regenerated, never hand-edited. It still documents the removed
  `BeechClientConfig.apiKey`, and `packages/mcp` serves `docs/api` to agents (`bundle-resources.mjs` INCLUDE `api`).
- `CHANGELOG.md`: new top section.
- `scripts/`: new `scripts/lib/legacy-key-names.mjs` + test, new section 6 in `scripts/docs-fact-check.mjs`.
- `packages/mcp/resources/`: untracked (`packages/mcp/.gitignore:1`), rebuilt by the mcp `build`. It is not in the diff.

**c) `graphify affected` impact analysis**

```
graphify affected "resolveConfig()" --depth 2
- resolveBrowserConfig(), resolveServerConfig()   packages/client/src/http.ts:L41, L49
- createBeechBrowserClient()                     packages/client/src/browser/client.ts:L17
- createBeechServerClient()                      packages/client/src/server/client.ts:L51
- http.test.ts                                   packages/client/src/http.test.ts:L1
  -> read only: the docs describe these factories, and none of them is edited.

graphify affected "getMarkdownFiles()" --depth 2
- No affected nodes found. docs-fact-check.mjs is a leaf script (package.json `docs:check`, `docs:build`).

graphify path "docs-fact-check.mjs" "createBeechServerClient()"
- 7 hops through INFERRED `join()` edges and unrelated test files: no real coupling. The fact-check imports
  only the compiled client dist (section 2, `docs-fact-check.mjs:104-112`), as it does today.
```

No exported signature changes. The new module `scripts/lib/legacy-key-names.mjs` has one caller (the fact-check) and
one test.

**Drift census (verified by `git grep`, 2026-11-25).** Legacy names outside `docs/Sprints`, `stages` and tests:

- `PUBLIC_READ_API_KEY` / `PUBLIC_WRITE_API_KEY`: `public-api.md:24,25,139,451,501`, `environments.md:74,75,76,103,104`,
  `client-sdk.md:47,300`, `first-project.md:193`, every framework guide ("Production API Keys" bullet),
  `react.md:45`, `vue.md:45`, `cli-workflows.md:24` (matrix row), `cli-workflows.md:83` (migration subsection, legitimate).
- `dev-read-key-changeme`: every framework guide (`.env` block + factory fallback), `first-project.md:193`.
- `dev-public-read-key-changeme` / `dev-public-write-key-changeme`: `public-api.md:181,208,238,292,341,402,458,512`.
- `BEECH_READ_KEY` / `VITE_BEECH_READ_KEY` / `NEXT_PUBLIC_BEECH_READ_KEY` / `BEECH_WRITE_API_KEY` (consumer env names
  the docs invented): framework guides, `client-sdk.md:57,295,401,451`, `start/index.md:61`.
- `apiKey` passed to a client factory: all of the above plus `backrefs.md:208` (`'beech_pub_...'`, a prefix that
  never existed).
- `docs/api/@beechcms/client/interfaces/BeechClientConfig.md`: the interface no longer exists
  (`packages/client/src/index.ts:5-24` exports `BeechClientBaseConfig`, `BeechBrowserClientConfig`,
  `BeechServerClientConfig`). TypeDoc into a scratch folder: 91 files differ, 0 errors, and no legacy token is left.
- `README.md` files and `packages/*/README.md`: clean.
- **[REWORK]** `docs/.vitepress/theme/components/LlmPromptNode.vue:56`: "…with baseUrl and apiKey." Not clean. This is the
  default text of `<LlmPromptNode>` (registered in `docs/.vitepress/theme/index.ts:15`). The first census grepped the legacy
  key names only, so it missed a bare `apiKey` in prose. Re-checked with `git grep -n apiKey -- docs/.vitepress ':!docs/.vitepress/dist'`:
  this is the only hit in `theme/` and `config.mts`. (`docs/.vitepress/dist` is build output, ignored.)

**Runtime facts the docs must state (read from code, not from old docs):**

- Roles (`public-key-auth.ts:45-73`): the secret key authorizes every method. The publishable key authorizes
  `GET`/`HEAD`/`OPTIONS` only. A publishable key on a write → 403 `public-api-secret-key-required`. A wrong key → 401
  `public-api-key-unauthorized`. No secret key configured on a write, or neither key on a read → 403
  `public-api-not-configured`. A secret key equal to `beech_sk_dev` while `ENV !== 'development'` → 403
  `public-api-dev-secret-key`, and the worker logs `PUBLIC_KEY_DEV_SECRET_WARNING` (`L16`) once per refused request.
- Zero-secret paths (`api-key-middleware.ts:8-22`): health, `timetrap/token`, `GET :seed/schema`, `POST :seed/add`.
  `PUT`/`PATCH :seed/edit/:id` always needs the secret key.
- `POST :seed/add` with a key (`public-add.ts:170-177`): the key goes through `authorizePublicKey`. A publishable key
  is refused with 403. The secret key skips the Time-Trap and honeypot checks. Seed flags still apply.
- Client (`http.ts:20-55`): browser `{ baseUrl, publishableKey }`, server `{ baseUrl, secretKey }`. Error messages as
  listed for `resolveConfig()` above. The browser client throws on `beech_sk_…`:
  `publishableKey is a secret key (beech_sk_…): secret keys must never reach the browser. …`.
- Scaffold (`bin/template.mjs`): `vars` holds `BEECH_PUBLISHABLE_KEY: "beech_pk_dev"`, and `.dev.vars` holds
  `BEECH_SECRET_KEY=beech_sk_dev`. Nothing generates a production publishable key: the committed `beech_pk_dev` is also
  served in production unless the user changes it. The docs must not claim the publishable key is generated.
- `@beechcms/forms-react` (`hooks/useBeechForm.ts:76,402`): it sends `X-API-Key` only when `apiKey` is set. Its
  schema read and submission are zero-secret, so a form needs no key. A publishable key passed as `apiKey` makes every
  submission fail with 403.

### VETO Audit

| Rule (`_config/ponytail_arch.md`) | Assessment |
|---|---|
| 1. YAGNI | Text edits, one TypeDoc regeneration and one fact-check section with a pure matcher. **Rejected inside this audit:** a new docs page for the key model (the roles table goes in `client-sdk.md`, as the brief asks); rewriting the guides' architecture (each guide keeps its entrypoint, and only the key and its env name change; Nuxt switches because its plugin runs in the browser, see T3); editing `@beechcms/forms-react` (`apiKey` prop, example page: code, not docs, known follow-up); a scaffold or CLI change to generate a production publishable key (code decision, not docs); a lint over READMEs (no hit today); the theme sources are scanned, see T1; hand-editing `docs/api` (generated). |
| 1. YAGNI (matcher module) | `scripts/lib/legacy-key-names.mjs` exists because the heading-bounded allowance and the multi-line `apiKey` detection have edge cases that need a unit test. Inline code in `docs-fact-check.mjs` could not be tested (the script runs top-level side effects and calls `process.exit`). Same split as `scripts/lib/changed-line-coverage.mjs` + test. |
| 2. Botanical invariant | No D1 access, no SQL, no seed, no branch name. |
| 3. VSA | No slice code changes. `scripts/lib/` is shared repo tooling, outside the slices. |
| 4. Cloudflare purity | No binding or runtime change. The docs repeat the `wrangler secret put` commands the CLI already prints. |
| 5. Minimal blueprint | 2 new files (`scripts/lib/legacy-key-names.mjs` + test), 1 edited script, 17 hand-edited pages, `CHANGELOG.md`, 1 regenerated folder. |

**Verdict: APPROVED.** HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 01–03 changed the code: the runtime reads only `BEECH_PUBLISHABLE_KEY` / `BEECH_SECRET_KEY`, the client
accepts only `publishableKey` / `secretKey`, new projects keep their secrets in `.dev.vars`, and `beech keys:migrate`
moves 0.10.x projects over. The docs still describe the 0.10.x model. Each framework guide tells the reader to send
`dev-read-key-changeme` through `apiKey`, so the first documented request throws in the client
(`apiKey was removed: pass secretKey to createBeechServerClient`) before it reaches the API. The same text reaches AI
agents twice: `packages/mcp` serves `docs/build`, `docs/reference`, `docs/manage`, `docs/features`, `docs/api` and
`first-project.md` as MCP resources.

This is the last sprint of the roadmap. It comes after sprint 03 because the changelog and the guides cite
`beech keys:migrate`. The fact-check section makes the result stick: a later edit that brings a legacy name back fails
`pnpm docs:check` and `pnpm docs:build`.

VSA and Botanical Engine: no runtime code changes. The only code is repo tooling under `scripts/`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

- **Fact-check script** `scripts/docs-fact-check.mjs` (MIT header): top-level sections 1–5, then a summary that exits
  1 when `failureCount > 0` (`L326-335`). Helpers: `error(msg)` (`L16`, increments `failureCount`), `success(msg)`
  (`L21`), `header(title)` (`L25`), `getMarkdownFiles(dir)` (`L34`). `ROOT_DIR` (`L11`), `DOCS_DIR` (`L12`). Section
  2 imports the compiled client dist, so `packages/client` must be built before the check runs. Wired as
  `docs:check` (`package.json:42`) and inside `docs:build` (`:43`, after `typedoc`).
- **Pattern for a testable script helper:** `scripts/lib/changed-line-coverage.mjs` (BUSL header, named exports, no
  side effects) and `scripts/lib/changed-line-coverage.test.mjs` (`node:test` + `node:assert/strict`, BUSL header).
  CI runs `node --test scripts/lib/*.test.mjs` (`.github/workflows/test.yml:31`).
- **TypeDoc:** `typedoc.json` (`out: docs/api`, `cleanOutputDir: true`, entry `src/index.ts` per package). Root
  script `docs:generate` = `turbo run build && typedoc` (`package.json:40`). TypeDoc 0.28.20 on TS 5.9.3.
- **MCP resources:** `packages/mcp/scripts/bundle-resources.mjs:16-23` copies `docs/{api,build,features,manage,reference}`
  and `start/first-project.md` into `packages/mcp/resources/` (untracked) during `pnpm --filter @beechcms/mcp build`.
- **CLI docs parity:** `packages/cli/src/test/cli-docs-parity.test.ts` and fact-check section 3 need the text
  `beech keys:migrate` in `cli-workflows.md`. The row edit in T6 keeps it.
- **Migration docs (sprint 03, stays as is):** `docs/build/cli-workflows.md:78-88`, heading
  `#### Moving a 0.10.x project to publishable and secret keys`, followed by `### 2. Database Migrations` (`L90`).
- **Changelog:** `CHANGELOG.md:3` `## First run in minutes — unreleased` (unreleased, ships in the same release per
  ROADMAP "Note di rilascio"). Subsection style: `### Highlights`, `### Breaking`, `### Fixed`, `### Internal`, with
  bold lead-ins and issue numbers in prose.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

| File | Change |
|---|---|
| `scripts/lib/legacy-key-names.mjs` | **New**: patterns, allowed sections, `findLegacyKeyMentions` (T1). |
| `scripts/lib/legacy-key-names.test.mjs` | **New** (T1). |
| `scripts/docs-fact-check.mjs` | Edit: section 6 (T1). |
| `docs/start/frameworks/{astro,hono,nextjs,remix,sveltekit}.md` | Edit: server client with `secretKey` (T3). |
| `docs/start/frameworks/{react,vue}.md` | Edit: browser client with `publishableKey` (T3). |
| `docs/start/frameworks/nuxt.md` | Edit: browser client with `publishableKey` (T3). |
| `docs/start/first-project.md`, `docs/start/index.md` | Edit (T3). |
| `docs/.vitepress/theme/components/LlmPromptNode.vue` | **[REWORK]** Edit: line 56 only (T3). |
| `docs/reference/client-sdk.md` | Edit: "Keys and roles" section, examples (T4). |
| `docs/reference/public-api.md` | Edit: Level 2, requirements, example headers (T5). |
| `docs/reference/error-model.md` | Edit: two rows added, one reworded (T5). |
| `docs/manage/environments.md` | Edit: key rows, `.dev.vars` sample, production secrets (T5). |
| `docs/features/forms.md`, `docs/features/backrefs.md` | Edit (T6). |
| `docs/build/cli-workflows.md` | Edit: `keys:migrate` matrix row only (T6). |
| `CHANGELOG.md` | Edit: new top section (T7). |
| `docs/api/**` | Regenerated with TypeDoc, never hand-edited (T2). |
| `stages/01_sprint_planning/output/backlog/ROADMAP.md` | Already updated by this planning run. Do not edit. |

No runtime, client, CLI, scaffolder or dashboard change.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Shared vocabulary (every task uses exactly these names)

| Context | Variable | Local value | Client factory + option |
|---|---|---|---|
| Server-only code (Node, Workers, SSR loaders, Server Components) | `BEECH_SECRET_KEY` | `beech_sk_dev` | `createBeechServerClient({ baseUrl, secretKey })` |
| Next.js browser code | `NEXT_PUBLIC_BEECH_PUBLISHABLE_KEY` | `beech_pk_dev` | `createBeechBrowserClient({ baseUrl, publishableKey })` |
| Vite browser code (React, Vue) | `VITE_BEECH_PUBLISHABLE_KEY` | `beech_pk_dev` | same |
| Nuxt | env `BEECH_PUBLISHABLE_KEY` → `runtimeConfig.public.beechPublishableKey` | `beech_pk_dev` | same |
| BeechCMS Worker itself | `BEECH_PUBLISHABLE_KEY` (`wrangler.jsonc` `vars`), `BEECH_SECRET_KEY` (`.dev.vars` / `wrangler secret put`) | as above | — |

URL variables are unchanged (`BEECH_API_URL`, `VITE_BEECH_API_URL`, `NEXT_PUBLIC_BEECH_API_URL`, `beechApiUrl`).

Rules for every snippet:
- The key is read from the variable only. Drop every `|| '<key>'` fallback. Keep the `baseUrl` fallbacks. Where the
  variable's type is `string | undefined`, add `!`. The factory throws `secretKey is required …` /
  `publishableKey is required …` at startup when it is missing.
- Never put the secret key in a `NEXT_PUBLIC_`, `VITE_` or `PUBLIC_` variable, or in Nuxt `runtimeConfig.public`.
- Production wording, the same in every guide:
  - Secret key: "set it to the production secret key, the generated `beech_sk_live_…` value you stored on the
    BeechCMS Worker with `npx wrangler secret put BEECH_SECRET_KEY`. The API refuses `beech_sk_dev` outside
    development."
  - Publishable key: "set it to the `BEECH_PUBLISHABLE_KEY` value in the BeechCMS Worker's `wrangler.jsonc` `vars`.
    It is read-only and public by design."

### T1 — Fact-check section "legacy key names"

Why: the brief requires that no page names a key the code does not recognize. A check keeps the docs from drifting
back. It runs where the docs are already checked (`docs:check`, `docs:build`).

New `scripts/lib/legacy-key-names.mjs`. Header: copy the 3-line BUSL header of `scripts/lib/changed-line-coverage.mjs`.
TypeDoc/JSDoc on each export. Verbatim:

```js
/** Names and values of the 0.10.x key model. Neither the runtime nor @beechcms/client recognizes them. */
export const LEGACY_KEY_PATTERNS = [
  /\bPUBLIC_(?:READ|WRITE)_API_KEY\b/dg,
  /\bdev-(?:public-)?(?:read|write)-key-changeme\b/dg,
  /\b[A-Z_]*BEECH_(?:READ|WRITE)(?:_API)?_KEY\b/dg,
  /\bbeech_pub_/dg,
  /createBeech(?:Browser|Server)?Client(?:<[^>]*>)?\(\s*\{[^}]*?\b(apiKey)\s*:/dg,
]

/** Sections that may name the legacy model: they document the migration away from it. */
/**
 * [REWORK] Prose in the docs site's own sources (copyable LLM prompts, hero text) names the option without a factory
 * call, so the `apiKey` pattern above cannot see it. Applied only to paths under `docs/.vitepress/`, where no
 * third-party `apiKey` (Resend, VirusTotal) appears.
 */
export const LEGACY_KEY_SITE_PATTERNS = [/apiKey/dg]

export const LEGACY_KEY_ALLOWED_SECTIONS = [
  { file: 'docs/build/cli-workflows.md', heading: '#### Moving a 0.10.x project to publishable and secret keys' },
  { file: 'CHANGELOG.md', heading: '### Upgrading from 0.10.x' },
]

/**
 * @param {string} relPath repo-relative path with forward slashes
 * @param {string} content file content
 * @returns {{ line: number, match: string }[]}
 */
export function findLegacyKeyMentions(relPath, content)
```

Behaviour of `findLegacyKeyMentions`:
- Runs every pattern over the whole content. **[REWORK]** When `relPath` starts with `docs/.vitepress/`, it also runs
  `LEGACY_KEY_SITE_PATTERNS`; the match text is `apiKey` and the line is where it starts. Patterns are global, so reset `lastIndex` or use `matchAll`. A pattern
  with a capture group (the `apiKey` one) reports the group: its text is `apiKey`, and its line is the line where
  `apiKey` starts (`match.indices[1]`). The others report the whole match.
- `line` is 1-based. LF and CRLF content give the same line numbers.
- Drops a mention whose line falls inside an allowed section of the same `relPath`. A section starts at a line equal
  to `heading` (after trimming trailing whitespace) and ends before the next heading of the same or a higher level
  (`#` count ≤ the allowed heading's), or at end of file. A line inside a fenced code block (between ```` ``` ````
  fences) is never a heading. The allowance is per file: the same heading in another file allows nothing.
- Returns mentions sorted by line, then by column. Pure: no I/O, no throw, same input → same output.

Edit `scripts/docs-fact-check.mjs`: add section `6. Fact-Checking key model names (publishable / secret)` after
section 5 (`L313`) and before the summary. Copy the shape of section 5:
`header(...)`, a `failuresBefore` counter, then `success(...)` when nothing failed.
- Files: `getMarkdownFiles(DOCS_DIR)` plus `resolve(ROOT_DIR, 'CHANGELOG.md')` plus, **[REWORK]**, every `.vue`, `.ts` and
  `.mts` file under `docs/.vitepress/theme` and `docs/.vitepress/config.mts` (a small recursive walk; skip `dist`, `cache`,
  `node_modules`). `getMarkdownFiles` cannot be reused: it returns only `.md` files and skips `.vitepress`.
- `relPath` = `relative(ROOT_DIR, file)` with `\` replaced by `/`. On Windows `relative` returns backslashes, and
  without the replacement the allowed sections would never match.
- One `error()` per mention, in the form
  `` `${relPath}:${line}: legacy key name "${match}". Use BEECH_PUBLISHABLE_KEY / BEECH_SECRET_KEY (publishableKey / secretKey).` ``
- Success: `` `No legacy key names in ${count} files (migration sections excepted).` `` (the count now includes the theme files).

Test `scripts/lib/legacy-key-names.test.mjs` (unit, `node:test` `describe`/`it` + `node:assert/strict`, BUSL header
as the sibling tests, fixtures are inline string literals, four zones per `it()`). `describe('findLegacyKeyMentions')`:
- each legacy token (`PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY`, `dev-read-key-changeme`,
  `dev-public-write-key-changeme`, `NEXT_PUBLIC_BEECH_READ_KEY`, `VITE_BEECH_READ_KEY`, `BEECH_WRITE_API_KEY`,
  `beech_pub_`) on line 2 of a page is reported once with line 2 and its own text (array-driven matrix).
- `apiKey:` on the third line of a multi-line `createBeechServerClient<AppRegistry>({ … })` call is reported as
  `apiKey` on line 3.
- `apiKey` outside a client factory (`createResendProvider({ apiKey: env.RESEND_API_KEY })`, `<BeechForm apiKey="x" />`)
  is not reported.
- the new names (`BEECH_PUBLISHABLE_KEY`, `BEECH_SECRET_KEY`, `beech_pk_dev`, `beech_sk_dev`, `publishableKey`,
  `secretKey`, `NEXT_PUBLIC_BEECH_PUBLISHABLE_KEY`) yield an empty list.
- `PUBLIC_READ_API_KEY` under the cli-workflows migration heading is not reported, and the same token after the
  following `### 2. Database Migrations` heading is reported.
- a `# comment` line inside a fenced bash block under `### Upgrading from 0.10.x` in `CHANGELOG.md` does not end the
  section: a token after it is not reported.
- the migration heading in `docs/start/first-project.md` allows nothing: the token under it is reported.
- CRLF content reports the same line numbers as the LF version.
- **[REWORK]** the sentence "…with baseUrl and apiKey." in `docs/.vitepress/theme/components/LlmPromptNode.vue` is
  reported as `apiKey` on its line.
- **[REWORK]** "…with baseUrl and publishableKey (browser) or secretKey (server)." in the same path yields an empty list.
- **[REWORK]** a bare `apiKey` in `docs/features/email-module.md` (`apiKey: env.RESEND_API_KEY`, outside a client factory) is
  still not reported: the site pattern does not apply outside `docs/.vitepress/`.

### T2 — Regenerate the TypeDoc reference

Why: `docs/api/@beechcms/client/interfaces/BeechClientConfig.md` documents an interface the client no longer exports,
with `apiKey`. MCP serves that folder to agents.

Run `pnpm docs:generate` from the repo root. Keep the whole regenerated tree: about 91 files differ, including
unrelated drift in `core` and `cli` built up since the last regeneration. That drift is expected and is not reviewed
line by line. Never hand-edit a file under `docs/api`. If `typedoc` reports errors, stop and reject (step 1 of the
execution contract). Warnings are fine (there are 2 today).

### T3 — Framework guides and start pages

Why: the guides are the first-run path in the brief's user story, and each one currently throws in the client.

Per guide, edit the env block (`L41-42`; Nuxt `L44-47` and `L55-56`), the note under it (`L45` where present), the
factory call (`L70-71`; SvelteKit `L71-72`; Hono `L85-86`; Nuxt `L84-87`) and the "Production API Keys" bullet
(`astro.md:180`, `hono.md:174`, `nextjs.md:204`, `nuxt.md:164`, `react.md:168`, `remix.md:148`, `sveltekit.md:147`,
`vue.md:177`). Use the shared vocabulary.

- **astro, nextjs, remix, sveltekit, hono** keep `createBeechServerClient`. `apiKey` → `secretKey`, env
  `BEECH_SECRET_KEY=beech_sk_dev`. Why: their client modules are server-only (`src/lib/server/`, `.server.ts`, no
  public prefix), and that is where the secret belongs. The note under the env block says that `beech_sk_dev` is the
  local secret key every new project has in `.dev.vars`, and that the variable must stay server-only. Hono's note
  says `npx wrangler secret put BEECH_SECRET_KEY` for the frontend Worker.
- **react, vue** keep `createBeechBrowserClient`. `apiKey` → `publishableKey`, env `VITE_BEECH_PUBLISHABLE_KEY=beech_pk_dev`.
  The note at `L45` says that `beech_pk_dev` is the publishable key every new project has in `wrangler.jsonc`, and that
  it is read-only and safe in the bundle.
- **nuxt** switches `plugins/beech.ts` (`L65`, `L84-87`) from `createBeechServerClient` to `createBeechBrowserClient`
  (import from `@beechcms/client/browser`) with `publishableKey: config.public.beechPublishableKey`, and renames the
  runtime config key and env var as in the vocabulary. Why: a plugin without the `.server` suffix runs in the browser,
  and `runtimeConfig.public` is shipped to it. A server client there would bundle the secret key. The guide only reads
  (`$beech.collection(...)` at `L104-115`), so nothing is lost. Reword "typed server client" (`L62`) to "typed browser
  client".
- `docs/start/first-project.md:190-193`: `apiKey: 'dev-read-key-changeme'` → `secretKey: 'beech_sk_dev'`, comment
  `// BEECH_SECRET_KEY from .dev.vars (local only; read it from the environment in real code)`. Comment line 190 →
  `// Initialize the Beech client with baseUrl and secretKey`.
- `docs/start/index.md:61`: `apiKey` → `publishableKey: process.env.NEXT_PUBLIC_BEECH_PUBLISHABLE_KEY!`.

**[REWORK]** `docs/.vitepress/theme/components/LlmPromptNode.vue:56`: replace "with baseUrl and apiKey." with "with baseUrl
and publishableKey (browser) or secretKey (server)." Change nothing else in the component or in the sibling prompt text
(`HomeHero.vue` has no key mention).

Fact-check section 2 already verifies the guides' imports against the built client exports, so the Nuxt switch is
checked automatically.

### T4 — `docs/reference/client-sdk.md`

Why: the brief requires the roles table and the browser warning here.

- `L15`: "administrative authentication" → "secret-key authentication".
- `L16`: replace `BeechClientConfig` with `BeechClientBaseConfig`, `BeechBrowserClientConfig`, `BeechServerClientConfig`.
- New section `## Keys and roles` between the "Architecture & Submodule Overview" table and `## Browser Client`
  (`L44`). It contains:
  - a table with the columns Key | Client option | Allows | Configured in | Local value | Use from. Two rows:
    publishable (`publishableKey`, `GET`/`HEAD`/`OPTIONS` reads, `wrangler.jsonc` `vars` (committed),
    `beech_pk_dev`, browser and server) and secret (`secretKey`, reads and writes, `.dev.vars` locally and
    `npx wrangler secret put BEECH_SECRET_KEY` in production with a generated `beech_sk_live_…` value,
    `beech_sk_dev`, server only);
  - one sentence: the key authenticates and the seed authorizes. `allowPublicRead` / `allowPublicPost` /
    `allowPublicEdit` still apply to both keys. Link `/reference/public-api#permission-model`;
  - one sentence: a new project serves `beech_pk_dev` in production too, unless you change `BEECH_PUBLISHABLE_KEY`.
    This is safe because the key is read-only;
  - one sentence: server code that only reads can use the browser client with the publishable key;
  - a `> [!WARNING]` block: never pass the secret key to browser code or to a `NEXT_PUBLIC_` / `VITE_` / `PUBLIC_`
    variable. `createBeechBrowserClient` throws when `publishableKey` starts with `beech_sk_`, and the browser client
    has no `create` / `update` (a compile-time error). The API refuses `beech_sk_dev` outside `ENV=development`
    (403 `public-api-dev-secret-key`);
  - a short "Migrating from `apiKey`" paragraph: `apiKey` was removed. Passing it throws
    `apiKey was removed: pass publishableKey to createBeechBrowserClient` (or `secretKey` / `createBeechServerClient`).
    For the Worker side, link `/build/cli-workflows#moving-a-0-10-x-project-to-publishable-and-secret-keys`.
- `L47`: "read tokens (`PUBLIC_READ_API_KEY`)" → "the publishable key".
- `L57`, `L401`, `L451`: `publishableKey: process.env.NEXT_PUBLIC_BEECH_PUBLISHABLE_KEY!`.
- `L61-62` note: `baseUrl` and `publishableKey` are required non-empty strings. Omitting one, passing `apiKey`, or
  passing a `beech_sk_` value throws when the client is created.
- `L295`: `secretKey: process.env.BEECH_SECRET_KEY!`.
- `L299-300` note: requests sent with the secret key skip the Time-Trap and honeypot checks. Seed flags still apply.
  Anonymous browser forms use `@beechcms/forms-react` with no key (keep the link).

### T5 — `public-api.md`, `error-model.md`, `environments.md`

Why: these pages state the contract (statuses, problem types, variables). They must match `public-key-auth.ts`
exactly.

`docs/reference/public-api.md`:
- `L21-28`: heading `### Level 2 — Key Roles & Zero-Secret Mode`. Item 1 becomes a two-row table (publishable
  `BEECH_PUBLISHABLE_KEY`: `GET`/`HEAD`/`OPTIONS`; secret `BEECH_SECRET_KEY`: every method, server only), plus
  local values and the four denials listed in "Runtime facts" (status + problem type each, plus the warning log for
  the dev guard, which never prints the key). Then one line: the key authenticates, Level 1 still authorizes. Item 2
  (zero-secret) stays. Add `GET /api/v1/public/health` and the Time-Trap token to its list, and state that a key sent
  on `POST /add` is checked: a publishable key gets 403.
- `L139`: "Requires `allowPublicRead: true` and the publishable or the secret key."
- `L181`, `L208`, `L238`, `L292`, `L341`: `X-API-Key: beech_pk_dev`.
- `L402`, `L458`, `L512`: `X-API-Key: beech_sk_dev`.
- `L451`: "Send `X-API-Key` with the secret key (`beech_sk_dev` locally). A publishable key answers 403
  `public-api-secret-key-required`."
- `L501`: "Requires `allowPublicEdit: true` and the secret key."

`docs/reference/error-model.md` (`L38-39`, table rows, keep the columns):
- `public-api-not-configured`, 403: "The key the request needs is not configured (`BEECH_SECRET_KEY` for writes, no
  key at all for reads)".
- add `public-api-secret-key-required`, 403: "A publishable key was sent for a write; writes need the secret key".
- add `public-api-dev-secret-key`, 403: "The local secret key `beech_sk_dev` was sent while `ENV` is not
  `development`".

`docs/manage/environments.md`:
- `L74-75`: replace with `BEECH_PUBLISHABLE_KEY` (Recommended: read-only key for `/api/v1/public/*`, lives in
  `wrangler.jsonc` `vars`, local `beech_pk_dev`, safe in browsers) and `BEECH_SECRET_KEY` (Required for public writes:
  reads and writes, a secret (`.dev.vars` / `wrangler secret put`), local `beech_sk_dev`, refused outside
  `ENV=development`).
- `L76`: "Requests authenticated with the secret key are not affected", and the value lives in `.dev.vars` locally
  and in the secret store in production.
- `L103-104` (`.dev.vars` sample): replace both lines with `BEECH_SECRET_KEY=beech_sk_dev`. Under the block, add one
  sentence: the publishable key is not a secret and lives in `wrangler.jsonc` `vars`
  (`"BEECH_PUBLISHABLE_KEY": "beech_pk_dev"`).
- `L122-135` (production block): add `npx wrangler secret put BEECH_SECRET_KEY --env production`,
  `PUBLIC_TIME_TRAP_SECRET` and `PRIVACY_MASTER_KEY` lines in the page's existing `--env production` style. Under the
  block, add: projects created with `npx @beechcms/cms` have no `env` block, so they drop `--env production`; the
  secret key value is `beech_sk_live_` + 32 hex characters (same generator as `keys-migrate.ts:327`); and
  `PRIVACY_MASTER_KEY` is set once and never replaced (link `../build/field-policies.md#master-key-provisioning`).

### T6 — `forms.md`, `backrefs.md`, `cli-workflows.md` row

- `docs/features/forms.md:64`, `:93`: delete the `apiKey` line in both examples. After the Quick Start block, add a
  `> [!NOTE]`: forms need no key. The schema read and the submission are zero-secret and protected by the Time-Trap
  token. Do not set `apiKey`: the publishable key is refused on submissions (403 `public-api-secret-key-required`),
  and the secret key must never reach a browser. Do not edit the `@beechcms/forms-react` code.
- `docs/features/backrefs.md:205-209`: keep `@beechcms/client/server`. Use
  `secretKey: process.env.BEECH_SECRET_KEY!` and change the import comment to
  `// browser: @beechcms/client/browser with publishableKey`.
- `docs/build/cli-workflows.md:24`: replace "Removes the old key names (`PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY`)
  and the committed secrets from `wrangler.jsonc`" with "Removes the 0.10.x key names and the committed secrets
  from `wrangler.jsonc`". Do not edit the migration subsection (`L78-88`): the fact-check allows it.

### T7 — `CHANGELOG.md`

Why: the brief requires an upgrade section with the command and the rotation warning. The ROADMAP's "Aggiornare da
0.10.x" becomes `### Upgrading from 0.10.x`, because the changelog is written in English.

New section above `CHANGELOG.md:3`: `## Publishable and secret keys — unreleased`. Copy the style of the section below
it (one intro paragraph, bold lead-ins, issue numbers in prose). Content:
- Intro: two key roles replace the per-method keys. Fixes #995, #996, #997. Ships with `api`, `client`, `cli` and `cms`.
- `### Breaking`: the Worker reads only `BEECH_PUBLISHABLE_KEY` and `BEECH_SECRET_KEY`. The client takes
  `publishableKey` (browser) / `secretKey` (server), and `apiKey` throws. The browser client refuses `beech_sk_…`. New
  403 problem types `public-api-secret-key-required` and `public-api-dev-secret-key`, and the dev secret key is
  refused outside `ENV=development`. New projects keep `JWT_SECRET`, `BEECH_SECRET_KEY`, `PUBLIC_TIME_TRAP_SECRET`
  and `PRIVACY_MASTER_KEY` in `.dev.vars`, and `vars` holds only `ENV`, `CORS_ORIGINS`, `BEECH_PUBLISHABLE_KEY` and
  `APP_URL`.
- `### Upgrading from 0.10.x` (the only changelog section where legacy names may appear):
  1. `npx beech keys:migrate` in a fenced bash block, then what it does, in one sentence (same facts as
     `cli-workflows.md:83`).
  2. The rotation warning: the old values are in the git history and must be treated as compromised. The command
     writes fresh `JWT_SECRET` and `PUBLIC_TIME_TRAP_SECRET`, every session ends, and it never rewrites history.
  3. Production order: `npm run deploy` first (Cloudflare error 10053), then `npx wrangler secret put` for
     `JWT_SECRET`, `BEECH_SECRET_KEY`, `PUBLIC_TIME_TRAP_SECRET`. Never set a new `PRIVACY_MASTER_KEY`.
  4. Client code: `apiKey` → `publishableKey` with `createBeechBrowserClient`, or `secretKey` with
     `createBeechServerClient`, and rename the env vars as in `client-sdk.md`.
  5. Known limit: writing with the secret key still needs `allowPublicPost` on the seed (#1022).
- `### Fixed`: the first documented request no longer fails (local keys are fixed values and the docs use them); one
  `createBeechServerClient` instance reads and writes; public add/edit no longer answer 500 on seeds with relations;
  `beech setup:cloudflare` merges the R2 credentials into `.dev.vars` instead of overwriting it; `beech init` shows
  the publishable key and reports only whether the secret key is set, and it flags legacy names.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

From the repo root, in order:

```bash
pnpm --filter @beechcms/client build          # fact-check section 2 imports the dist
pnpm docs:generate                            # T2: turbo build + typedoc, 0 errors
node --test scripts/lib/legacy-key-names.test.mjs
node --test scripts/lib/*.test.mjs
pnpm docs:check                               # [REWORK] now also scans docs/.vitepress/theme; must print DOCUMENTATION FACT-CHECK PASSED, section 6 green
pnpm --filter @beechcms/cli test              # cli-docs-parity still green after the T6 row edit
pnpm --filter @beechcms/mcp build             # rebuilds packages/mcp/resources from the edited docs
pnpm docs:build                               # typedoc + fact-check + vitepress build
pnpm lint
graphify update .
```

Closing greps (each must return nothing):

```bash
git grep -n -E "PUBLIC_(READ|WRITE)_API_KEY|changeme|BEECH_(READ|WRITE)(_API)?_KEY|beech_pub_" -- docs ':!docs/Sprints' ':!docs/build/cli-workflows.md'
grep -rn -E "PUBLIC_(READ|WRITE)_API_KEY|changeme|BEECH_(READ|WRITE)(_API)?_KEY|beech_pub_" packages/mcp/resources --include=*.md | grep -v "build/cli-workflows.md"
git grep -n -w "BeechClientConfig" -- docs ':!docs/Sprints'
git grep -n -w "apiKey" -- docs/.vitepress ':!docs/.vitepress/dist'
```

(`changeme` appears in docs only inside the legacy key values today. Checked 2026-11-25.) `git diff --stat -- apps
packages bin` must show only the sprint 02/03 files already in the tree.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `pnpm docs:check` prints section 6 green, and adding `PUBLIC_READ_API_KEY` to any page outside the two allowed
      sections makes it exit 1 with `<path>:<line>: legacy key name "PUBLIC_READ_API_KEY"`. Check by hand, then
      revert.
- [ ] `findLegacyKeyMentions`, `LEGACY_KEY_PATTERNS` and `LEGACY_KEY_ALLOWED_SECTIONS` match SECTION 4 verbatim.
      The module has no I/O. The test file has the BUSL header, four zones per `it()`, and no conditional
      assertions or randomness.
- [ ] Every framework guide, `first-project.md` and `start/index.md` uses only the shared vocabulary: server guides
      `createBeechServerClient` + `secretKey` + `BEECH_SECRET_KEY`, React/Vue/Nuxt `createBeechBrowserClient` +
      `publishableKey`. No key fallback in code, and no secret key in a public variable.
- [ ] `client-sdk.md` has the "Keys and roles" table, the browser warning and the `apiKey` migration note.
- [ ] `public-api.md` and `error-model.md` list the four denials with the statuses and problem types of
      `public-key-auth.ts`. Read examples send `beech_pk_dev`, and write examples send `beech_sk_dev`.
- [ ] `environments.md` documents `BEECH_PUBLISHABLE_KEY` / `BEECH_SECRET_KEY`. The production block covers
      `BEECH_SECRET_KEY`, `PUBLIC_TIME_TRAP_SECRET` and `PRIVACY_MASTER_KEY`.
- [ ] No page claims that the publishable key is generated in production.
- [ ] `CHANGELOG.md` has `## Publishable and secret keys — unreleased` with `### Upgrading from 0.10.x` naming
      `npx beech keys:migrate`, the rotation warning and the deploy-then-secret order.
- [ ] `docs/api` is the unedited output of `pnpm docs:generate`, and `BeechClientConfig.md` is gone.
- [ ] `packages/mcp/resources` (after the mcp build) contains no legacy key name outside `build/cli-workflows.md`.
- [ ] **[REWORK]** `LlmPromptNode.vue:56` names `publishableKey` / `secretKey` and no `apiKey`; `git grep -w apiKey` under
      `docs/.vitepress` (without `dist`) is empty.
- [ ] **[REWORK]** fact-check section 6 scans the theme sources: putting `apiKey` back in `LlmPromptNode.vue` makes
      `pnpm docs:check` exit 1 with `docs/.vitepress/theme/components/LlmPromptNode.vue:<line>: legacy key name "apiKey"`.
      Check by hand, then revert. The new unit tests cover it.
- [ ] Every SECTION 5 command passes, and the closing greps are clean.
- [ ] No change in `apps/`, `packages/*/src`, `bin/` or `packages/forms-react` from this sprint.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- Any runtime, client, CLI or scaffolder code change. If a doc cannot be made true without one, reject the plan.
- `@beechcms/forms-react` code: the `apiKey` prop, `examples/ClientiTestPage.tsx:19` (`beech_sk_dev` default). This is
  a known follow-up with no roadmap row. Only `features/forms.md` changes.
- Generating a production publishable key (scaffold or `keys:migrate`). The code ships `beech_pk_dev` in `vars`, and
  the docs describe that, nothing more.
- The `--env production` style of the existing lines in `environments.md` (RESEND, WEBHOOK, QSTASH). Only the note
  for scaffolded projects is added.
- Separating "this key may write" from `allowPublicPost` (#1022): documented as a known limit, not changed.
- A new docs page, the VitePress sidebar, READMEs. `docs/.vitepress/theme` is out of scope **except** `LlmPromptNode.vue:56`
  (T3); no other theme file is edited.
- Hand edits under `docs/api` or `packages/mcp/resources`.
- Releasing or bumping versions. The release follows ROADMAP "Note di rilascio".
