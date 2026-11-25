# Sprint Plan — ScaffoldSecrets (publishable & secret keys, sprint 02)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, row 02. Feature brief:
`stages/00_ideation/output/feature_brief.md` (issue #995, #996, #997). Sprint 01 (`KeyRoleRuntime`) shipped in
`3ad0b738` + `e280c5bd`. Its archive is `docs/Sprints/KeyRoleRuntime/`. The shared decisions table in the ROADMAP
(binding names, local values, prefixes) is fixed and is not renegotiated here.

### Pre-Computation Analysis

**Graph refresh:** `graphify update . --force` → 33031 nodes, 48143 edges, 3168 communities (2026-11-24).

**a) God Nodes (via `graphify explain`)**

The scaffolder and the CLI commands are leaf code. None of the nodes this sprint edits is a god node. The relevant
high-degree nodes are the ones the smoke test drives over HTTP. Their code does not change:

| Node | Source | Degree | Why it matters here |
|---|---|---|---|
| `createBeechApp()` | `apps/api/src/factory.ts:L106` | 180 | Serves the scaffolded worker (`worker.ts` → `createBeechApp({ seeds: [] })`). It registers `apiKeyMiddleware()` at `factory.ts:246`. Unchanged. |
| `authorizePublicKey()` | `apps/api/src/public/middleware/public-key-auth.ts:L45` | — | The runtime contract the scaffold must satisfy: `BEECH_PUBLISHABLE_KEY` reads, `BEECH_SECRET_KEY` everything, `beech_sk_dev` accepted only with `ENV=development`. Unchanged. |
| `main()` (scaffolder) | `bin/create.mjs:L157` | — | The only caller of `buildWranglerJsonc()` and `buildDevVars()`. |
| `setupCloudflare()` | `packages/cli/src/commands/setup-cloudflare.ts:L25` | 8 | Today it **overwrites** `.dev.vars` (`L161-172`). Once the secrets live there, that overwrite wipes them (see T4). |

**b) Architectural boundaries affected**

- `@beechcms/core`: **no change**.
- `apps/api`: **no change**. The runtime already reads only `BEECH_PUBLISHABLE_KEY` / `BEECH_SECRET_KEY` (sprint 01).
  Secrets that move from `vars` to `.dev.vars` (`JWT_SECRET`, `PUBLIC_TIME_TRAP_SECRET`) are read from `c.env` the same
  way in both cases (`auth-providers.middleware.ts:23-32`, `public-add.ts:253`, `public-routes.ts:22`).
- `apps/dashboard`: **untouched**.
- Scaffolder (`bin/`): `template.mjs`, `create.mjs`. Tests in `scripts/lib/` (node:test, run by CI at
  `.github/workflows/test.yml:31`).
- `packages/cli`: `commands/init.ts`, `commands/forms.ts`, `commands/setup-cloudflare.ts`, and one new lib file,
  `lib/dev-vars.ts`.
- Release smoke: `scripts/smoke-release.mjs` (CI job "Scaffold smoke", `test.yml:39-58`, budget 300 s).

**c) `graphify affected` impact analysis**

```
graphify affected "buildWranglerJsonc" --depth 2
- create.mjs [imports] / main() [calls]        bin/create.mjs:L1, L157
- template.test.mjs [imports]                  scripts/lib/template.test.mjs:L1

graphify affected "buildDevVars" --depth 2
- create.mjs / main()                          bin/create.mjs:L1, L157
- template.test.mjs                            scripts/lib/template.test.mjs:L1

graphify affected "echoApiKeys" --depth 2       (node id commands_init_init for init())
- init() -> cmdInit()                          packages/cli/src/commands/init.ts:L101, packages/cli/bin/beech.mjs:L123
- index.ts [re_exports]                        packages/cli/src/index.ts:L4 (named export `init` only)
- dbMigrate()/dbReset()/ClientiTestPage.tsx   INFERRED edges, name collisions on "init": checked by grep, no call

graphify affected "commands_setup_cloudflare_setupcloudflare" --depth 2
- cmdSetupCloudflare()                         packages/cli/bin/beech.mjs:L288
- index.ts [re_exports]                        packages/cli/src/index.ts:L34
- setup-cloudflare.test.ts                     packages/cli/src/test/setup-cloudflare.test.ts:L5

graphify affected "getReactTemplate" --depth 2  (same for getVue/getSvelte/getVanillaTemplate)
- forms() -> cmdForms()                        packages/cli/src/commands/forms.ts:L652, bin/beech.mjs:L261
- forms.test.ts                                packages/cli/src/test/forms.test.ts:L5

graphify path "init()" "authorizePublicKey()"
- 5 hops, only through the cli index barrel and an INFERRED canonicalStringify edge: no real coupling.
  The CLI never imports apps/api, and it must not start now.
```

