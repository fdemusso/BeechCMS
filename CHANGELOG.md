# Changelog

## Bug fixes & hardening — unreleased

Follow-up fixes and hardening across the Public API, client SDKs, forms, CLI, MCP, and dashboard.

### Breaking

- **Client**: removed the no-op `validate` option on `list()`, which previously did nothing (#1000).

### Fixed

**API & Public API**
- Public API now answers `404` consistently for private seeds and unpublished entries without leaking other seed slugs (#1015).
- Anonymous public add now defaults to `draft` (while respecting `defaultPublicStatus`), and secret-key writes skip `allowPublicPost` (#1022).
- Public edit leaves `status` unchanged unless the request explicitly sets it, preventing concurrent publishes from being overwritten (#1018).
- Content `PUT /api/content/:slug/:id` leaves `status` unchanged unless the body sends one, preventing concurrent publishes from being overwritten (#1049).
- Public `operation-not-allowed` `403` errors now name the seed flag to enable (#1007).
- Public reads send the same `Cache-Control` on cache miss and hit, with the 60s edge cache window documented (#1017).
- `beech db:migrate` / `bootstrap-d1` now tracks applied migrations in `d1_migrations` and applies pending migrations on an already-initialized local DB (#967).
- RBAC agent intent summaries now resolve and name the account, role, and scope instead of showing raw IDs, and `invitations.create` / `invitations.regenerate` are now `destructive` so OAuth callers require human approval in every environment (#979).

**Client & Search (`@beechcms/client`, `@beechcms/search-client`)**
- Non-JSON `2xx` responses now return an `invalid-response` problem instead of `{ data: null, error: null }` (#998).
- Schema drift check compares `X-Schema-Revision` against a `schemaFingerprint` passed in the client config instead of an empty stub (#999).
- `SearchClient` now sends the publishable key on index and embed requests and reports embed failures (#1009).

**Forms (`@beechcms/forms-react`)**
- Refreshes the single-use time-trap token after answered submits and before expiry (#1013).
- Maps per-field API validation errors onto the corresponding form fields (#1014).
- Replaces the hardcoded Italian loading text with translations and adds accessible draft-dismiss and error references (#1011).
- Keeps classified fields out of local `localStorage` drafts and expires saved drafts (#1010).

**MCP, CLI & Dashboard**
- MCP adds intent readback and `awaiting_result` resilience for clients without form elicitation (#1027).
- OAuth consent screen deduplicates access presets and groups domain permissions (#968).
- Seed builder preserves `defaultPublicStatus` when saving a seed (#1041).
- Quick-start and framework guides drop the reserved `slug` branch (#1023), and `npx` specs pin `@latest` to avoid stale cached versions (#1024).

## Publishable and secret keys — unreleased

Two key roles replace the per-method keys of the Public API: a read-only **publishable** key that is safe in a browser, and a **secret** key for server code. Fixes #995, #996 and #997. Ships with `api`, `client`, `cli` and `cms`.

### Breaking

- **The Worker reads only `BEECH_PUBLISHABLE_KEY` and `BEECH_SECRET_KEY`.** The client takes `publishableKey` (browser) or `secretKey` (server), and passing `apiKey` throws. The browser client refuses `beech_sk_…` values.
- **Two new 403 problem types**: `public-api-secret-key-required` (a publishable key on a write) and `public-api-dev-secret-key` (`beech_sk_dev` while `ENV` is not `development`). The dev secret key is refused outside `ENV=development`.
- **New projects keep their secrets in `.dev.vars`**: `JWT_SECRET`, `BEECH_SECRET_KEY`, `PUBLIC_TIME_TRAP_SECRET` and `PRIVACY_MASTER_KEY`. `vars` in `wrangler.jsonc` holds only `ENV`, `CORS_ORIGINS`, `BEECH_PUBLISHABLE_KEY` and `APP_URL`.

### Upgrading from 0.10.x

1. Run the migration from the project root:

   ```bash
   npx beech keys:migrate
   ```

   It removes `PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY`, `JWT_SECRET` and `PUBLIC_TIME_TRAP_SECRET` from the `vars` of `wrangler.jsonc`, adds `BEECH_PUBLISHABLE_KEY` there, and writes `JWT_SECRET`, `BEECH_SECRET_KEY` and `PUBLIC_TIME_TRAP_SECRET` to `.dev.vars`.
2. **Treat the old values as compromised.** They are in the git history. The command writes fresh `JWT_SECRET` and `PUBLIC_TIME_TRAP_SECRET` values, so every session ends, and it never rewrites history.
3. **Production order:** run `npm run deploy` first (Cloudflare refuses a secret whose name is still a plain-text var, error 10053), then `npx wrangler secret put` for `JWT_SECRET`, `BEECH_SECRET_KEY` and `PUBLIC_TIME_TRAP_SECRET`. Never set a new `PRIVACY_MASTER_KEY`.
4. In client code, replace `apiKey` with `publishableKey` and `createBeechBrowserClient`, or with `secretKey` and `createBeechServerClient`, and rename the env vars as in the [client SDK reference](/reference/client-sdk#keys-and-roles).

### Fixed

- The first documented request no longer fails: local keys are fixed values (`beech_pk_dev`, `beech_sk_dev`) and the docs use them.
- One `createBeechServerClient` instance reads and writes.
- Public add and edit no longer answer 500 on seeds with relations.
- `beech setup:cloudflare` merges the R2 credentials into `.dev.vars` instead of overwriting it.
- `beech init` shows the publishable key and reports only whether the secret key is set, and it flags legacy names.

## First run in minutes — unreleased

A new project now goes from nothing to a working admin in two commands, with no Docker and no Cloudflare account: `npx @beechcms/cms my-app`, then `npm run dev`. Fixes #1019, #1020 and #1021. Ships as a minor bump of `cms`, `cli` and `api`.

### Highlights

- **`npm run dev` applies the migrations.** It runs `wrangler d1 migrations apply --local` and then serves the API and dashboard on `http://localhost:8789`; the first admin is created at `/admin`. `beech onboard` is no longer needed.
- **Media uploads work locally.** With only the `MEDIA_BUCKET` binding (wrangler emulates R2), the dashboard falls back to uploading through the Worker. No S3 credentials, no MinIO.
- **The scaffolder installs the project's dependencies** (`--no-install` skips it).
- **A release smoke test.** `scripts/smoke-release.mjs` packs the packages, installs the scaffolder from its tarball, scaffolds a project, installs it with plain npm, type-checks the worker, runs `npm run dev`, creates the admin and uploads an image. It runs in the release pipeline (skip with `--skip-smoke`) and as a CI job; the whole path takes about a minute.

### Breaking

- **The `beech` bin moves from `@beechcms/cms` to `@beechcms/cli`.** Scaffolded projects now depend on `@beechcms/cli`. A project that lists `@beechcms/cms` only to get `beech` must depend on `@beechcms/cli` instead. `@beechcms/cms` keeps a single `cms` bin (`npx @beechcms/cms`); the `@beechcms/cms` and `beechcms` bin aliases are gone.
- **`beech onboard` is removed, and `beech init` no longer touches the database** (`--db`, `--db-name`, `--yes` are gone). Both applied an embedded copy of `0000_v040_base.sql` and never the later migrations. Use `npm run db:migrate:local` or `beech db:migrate`. `beech update` now runs `beech db:migrate` instead of `init --db`.
- **`beech seed:load`, `seed:create`, `validate` and `build` are removed.** They only printed a notice.
- **Monorepo-only commands leave the published CLI**: `dev`, `dev:stop`, `dev:reset`, `dev:tunnel`, `mailpit:clear`, `logs`, `test`, `lint`, `doctor` and `reset` need this repository (Docker stack, Turborepo, test tiers). They run through `pnpm beech` (`scripts/beech.mjs`); `npx beech dev` outside the repository now reports an unknown command.
- A scaffolded project's `deploy` script passes `--var ENV:production`, and `wrangler.jsonc` sets `ENV` to `development` locally. `ENV` decides dev-only behaviour (relaxed rate limits, reset links in responses), so a deploy must say it is production.

### Fixed

- `npx @beechcms/cms` aborted on a clean machine: the published manifest carried the monorepo's `postinstall` (`node scripts/check-docker.mjs`) without shipping the script, and the same hook ran again on the new project's `npm install` (#1019). `@beechcms/cms` is now published from a staging directory with a whitelisted manifest: no scripts, no devDependencies.
- The first `npm install` of a scaffolded project failed with `ERESOLVE`: the template pinned `@cloudflare/workers-types@^4` against the `wrangler@^4.100` the CLI installs (#1020). The template now takes `wrangler` and `workers-types` from the ranges the CLI and API are built against, and the `@beechcms/*` ranges from the versions being released.
- The scaffolded `tsconfig.json` pulled in `lib.dom`, which clashes with `workers-types`; it now sets `lib: ["ES2022"]`.
- `resolveDbName` stripped `//` inside JSON strings, so `"APP_URL": "http://localhost:5173"` broke the parse and the CLI silently fell back to `beech-db` (#1021). It now reads JSONC string-aware (comments and trailing commas), and throws when a config exists but names no D1 database. Only a missing config falls back to the default.
- On Windows, a project path past about 130 characters pushes wrangler's local D1 file over the 260 character limit and wrangler answers `internal error`. The scaffolder warns about long folders and `beech db:migrate` explains the failure.
- Storage messages: a `MEDIA_BUCKET` binding alone no longer logs a warning in development (it warns once in production, where uploads need S3 credentials), and the unconfigured-storage messages no longer point at the monorepo's MinIO stack.
- The dashboard setup checklist hinted `npx beech init --db --local` and `npx beech seed:load --local`; both are gone. The first now says `npm run db:migrate:local`, the second hint is dropped.

### Internal

- `bin/create.mjs` is split: the template builders live in `bin/template.mjs`, the dependency ranges in `scripts/lib/template-versions.mjs` (shipped as `bin/template-versions.json`). The root keeps `@beechcms/api`, `core` and `cli` as devDependencies so a release cascade republishes the scaffolder.
- The monorepo command tests moved to `scripts/dev-cli/__tests__/commands` and now run in CI (`pnpm test:dev-commands`); they were never wired in before. `docs-fact-check` covers both command tables.

## MCP 2.0 — 2026-11-23

`@beechcms/mcp@2.0.0` turns the MCP server from a set of schema tools into an **agent control plane**: an agent can see who it is and what it may do, search the whole operation catalog, and ask the owner to approve anything destructive or publishing, without ever approving for itself. Released with `core`, `api`, `cli`, `widget-sdk` and `cms` at `0.10.1`. Base: `@beechcms/mcp@1.2.0`. Two migrations (`0045`, `0046`).

### Highlights

- **Agent intents** — destructive requests, and publishes in production, made by an OAuth agent are no longer refused with `403 confirmation_required`. The API stores them as an intent (`agent_intents`, migration `0046`), answers `202`, and runs the stored request once the owner approves. Intents expire after 10 minutes.
- **New MCP tools** — `beech_whoami`, `beech_search`, `beech_intents` and `beech_confirm` sit next to the existing schema tools. `beech_confirm` shows one dialog built from the intents the server stored, so an agent cannot reword what the owner approves.
- **Script SDK and `beech run`** — a typed SDK over the operation catalog (`@beechcms/cli/sdk`) and a runner for scripts kept in the project.
- **Measured** — an eval harness runs eight tasks against `@beechcms/mcp@1.2.0` and the working tree: **v1 passes 2 of 8, v2 passes 8 of 8**.

### Breaking

- **OAuth scopes v2** (migration `0045`). Grants issued under the 1.x scopes are dropped once, so every MCP client signs in again after upgrading.
- Agent requests that used to receive `403 confirmation_required` now receive `202` with a pending intent. Clients must treat `202` as "waiting for the owner", not as success.
- `agent:approve` is held only by `beech-mcp`. Other OAuth clients, including the CLI, cannot approve intents.

### Added

**MCP** (`@beechcms/mcp`)
- `beech_whoami`: client, frozen scopes, environment policy and schema version, from the new `GET /api/agent/session`.
- `beech_search`: finds operations in the catalog by what they do.
- `beech_intents` and `beech_confirm`: list pending intents and ask the owner. Decline, cancel, an unsupported client or a failure never approve or reject, and return the dashboard link instead.
- Tool annotations, the real package version in the handshake, and a rewritten `SKILL.md` and README.

**API** (`@beechcms/api`)
- Intent gate after RBAC, with `POST /api/agent/intents/:id/approve` and reject; the stored request replays through the full middleware chain.
- Operation catalog and consent templates for the agent scopes.

**CLI** (`@beechcms/cli`)
- `@beechcms/cli/sdk`: `BeechSdk` covering 108 operations, checked against `OPERATION_CATALOG` in CI. Writes return a `WriteOutcome` (executed, pending intent or dry run). Helpers: `listAll`, `uploadFile`, `importFile`, `waitForImport`.
- `beech run <name|path>` runs `.beech/scripts/<name>.ts` and prints a versioned report (`--json`, `--out`, `--dry-run`, `--arg`).
- `beech agent setup` writes the `.mcp.json` entry, the agent skill, a scripts README and an example script. It is idempotent and never overwrites without `--force`.

**Dashboard**
- Pending agent actions section, an intent review dialog, and connected-apps and activity updates.

**Docs**
- MCP server reference rewritten, a local-agent guide, the confirm dialog `Decision` field, and `ifMatch` for `layout.update` / `layout.reset` (#976).

### Fixed

- `beech_confirm`: a `200` with an unreadable body on approve no longer aborts the loop and hides intents already executed. It is reported as an error item and the rest are still decided.
- Dashboard: a table wider than 2200px no longer stretches the app shell and leaves a gap on the left.
- Dashboard: one icon list for registry, validation and docs (#978, #980).

## 0.10 — 2026-11-23

Covers work on `devs` not yet on `master` (2026-11-04 → 2026-11-20, ~60 commits, 5 locale files, 2 migrations). Base: `core@0.9.9`, `api@0.9.11`, `dashboard@0.9.10`.

### Highlights

- **Dashboard UI/UX foundations** — a written design system contract with a token lint, a refreshed palette, an inset sidebar with icon rail, and a rebuilt Settings area and content type editor. Together they set the visual language the 1.0 UI will build on. Not every screen has been moved onto it yet (see [Known gaps](#known-gaps)).
- **Language support** — the dashboard now ships in five languages: English, Italian, **Spanish, German and French** (#963).
- **BeechPal** — command palette with content search, context actions, quick notes and pins.
- **Content type editor** — guided wizard and a redesigned Danger zone, moved to a dedicated Studio page.
- **Settings** — rebuilt from scratch with a searchable sidebar, semantic pages and an activity feed that reads as sentences.

### Languages

- New dashboard languages: **es, de, fr** next to **en** and **it** (`supportedLngs: en, it, es, de, fr`, fallback `en`).
- Keys standardized across the dashboard (#963). Locale files grew from 1,518 to 1,726 keys per language, and every locale has the same keys as `en`, plural forms aside (`es` and `fr` carry extra plural forms).
- Guard rails in tests: every locale must answer the same keys as `en.json`, every key named in source code must exist in `en.json` (no hardcoded-string fallback), interpolation syntax must match, key naming conventions are enforced.
- Translation glossary (`locales/glossary.json`) lists terms that must not be translated (Slug, Seed, Webhook, API, URL, ID, JSON, …) and a test checks they survive translation.
- Settings has a Language page; the language picker and timezone selector announce names correctly to assistive tech.

### Added

**Design system**
- Design system contract (`_config/design_system.html`) and a design-token lint, with rules for motion, chart palette and status tints.
- Applied across `apps/dashboard`: chart palette, coral signal colour, status tints, builder colours, softer light greys, grey active item, firmer input edge.
- `StatusBadge` used for recent content statuses.

**Navigation**
- Inset sidebar with icon rail, shared page layout and faster navigation (#943).
- Collapsible sidebar groups, pinned settings and a toggle with tooltip.
- Studio section between Main and Content.

**BeechPal command palette** (#961)
- Search, actions, notes and pins; new `users.ui_prefs` column (migration `0044`) holds per-user UI preferences, validated against `uiPreferencesSchema` from `@beechcms/core`.
- Single settings registry feeds both the settings dialog and the palette; the content type builder opens from Cmd-K (new / edit).

**Content type editor** (#949)
- Creation wizard (General → Fields → Dashboard) with starter templates, drafts that survive a reload and a live sidebar preview; fields are added by typing a name and picking a type, alias derived from the name.
- Danger zone for stored content types: Maintenance (search index rebuild, orphan columns) and Field operations (rename, change type, drop), with the impact stated up front and server refusals mirrored as disabled options with a reason. Deleting the whole content type is the footer's red button and asks for the slug.
- Field badges: required, localized (translation icon), privacy tier (globe = public).
- Moved out of Settings into a Studio page.

**Settings**
- Discord-style sidebar: families, search, bookmarks that stay unfolded until the parent is clicked again, log out; tabs merged into Preferences and Team.
- My account, Site and Users & roles rebuilt as sections and rows; order Users → Roles → Invitations; Appearance, Language, Notifications, Connected apps and Storage in the same style.
- Photo circle doubles as the change button with a remove back to initials; password fields get the login eye and strength bar.
- Sessions and activity lists scroll after 3 / 5 rows; revoke shows on hover; lists scroll in `ScrollArea` past five rows.
- Dialog fades in over 220 ms and out 20% quicker.

**Activity log**
- Wider action/entity vocabulary and a `logActivity` helper that records request origin; index on entity (migration `0043`).
- Recorded: sign-ins (IP and place), account and settings changes, people, roles, invitations, connected apps, layout, views and automations; trash, purge, restore, publish, discard, import and media deletes are distinct events.
- Recent activity reads as sentences for every kind of event; the dashboard feed only shows content, media and schema work.

**Content views**
- Table: grouped table scrolls inside with sticky headers, groups animated and persisted; redesigned Layout & style settings; column-header context menu; long cells grow to a cap then wrap, with a themed horizontal scroll.
- Kanban: tinted columns, dynamic card height, card display options.
- Relation labels resolved in gallery and kanban card titles.

**Other**
- Demo data: entry timestamps spread over the last week, brand palette for option colours.
- `ContentRepository.exists()`, used by `draftGuard` (#861).
- Docs: BeechPal sprint documents, activity events, settings history, `limitBytes`; contributing guide updated.

### Changed

- **Removed LaTeX/KaTeX formula support** from the rich text editor (#813).
- System seeds (`import_jobs`) are hidden from `GET /api/seeds` and the Content Types page; the seeds router refuses mutation of system seeds by slug (#947).
- Content type dialog: sliding tab underline, directional content animation, 220 ms fade in / 176 ms out; outside click asks before discarding unsaved edits while the close button closes deliberately.
- Charts redraw once after a resize instead of every frame.
- Editor toolbar: one icon family, steady buttons, keycap tooltips; platform-aware shortcut hint (⌘ on macOS, Ctrl elsewhere) and squared `Kbd` keys.
- `core`: `resolveCandidateIds` returns branches with ids (#946).
- Tooling: `pnpm type-check` exits 0 and the husky pre-push type check is workspace-wide (#944, #948, #951); blocking type-check of every package including tests in CI; `fast-uri` 3.1.9.

### Fixed

- Orphan columns: the `<alias>_bidx` blind-index column of a confidential field was reported as orphan and could be dropped from the Danger zone.
- Entry editor: layout ghosts match the real controls; tag remove overlay sized to the chip; the dialog toolbar stays out of the animated wrapper.
- Recent content widget: unused import dropped, statuses use `StatusBadge`.
- Settings: `pnpm type-check` regression, activity endpoint now sends `entity_id`, Users & roles keep their column headers, timezone selector scrolls with `ScrollArea`, password eye swaps instantly.

### Accessibility

- Content type dialog: tabs, lists and footers use native elements and Radix primitives; labels and hints bound to controls; manifest-owned seeds inert instead of only click-proof; field type picker is a `ToggleGroup` with arrow-key navigation.
- Settings: semantic, autofill-friendly My account markup.

### Known gaps

Not yet on the new design language or not finished. Planned before 1.0:

- **Placeholder pages**: Analytics, Scheduled and Create new render a static "this page will…" box with an untranslated English description (`pages/analytics.tsx`, `pages/scheduled.tsx`, `pages/create-new.tsx`).
- **Auth and onboarding** (login, setup, forgot / reset password, accept invite): only small edits so far (~50 lines changed in total), not yet rebuilt in the new style.
- **Rich text editor**: toolbar polish only (icons, tooltips); no redesign.
- **Import / export, drafts, bulk edit**: light touches only (~100 lines changed in total).
