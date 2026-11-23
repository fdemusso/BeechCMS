# Changelog

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