Breaking-change census. Grep for `PUBLIC_READ_API_KEY|PUBLIC_WRITE_API_KEY|dev-read-key-changeme|NEXT_PUBLIC_BEECH_WRITE_KEY|publicReadKey|publicWriteKey`,
excluding `docs/`, `stages/`, `CHANGELOG.md` and `graphify-out/`. It finds 6 files: `bin/create.mjs`, `bin/template.mjs`,
`scripts/lib/template.test.mjs`, `packages/cli/src/commands/{init,forms}.ts`, and
`apps/api/src/public/middleware/api-key-middleware.test.ts`. The last one is the intended "legacy bindings alone" case
from sprint 01 and stays. After this sprint the grep returns exactly that one file. No external consumer imports the
scaffolder builders.

### VETO Audit

| Rule (`_config/ponytail_arch.md`) | Assessment |
|---|---|
| 1. YAGNI | Two string constants and one list in the scaffolder, one 2-function lib in the CLI (`parseDevVars`, `upsertDevVars`), and the rest are edits. **Rejected inside this audit:** a `beech keys:generate` command (the summary prints a `node -e` one-liner instead); a JSONC comment in the generated `wrangler.jsonc` (the existing test parses it as JSON, and the `.dev.vars` header carries the warning); legacy-name detection in `beech init` (it belongs to sprint 03, which owns the migration; added to that roadmap row); generating production key values at scaffold time (they would land in a terminal or a file); refactoring `ensurePrivacyMasterKey` onto the new lib (its never-overwrite semantics differ from upsert, and it works). |
| 1. YAGNI (scope addition) | `setup-cloudflare` merge (T4) is **not** in the original roadmap row. It is required: after T1, `.dev.vars` holds `JWT_SECRET`, `BEECH_SECRET_KEY` and `PUBLIC_TIME_TRAP_SECRET`, and `setup-cloudflare.ts:171` replaces the whole file. One `beech setup:cloudflare` run would break local login and secret-key writes. It also regenerates nothing but deletes `PRIVACY_MASTER_KEY`, which violates brief rule 7. The ROADMAP row is updated. |
| 2. Botanical invariant | No D1 query anywhere. The smoke test creates its seed through `POST /api/seeds` (`features/seeds/seeds.handler.ts:112`, the dashboard's own path), so DDL goes through core's planners. It reads and writes content only through `/api/v1/public/*`. No physical table or column is named. |
| 3. VSA | No `apps/api` or `apps/dashboard` file changes. Inside `packages/cli`, `lib/dev-vars.ts` is shared by two commands, which is the existing `lib/` pattern (`lib/wrangler.ts` is shared the same way). No command imports another command. The CLI does not import `apps/api` for `beech_pk_dev` / `beech_sk_dev`: the constants stay local per package, as sprint 01 decided for `@beechcms/client`. |
| 4. Cloudflare purity | No new binding, no migration. Local secrets go in `.dev.vars` (wrangler loads it automatically), production secrets in `wrangler secret put`. The CLI prints those commands and runs none of them (brief §5). |
| 5. Minimal blueprint | 1 new source file, 3 new test files, the rest are edits. Tiers: scaffolder + CLI + release script. Runtime tiers untouched. |

**Verdict: APPROVED.** The setup-cloudflare scope addition is accepted (necessary, not speculative). HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 01 changed the runtime. A project scaffolded today still writes `PUBLIC_READ_API_KEY` / `PUBLIC_WRITE_API_KEY`,
which the runtime no longer reads. So a fresh `npx @beechcms/cms` project answers 403 `public-api-not-configured` to
every keyed request, and it commits `JWT_SECRET` and the anti-bot secret in `wrangler.jsonc` (#995). This sprint makes
the scaffold match the runtime:

- **File layout is the contract for sprint 03.** `keys:migrate` must produce exactly the layout a fresh scaffold has:
  `vars` = `ENV`, `CORS_ORIGINS`, `APP_URL`, `BEECH_PUBLISHABLE_KEY`; `.dev.vars` = `JWT_SECRET`, `BEECH_SECRET_KEY`,
  `PUBLIC_TIME_TRAP_SECRET`, `PRIVACY_MASTER_KEY` (+ R2 credentials). It has to exist before the migration can target it.
- **First request works (#996).** `beech_pk_dev` reads and `beech_sk_dev` writes. The release smoke test proves it on
  the packed tarballs, which makes it the first end-to-end check of sprint 01 outside the monorepo.
- **No secret in the first commit (#995).** A test scaffolds, then checks that no `.dev.vars` value appears anywhere in
  the commit.
- **Everything that writes or reads these files moves together:** `beech init` (reports keys and never prints the
  secret), `beech setup:cloudflare` (merges R2 values instead of wiping the file), and `beech forms` (browser templates
  send no key, because a publishable key on `/add` now gets 403).

VSA and Botanical Engine: no runtime code changes. The scaffolder and CLI are outside the slices. The smoke test uses
only public HTTP surfaces.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Scaffolder** (`bin/create.mjs` → `bin/template.mjs`):

- `create.mjs:214-217` generates `jwtSecret` (32 bytes), `publicReadKey`, `publicWriteKey` (16 bytes) and
  `timeTrapSecret` (32 bytes) through `generateSecret()` (`L40-42`, `randomBytes` import at `L9`). It passes them to
  `buildWranglerJsonc()` (`L236-247`).
- `template.mjs:52-60`: `vars` holds `ENV`, `JWT_SECRET`, `CORS_ORIGINS`, `PUBLIC_READ_API_KEY`,
  `PUBLIC_WRITE_API_KEY`, `PUBLIC_TIME_TRAP_SECRET` and `APP_URL`. Everything in it is committed.
- `template.mjs:86-108`: `buildDevVars(cloudflare)` writes the R2 block (credentials when `cloudflare` is set, a comment
  otherwise) plus `PRIVACY_MASTER_KEY`, generated **inside** the builder (`L87`). That is the pattern this sprint copies
  for the other secrets.
- `create.mjs:249`: `.gitignore` = `.wrangler`, `node_modules`, `.dev.vars`, `dist`. `create.mjs:271-280`:
  `git init`, `add -A`, `commit`. If anything fails it prints "Git skipped" and carries on.
- `create.mjs:282-303`: the "Next steps" note. It says "JWT secret and API keys have been auto-generated" (`L300`) and
  lists only the R2 `wrangler secret put` commands (`L296`).
- `--yes` / non-TTY → non-interactive, `cloudflare = null` (`L159-172`). `--no-install` skips `npm install` (`L255`).
- Deploy script: `wrangler deploy --minify --var ENV:production` (`template.mjs:28`).

**Runtime it must satisfy** (sprint 01, unchanged): `public-key-auth.ts:12-13` (`DEV_PUBLISHABLE_KEY = 'beech_pk_dev'`,
`DEV_SECRET_KEY = 'beech_sk_dev'`) and `authorizePublicKey()` (`L45-73`). `apiKeyMiddleware` skips `POST /:seed/add`
(`api-key-middleware.ts:18`). `publicAddHandler` treats a missing key as an anonymous Time-Trap submission and sends a
present key to `authorizePublicKey` (`public-add.ts:170-177`). So a browser form that sends the publishable key on `/add`
gets 403 `public-api-secret-key-required`. Public middleware order (`factory.ts:244-246`): `schemaRevisionMiddleware`
→ `publicRateLimitMiddleware` → `apiKeyMiddleware`. Not touched.

**CLI**:

- `init.ts:15-36`, `echoApiKeys()`: reads `wrangler.jsonc` `vars`, prints the legacy names masked as first 4 + `****` +
  last 4. `init.ts:83-92`: a missing `.dev.vars` is "optional: only needed for production R2 credentials". After this
  sprint that is false, because the file holds the auth secret.
- `init.ts:42-57`, `ensurePrivacyMasterKey()`: never overwrites a non-empty value. Unchanged.
- `setup-cloudflare.ts:161-172`: builds a fresh 4-line R2 `.dev.vars` and `writeFileSync`s it over the existing file.
  Only the interactive branch reaches it. `setup-cloudflare.test.ts` covers only the non-interactive path.
- `forms.ts`: all four templates take an `apiKey` prop/attribute and spread `X-API-Key` into the `/add` request. React:
  `L24,32,70` (headless) and `L160,169,207` (styled). Vue: `L316,321,363`. Svelte: `L432,440,479`. Vanilla: `L555,609`
  (`api-key` attribute). React defaults to `process.env.NEXT_PUBLIC_BEECH_WRITE_KEY`.
- CLI test idiom: vitest, `packages/cli/src/test/<subject>.test.ts`, MIT header (`// SPDX-License-Identifier: MIT` + one
  copyright line, as every file in the package has), `node:fs` mocked at the top (`forms.test.ts:8-34`).
- `.dev.vars` parsing: none in `packages/cli/src/lib`. `stripJsonc()` is at `lib/wrangler.ts:166`.

**Seed creation for the smoke test:** `POST /api/seeds` (`seeds.handler.ts:112`), admin bearer token, plain JSON body.
It needs `slug` (`SLUG_RE`, lowercase/underscore), `label`, `branches[]` (each `alias`, `label`, `type`; ids minted
server-side, `L136-137`) and `displayNameAlias` (inferred from the first text branch if absent). Policy flags:
`allowPublicRead`, `allowPublicPost` (`packages/core/src/engine/types.ts:260-262`). The dashboard creates seeds the same
way (`apps/dashboard/src/features/seed-builder/api/seeds.api.ts:28`). Public add with a secret key needs no Time-Trap
token, returns 201 `{ id }`, and the entry is listed by `GET /api/v1/public/:seed` as `{ data: [...], meta: { total } }`
(proven by `public-key-roles.integration.test.ts:82-91`).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

| File | Change |
|---|---|
| `bin/template.mjs` | Edit: new exported constants, `buildWranglerJsonc` drops secrets, `buildDevVars` writes all local secrets (T1). |
| `bin/create.mjs` | Edit: no secret generation, new "Next steps" note (T2). |
| `scripts/lib/template.test.mjs` | Edit: fix the `buildWranglerJsonc` call, add layout cases, add SPDX header (T1). |
| `scripts/lib/create.test.mjs` | **New**: scaffolds for real and checks the first commit and the printed output (T2). |
| `packages/cli/src/lib/dev-vars.ts` | **New**: `parseDevVars`, `upsertDevVars` (T3). |
| `packages/cli/src/test/dev-vars.test.ts` | **New** (T3). |
| `packages/cli/src/commands/init.ts` | Edit: key report from `vars` + `.dev.vars`, `.dev.vars` required locally (T3). |
| `packages/cli/src/test/init.test.ts` | **New** (T3). |
| `packages/cli/src/commands/setup-cloudflare.ts` | Edit: merge R2 values into `.dev.vars` (T4). |
| `packages/cli/src/commands/forms.ts` | Edit: every template drops the key (T5). |
| `packages/cli/src/test/forms.test.ts` | Edit: one matrix case (T5). |
| `scripts/smoke-release.mjs` | Edit: new "public API keys" step (T6). |
| `stages/01_sprint_planning/output/backlog/ROADMAP.md` | Already updated by this planning run (row 02 scope, row 03 gains init legacy detection). Do not edit. |

No runtime code, no docs, no migration, no dashboard.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### T1 — `bin/template.mjs`: split public configuration from local secrets

Why: brief rule 2. The builder already generates `PRIVACY_MASTER_KEY` internally (`L87`), so every local secret is
generated in the same place, and `create.mjs` no longer touches secret values at all.

New exports, placed after the imports (verbatim, because `create.mjs` and both test files depend on them):

```js
/** Local Public API keys. Public by design: the same in every scaffolded project and in the docs. */
export const DEV_PUBLISHABLE_KEY = 'beech_pk_dev'
export const DEV_SECRET_KEY = 'beech_sk_dev'

/** Secrets the worker reads in production. `.dev.vars` holds their local values; the order is the order the scaffolder prints. */
export const PRODUCTION_SECRETS = ['JWT_SECRET', 'BEECH_SECRET_KEY', 'PUBLIC_TIME_TRAP_SECRET', 'PRIVACY_MASTER_KEY']
```

Signatures (JSDoc on the existing functions):

```js
/**
 * @param {{ name: string, d1Name: string, d1Id: string, r2Bucket: string, corsOrigins: string, appUrl?: string }} cfg
 */
export function buildWranglerJsonc(cfg)

/**
 * @param {null | { r2AccessKey: string, r2SecretKey: string, r2Endpoint: string, r2Bucket: string }} cloudflare
 */
export function buildDevVars(cloudflare)
```

Rules:

- `buildWranglerJsonc`: `vars` contains exactly `ENV` (`"development"`), `CORS_ORIGINS`, `BEECH_PUBLISHABLE_KEY`
  (`DEV_PUBLISHABLE_KEY`) and `APP_URL`, in that order. `jwtSecret`, `publicReadKey`, `publicWriteKey` and
  `timeTrapSecret` disappear from `cfg`. The output stays valid plain JSON (no comments), because the tests
  `JSON.parse` it. Everything outside `vars` is unchanged.
- `buildDevVars`: the file opens with a 2-line header comment: the file is git-ignored and must never be committed,
  and production sets each value with `npx wrangler secret put <NAME>`. Then come three blocks, each with a one-line
  comment: `JWT_SECRET` (fresh 32 random bytes, hex), `BEECH_SECRET_KEY=` + `DEV_SECRET_KEY` (comment: server-only,
  reads and writes, refused outside `ENV=development`), and `PUBLIC_TIME_TRAP_SECRET` (fresh 32 random bytes, hex).
  After them, the existing R2 block (credentials or explanatory comment, unchanged) and the existing
  `PRIVACY_MASTER_KEY` block, unchanged. Every `PRODUCTION_SECRETS` name appears exactly once as a `NAME=value` line.
  The output still ends with `\n`.
- Each call generates fresh values. Never a constant, never shared between the JWT and the Time-Trap secret.

Tests — `scripts/lib/template.test.mjs` (node:test, pure, no filesystem). Add the BUSL-1.1 three-line SPDX header from
`_config/testing_conventions.md` Rule 1.2 on top (the file is in the diff, and sprint 01's review made a missing header
blocking).

- Edit `'a deploy runs as production, a local run as development'` (`L42-50`): the `buildWranglerJsonc` argument drops
  the four removed fields. Assertions unchanged.
- `it` "wrangler.jsonc vars carry only ENV, CORS_ORIGINS, BEECH_PUBLISHABLE_KEY and APP_URL": `Object.keys(vars)`
  deep-equals that list, and `vars.BEECH_PUBLISHABLE_KEY === DEV_PUBLISHABLE_KEY`.
- `it` ".dev.vars defines every production secret, with the dev secret key and 64-hex JWT and Time-Trap secrets, with
  and without Cloudflare credentials": a matrix over `[null, cloudflareFixture]` (one shared arrangement, Rule 1.6).
  Each `PRODUCTION_SECRETS` name matches `^NAME=.+$` (multiline) exactly once. `BEECH_SECRET_KEY` equals
  `DEV_SECRET_KEY`. `JWT_SECRET` and `PUBLIC_TIME_TRAP_SECRET` match `^[0-9a-f]{64}$`. `cloudflareFixture` is a literal
  `{ r2AccessKey, r2SecretKey, r2Endpoint, r2Bucket }`, the input shape `askCloudflareConfig` returns
  (`create.mjs:143-152`).
- `it` "two builds generate different JWT and Time-Trap secrets, and the two differ from each other": regression guard
  against a hardcoded secret (comment it as such, Rule 6.2.4).
- Existing `PRIVACY_MASTER_KEY` / R2 case (`L52-56`): unchanged.

### T2 — `bin/create.mjs`: no secret generation, summary without the secret key

Why: after T1 the scaffolder handles no secret value, so there is nothing it could print by mistake.

- Delete `generateSecret()` (`L40-42`), the `randomBytes` import (`L9`), and the four variables at `L214-217`.
  The `buildWranglerJsonc` call (`L236-247`) passes only `name, d1Name, d1Id, r2Bucket, corsOrigins, appUrl`. Import
  `DEV_PUBLISHABLE_KEY` and `PRODUCTION_SECRETS` from `./template.mjs`.
- `.gitignore` (`L249`) and the git block (`L271-280`): unchanged.
- "Next steps" note (`L282-303`), rewritten from these rules:
  - Keep the "Start the project" block as it is.
  - New "Public API keys" block: the publishable key printed **in full** (`DEV_PUBLISHABLE_KEY`, public by design;
    browser and server, read only; it lives in `wrangler.jsonc`), plus one line saying the secret key (server only,
    reads and writes) is in `.dev.vars`. That line names the file and never prints the value.
  - "When you are ready to deploy" block: keep the D1/R2 lines. Add one `npx wrangler secret put <NAME>` line per
    `PRODUCTION_SECRETS` entry, iterated from the constant, never a second hand-written list. After them, three notes:
    use fresh values, not the local ones; the secret key starts with `beech_sk_live_`, and the API refuses
    `beech_sk_dev` outside development; set `PRIVACY_MASTER_KEY` once and never change it after data is stored. Then
    one generator line:
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep the R2 secret line and
    `npm run deploy`.
  - Delete the footer "JWT secret and API keys have been auto-generated." (`L300`). Replace it with: "Local secrets
    are in .dev.vars, which git ignores."
- The interactive path (`askCloudflareConfig`) is unchanged.

Tests — new `scripts/lib/create.test.mjs` (node:test). It is a process-level test of the real CLI, because the
first-commit contract only exists after `git commit` runs. It spawns a process and writes a temp directory, which
`scripts/lib/publish-manifest.test.mjs` already does (`spawnSync('npm', ...)`, `mkdtempSync`). Say so in a 3-line
docblock under the BUSL SPDX header (Rule 6.4).

Arrangement, in `before` (one scaffold, read-only afterwards, Rule 3.2's expensive-immutable exception):

- `mkdtempSync(join(tmpdir(), 'beech-create-'))`. Spawn `process.execPath` with
  `[<ROOT>/bin/create.mjs, 'first-commit-app', '--yes', '--no-install']`, `cwd` = the temp dir.
- Git isolation, so the result does not depend on the developer's or the CI machine's git config. Pass env
  `GIT_CONFIG_GLOBAL=<empty file in the temp dir>`, `GIT_CONFIG_NOSYSTEM=1`, and `GIT_AUTHOR_NAME`,
  `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL` set to fixed literals. Comment why: a global
  `commit.gpgsign` or a missing identity turns the commit into "Git skipped", and the test would then check nothing.
- Keep `stdout + stderr` and the `.dev.vars` entries, parsed in the test with `/^([A-Z][A-Z0-9_]*)=(.+)$/gm`. The test
  cannot import the CLI's TypeScript parser across packages.
- `after`: `rmSync(recursive, force)`.

`it()` list:

- "the scaffolder exits 0 and its first commit tracks wrangler.jsonc and .gitignore but not .dev.vars":
  `git -C <project> ls-files` contains the first two and not `.dev.vars`. Also assert that the exit status is 0 and
  that `git rev-parse HEAD` succeeds, so a skipped commit fails loudly.
- "no value from .dev.vars appears in any file of the first commit": the precondition is that the parsed entries
  cover every `PRODUCTION_SECRETS` name (non-vacuous). For each value, `git -C <project> grep -F -q -e <value> HEAD`
  exits 1. Drive it from the entries array. Regression guard comment: `wrangler.jsonc` used to commit `JWT_SECRET`
  and the anti-bot secret (#995).
- "the scaffolder output names every production secret but prints none of the .dev.vars values": the output contains
  `wrangler secret put <NAME>` for each `PRODUCTION_SECRETS` entry and does not contain any parsed `.dev.vars` value
  (this includes `beech_sk_dev`).

### T3 — `packages/cli`: `.dev.vars` helpers and the `beech init` key report

Why: `init` must report the secret key, which now lives in `.dev.vars`, without printing it. `setup-cloudflare` (T4)
needs a non-destructive write. Two callers justify one small lib file.

New `packages/cli/src/lib/dev-vars.ts` (MIT header like the rest of the package). Signatures verbatim:

```ts
/** Parses `.dev.vars` (dotenv subset): `KEY=value` lines; blank lines and `#` comments are ignored. */
export function parseDevVars(content: string): Record<string, string>

/**
 * Sets each entry in `.dev.vars` content: an existing `KEY=` line keeps its position and gets the new value,
 * a missing key is appended at the end. Every other line is kept byte for byte.
 */
export function upsertDevVars(content: string, entries: Record<string, string>): string
```

Rules:

- `parseDevVars`: split on `/\r?\n/`. A key is `^[A-Za-z_][A-Za-z0-9_]*` before the first `=`, with leading
  whitespace allowed. The value is everything after the first `=`, trimmed, with one pair of matching surrounding
  `"` or `'` removed. When a key appears twice, the last one wins. Lines that are not `KEY=...` are ignored. It never
  throws.
- `upsertDevVars`: use CRLF when the input contains `\r\n`, LF otherwise. Replace a key on its first occurrence. Append
  missing keys in `entries` order, preceded by one blank line when the content is non-empty. The result always ends
  with exactly one line ending. With empty input, the output is only the entries.

`init.ts` changes:

- Replace `echoApiKeys(configPath)` (`L15-36`) with `echoKeys(configPath, devVarsPath)`. It reads `wrangler.jsonc`
  `vars` (through `stripJsonc`, as now) and, if the file exists, `.dev.vars` through `parseDevVars`. It prints
  `keyReportLines(...)` under a "Public API keys:" header, followed by one hint line: "Send a key in the X-API-Key
  header. The publishable key is safe in browser code; the secret key is not." When the report is empty, it prints
  nothing. A malformed file is skipped silently (keep the existing `catch`). `init()` (`L111`) passes
  `resolve(process.cwd(), '.dev.vars')`.
- New pure export in `init.ts` (named export only; `index.ts:4` re-exports just `init`, so it does not leak into the
  public API):

```ts
export function keyReportLines(input: {
  wranglerVars: Record<string, string>
  devVars: Record<string, string> | null
}): string[]
```

  Rules: if `wranglerVars.BEECH_PUBLISHABLE_KEY` is non-blank, it gets one line with the value in full, plus
  "(wrangler.jsonc, read only, safe in the browser)". If `devVars?.BEECH_SECRET_KEY` is non-blank, it gets one line
  "BEECH_SECRET_KEY = set in .dev.vars (server only, never printed)". If `devVars` is present but the key is blank or
  missing, the line reads "BEECH_SECRET_KEY = missing from .dev.vars: writes answer 403". **No output line contains
  any character run of the secret value**, and no masking scheme is used (presence, not value). If neither key is
  present anywhere (for example a 0.10.x project), it returns `[]`; legacy detection is sprint 03. A
  `BEECH_SECRET_KEY` sitting in `wranglerVars` is never read or printed.
- `checkFiles` (`L83-92`): in local mode a missing `.dev.vars` is now `✗ .dev.vars — missing (required: holds
  JWT_SECRET, BEECH_SECRET_KEY, PUBLIC_TIME_TRAP_SECRET, PRIVACY_MASTER_KEY)` and sets `ok = false`. The present-file
  branch and `ensurePrivacyMasterKey` are unchanged.

Tests:

- New `packages/cli/src/test/dev-vars.test.ts` (vitest unit, pure strings, no fs mock needed, MIT header like its
  siblings). Its `describe` blocks are `parseDevVars` and `upsertDevVars`:
  - `parseDevVars` returns the KEY=value pairs and ignores comments and blank lines.
  - `parseDevVars` keeps `=` inside a value and strips one pair of surrounding quotes.
  - `parseDevVars` parses CRLF content to the same record as LF content.
  - `upsertDevVars` replaces an existing key's value in place and keeps every other line byte for byte.
  - `upsertDevVars` appends missing keys after one blank line, in entries order.
  - `upsertDevVars` keeps CRLF line endings when the input uses them.
  - `upsertDevVars`: an R2 upsert on a scaffolded `.dev.vars` keeps `JWT_SECRET`, `BEECH_SECRET_KEY`,
    `PUBLIC_TIME_TRAP_SECRET` and `PRIVACY_MASTER_KEY` unchanged (regression guard for T4. The fixture is a literal
    in the T1 layout, because the CLI cannot import `bin/`. Comment both points.)
- New `packages/cli/src/test/init.test.ts` (vitest unit, tests `keyReportLines` only, MIT header):
  - The publishable key from `vars` is reported in full.
  - A secret key in `.dev.vars` is reported as set, and no line contains the value. Use a non-dev literal like
    `beech_sk_live_` + 32 hex so a partial mask would also be caught.
  - A missing or blank secret key in `.dev.vars` is reported as missing.
  - A `BEECH_SECRET_KEY` placed in `vars` never appears in any line.
  - With no new-model key anywhere, the result is `[]`.

### T4 — `setup-cloudflare.ts`: merge R2 credentials, never replace `.dev.vars`

Why: brief rule 7 (`PRIVACY_MASTER_KEY` is never overwritten), and after T1 the same file holds the local auth
secrets.

- In the interactive branch (`L161-172`): read the existing `.dev.vars` when `existsSync` reports it (`''`
  otherwise). Write `upsertDevVars(existing, { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME })`.
  The success line becomes "Updated .dev.vars with the R2 credentials (other values kept)." The `wrangler secret put`
  calls for R2 (`L174-196`) are unchanged.
- The non-interactive path and its test (`setup-cloudflare.test.ts`) are unchanged. The merge behaviour is covered by
  the `upsertDevVars` regression case in T3. The interactive wiring needs prompt mocks the suite does not have, and it
  is a 3-line change.

### T5 — `forms.ts`: browser form templates send no key

Why: brief rule 8. Anonymous `/add` with the Time-Trap token is the browser path. Since sprint 01, a publishable key
on `/add` gets 403 (`public-add.ts:173-175`), and a secret key must never reach a browser component.

- In all five outputs (React headless, React styled, Vue, Svelte, Vanilla), remove the `apiKey` prop/field, its
  default (including `NEXT_PUBLIC_BEECH_WRITE_KEY`), the `X-API-Key` header spread and, in Vanilla, the `api-key`
  attribute read (`L555`). Line pointers are in SECTION 2. Add one comment line in each template, above the request
  headers: "Anonymous submission: the Time-Trap token protects it. Never put a Public API key in browser code."
- The Time-Trap fetch, honeypot, body shape and CLI prompts are unchanged.

Tests — `packages/cli/src/test/forms.test.ts` (existing unit suite, existing mocks):

- New `it` "no generated form template sends X-API-Key or accepts a key prop": a matrix over
  `[react/styled, react/headless, vue/styled, svelte/headless, vanilla]`, each through `forms({ ..., yes: true })`.
  Read the content from `vi.mocked(fs.writeFileSync).mock.calls` for that run. Assert it does not contain
  `X-API-Key`, `apiKey`, `api-key` or `BEECH_WRITE_KEY`, and that it does contain `/add` and `timetrap/token` (so the
  check runs on a real template). Clear the mocks between rows.

### T6 — `scripts/smoke-release.mjs`: the documented first requests

Why: brief §4 "Test e verifica": a fresh scaffold read with `beech_pk_dev` → 200, write with `beech_sk_dev` → 201,
write with `beech_pk_dev` → 403. It runs on the packed tarballs, which is what a user installs.

- Constants near `PASSWORD` (`L38`): `PUBLISHABLE_KEY = 'beech_pk_dev'`, `SECRET_KEY = 'beech_sk_dev'`,
  `SMOKE_SEED = 'smoke_notes'`. Comment: these are the values the docs promise, written as literals on purpose, not
  imported from `bin/template.mjs`, so a template typo fails the smoke test.
- Add a new `timed('public API keys', ...)` step after "first admin and login" (`L244-266`) and before the upload
  step. It reuses `globalThis.smokeToken`, the existing `fail()`, and `json()`:
  1. `GET /api/v1/public/timetrap/token` → 200 with a non-empty `token`. This proves `PUBLIC_TIME_TRAP_SECRET` is read
     from `.dev.vars`.
  2. `POST /api/seeds` (bearer) with `{ slug: SMOKE_SEED, label: 'Smoke note', displayNameAlias: 'title',
     allowPublicRead: true, allowPublicPost: true, branches: [{ alias: 'title', label: 'Title', type: 'text' }] }`
     → 201.
  3. `GET /api/v1/public/smoke_notes` with `X-API-Key: PUBLISHABLE_KEY` → 200.
  4. `POST /api/v1/public/smoke_notes/add` with `X-API-Key: SECRET_KEY`, body `{ data: { title: 'From the server' } }`
     → 201.
  5. The same POST with `X-API-Key: PUBLISHABLE_KEY` → 403, and the body's `type` ends with
     `public-api-secret-key-required`.
  6. `GET /api/v1/public/smoke_notes` with the publishable key → `meta.total === 1` and the only title is
     `'From the server'`. This proves the 201 persisted and the 403 wrote nothing.
  Each failure message names the step, the status and the first 200 characters of the body, in the style of `L256`.
- Update the file docblock (`L3-8`) to mention the key checks.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root, in order:

```bash
node --test scripts/lib/template.test.mjs scripts/lib/create.test.mjs scripts/lib/publish-manifest.test.mjs
pnpm --filter @beechcms/cli type-check
pnpm --filter @beechcms/cli test
pnpm --filter @beechcms/cli build
pnpm lint
pnpm lint:tests
pnpm beech test --diff
pnpm build
node scripts/smoke-release.mjs --budget-seconds 300
graphify update .
```

Closing greps (each must give exactly the stated result):

1. `git grep -l -E "PUBLIC_READ_API_KEY|PUBLIC_WRITE_API_KEY|dev-read-key-changeme|NEXT_PUBLIC_BEECH_WRITE_KEY|publicReadKey|publicWriteKey" -- . ':!docs' ':!stages' ':!CHANGELOG.md' ':!graphify-out'`
   → exactly `apps/api/src/public/middleware/api-key-middleware.test.ts`.
2. `git grep -n -E "X-API-Key|apiKey|api-key" -- packages/cli/src/commands/forms.ts` → no hits.
3. `git grep -n -E "JWT_SECRET|PUBLIC_TIME_TRAP_SECRET|BEECH_SECRET_KEY" -- bin/template.mjs` → hits only in
   `PRODUCTION_SECRETS` and inside `buildDevVars`, none inside `buildWranglerJsonc`.

Manual check (once, report the result in the execution log): `node bin/create.mjs demo --yes --no-install` in a temp
folder. Open `demo/wrangler.jsonc` and `demo/.dev.vars`, and read the printed note. Confirm that the secret key and
the generated values are not on screen.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] A fresh scaffold's `wrangler.jsonc` `vars` holds exactly `ENV`, `CORS_ORIGINS`, `BEECH_PUBLISHABLE_KEY`
      (`beech_pk_dev`), `APP_URL`.
- [ ] Its `.dev.vars` defines `JWT_SECRET` and `PUBLIC_TIME_TRAP_SECRET` (fresh 64-hex each), `BEECH_SECRET_KEY=beech_sk_dev`,
      `PRIVACY_MASTER_KEY` (64-hex), and the R2 block as before.
- [ ] `.dev.vars` is git-ignored, and no `.dev.vars` value appears in any file of the first commit (`create.test.mjs`
      green, commit actually made).
- [ ] The scaffolder prints the publishable key, never the secret key or any other `.dev.vars` value, and prints a
      `wrangler secret put` line for every `PRODUCTION_SECRETS` name.
- [ ] `create.mjs` generates no secret (`randomBytes` and `generateSecret` gone from it).
- [ ] The release smoke test passes within 300 s: Time-Trap token 200, publishable read 200, secret write 201,
      publishable write 403 `public-api-secret-key-required`, exactly one entry persisted.
- [ ] `beech init` prints the publishable key and only the presence of the secret key. No output line contains the
      secret value. A missing `.dev.vars` fails the local check.
- [ ] `beech setup:cloudflare` (interactive) keeps every non-R2 line of an existing `.dev.vars`.
- [ ] No `beech forms` template sends `X-API-Key` or accepts a key prop/attribute.
- [ ] `parseDevVars` / `upsertDevVars` have the exact signatures in T3. `keyReportLines` is not re-exported from
      `packages/cli/src/index.ts`.
- [ ] Every new or edited test file has its SPDX header (BUSL in `scripts/lib`, MIT in `packages/cli` as its siblings).
      No conditional assertion, every case passes alone.
- [ ] Every SECTION 5 command passes. The three closing greps give the stated results.
- [ ] `apps/api`, `apps/dashboard`, `packages/core`, `packages/client`: `git diff --stat` empty.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **`beech keys:migrate`**, and legacy-name detection in `beech init` for 0.10.x projects → ROADMAP row 03
  (`KeysMigrate`). Do not add a stub or a hint for it here.
- **Docs**: framework guides, `first-project.md`, `public-api.md`, `client-sdk.md`, `environments.md` (including how
  to give production its own `beech_pk_live_` publishable key), `CHANGELOG.md`, `docs-fact-check.mjs`,
  `packages/mcp/resources` → ROADMAP row 04 (`KeyModelDocs`). The CLI and package READMEs are docs too.
- **Any runtime change** in `apps/api` (middleware, handlers, error copy, `wrangler.jsonc`, `.dev.vars.example`) and
  in `packages/client`. Sprint 01 owns them, and they are frozen.
- **`packages/forms-react`**: the `apiKey` prop in `useBeechForm` / `types.ts:86` and the `beech_sk_dev` default in
  `examples/ClientiTestPage.tsx:19`, which puts a secret key in browser example code. Not in any roadmap sprint. Report
  it to the user as a follow-up. Do not touch it.
- `ensurePrivacyMasterKey` refactor, `.gitignore` pattern changes (`.dev.vars*`, `.env*`), a JSONC comment in the
  generated `wrangler.jsonc`, a `beech keys:generate` command, writing to the production secret store from any
  command except the existing R2 calls in `setup-cloudflare`.
- The `allowPublicPost` requirement for secret-key writes (#1022). The smoke seed sets the flag explicitly.
- The pre-existing failure in `scripts/dev-cli/__tests__/endpoints.test.ts` and the uncommitted
  `scripts/dev-cli/endpoints.ts` change in the working tree: not this sprint's, do not touch or stage them.
- Committing: the stage contract leaves commits to the human.
