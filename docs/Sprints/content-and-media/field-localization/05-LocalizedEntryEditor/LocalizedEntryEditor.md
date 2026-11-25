# Sprint: LocalizedEntryEditor

Sprint 5 of 5 of **Field-Level Localization** (roadmap: `backlog/ROADMAP.md`). This is the final sprint of the series.

Sprints 1–4 are archived in `docs/Sprints/` with review PASS. Every write path merges locale dictionaries, the Public API
negotiates the language, and every dashboard read surface shows localized values in the project default language.
Settings → Site → "Content languages" manages `locales` / `defaultLocale`. Two gaps remain, and both are authoring gaps:

1. **The Entry Editor cannot edit a dictionary.** It loads the raw stored value (`useContentEntry`, by design since Sprint 4)
   and hands it to the field inputs. A text input receives `{"it":"Scarpa","en":"Shoe"}` and renders `[object Object]`.
   BlockNote/TipTap receives `{it: doc}`. On save, `prepareSubmissionPayload` sends every branch in `formData`, so the
   object round-trips by accident. There is no way to pick a language, see what is missing, or type a translation.
2. **No UI sets `localized`.** Rollout invariant: until this sprint ships, `localized` is set only through the Seeds API,
   the manifest or MCP.

This sprint ships both together, as the roadmap requires. It adds the Seed Builder "Localized" toggle, one locale switcher
in the Entry Editor header, a per-field fallback indicator with "Copy from default", and a per-language completion counter.
Saves send only the locales the editor touched. **Zero changes under `packages/` and zero under `apps/api/`.** The server
contract (Sprints 1–3) already does everything this UI needs.

A seed with no localized branch edits exactly as it does today. It makes no settings request, the payload is byte-identical,
and nothing new renders.

---

### Pre-Computation Analysis

The graph was refreshed first with `graphify update . --force` (21 664 nodes, 32 770 edges, 2 066 communities). It includes
the Sprint 1–4 working-tree code.

#### a) God Nodes identified via CLI

| Node | Degree | Source | Role in this sprint |
|------|--------|--------|---------------------|
| `useSchema()` | **50** | `apps/dashboard/src/features/shared/hooks/use-schema.ts:L10` | **Not touched.** `useActiveSeed` (editor) and `useLocaleConfig` (Sprint 4) read it. |
| `useEntryEditorDialog()` | **15** | `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx:L166` | The core of the sprint: active locale, touched-locale tracking, per-locale projection, patch payload, slug source, loading gate. |
| `FieldEdit()` | 11 | `apps/dashboard/src/components/fields/FieldEdit.tsx:L15` | **Not touched.** The renderer re-keys it per locale for localized fields, because the TipTap and CodeMirror editors keep internal state and ignore a `null` value (`use-minimal-tiptap.ts:L282`). |
| `useContentList()` | 10 | `apps/dashboard/src/features/content-management/hooks/use-content-list.ts:L22` | Comment only. It primes relation-label **stubs** into `CONTENT_QUERY_KEYS.detail` (carried-in (d)). |
| `useSeedEditorDialog()` | 10 | `apps/dashboard/src/features/seed-builder/hooks/use-seed-editor-dialog.tsx:L26` | **Not touched.** The second `SchemaFormViewModel` implementer. The new VM fields are optional. |
| `resolveLocalizedValue()` / `asLocaleDictionary()` | 7 / 6 | `packages/core/src/engine/localization.ts:L222 / L264` | Consumed, not changed. `asLocaleDictionary` is the editor's only way to read a stored value as a dictionary (a legacy value → `{defaultLocale: value}`). |
| `LayoutRenderer()` | 6 | `apps/dashboard/src/features/entry-editor/renderer/layout-renderer.tsx:L49` | Gains the optional `localization` prop and threads it to `ColumnRenderer`. |
| `useLocaleConfig()` | 6 | `apps/dashboard/src/features/shared/hooks/use-locale-config.ts:L26` | Consumed by the editor hook. Unchanged. It is schema-gated, so a project with no localized seed makes no request. |
| `SchemaFormShell()` | 5 | `apps/dashboard/src/features/entry-editor/renderer/schema-form-shell.tsx:L95` | Renders `vm.headerSlot` (the locale switcher) and passes `vm.localization` to the renderer. |
| `BranchItemRow()` | 4 | `apps/dashboard/src/components/fields/edit/repeater/repeater-branch-item.tsx:L94` | Renders the new `LocalizedOptionsForm`. Every change goes through `withoutIneligibleLocalized`. |
| `PoliciesOptionsForm()` | 4 | `apps/dashboard/src/components/fields/edit/repeater/repeater-branch-options.tsx:L316` | **Not touched.** Its classification change reaches `BranchItemRow`'s wrapped `onChange`, which clears `localized` on confidential/restricted. |
| `useContentEntry()` | 3 | `apps/dashboard/src/features/content-management/hooks/use-content-item.ts:L14` | Refuses to hand a relation-label stub to the editor (carried-in (d)). |

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` | **No** | Zero files. Consumed: `isLocalizedBranch`, `asLocaleDictionary`, `isLocaleCode`, `isRichtextEnvelopeV1`, `LOCALIZABLE_BRANCH_TYPES`, `resolveClassification`, `LocaleConfig`, `Branch`. |
| `apps/api` (all of it) | **No** | Zero files. Create/update/draft merge per locale, `null` clears one locale, implicit `If-Match` on merged updates (`update.ts:L180-184`), Fatal 17, toggling `localized` with existing rows (`seed-localization.integration.test.ts:L111`): all of it has been live since Sprints 1–2. |
| `apps/dashboard/features/entry-editor` | **Yes** | New `lib/localized-form.ts`, new `renderer/locale-switcher.tsx`. Modified: `hooks/use-entry-editor-dialog.tsx`, `renderer/{layout-renderer,layout-elements,schema-form-shell,schema-form-view-model}.ts(x)`. |
| `apps/dashboard/features/content-management` | **Yes** | `hooks/use-content-item.ts` (`isRelationLabelStub`, stub-aware `useContentEntry`). `hooks/use-content-list.ts` (one comment). |
| `apps/dashboard/components/fields` | **Yes** | `edit/repeater/repeater-branch-options.tsx` (`localizationBlocker`, `withoutIneligibleLocalized`, `LocalizedOptionsForm`), `edit/repeater/repeater-branch-item.tsx`. |
| `apps/dashboard/locales/{en,it}.json` | **Yes** | `content.editor.localization.*`, `seedBuilder.branchEditor.localized*`. |
| `apps/dashboard` — `features/{seed-builder,shared,settings,bulk-edit,content-kanban,…}`, `App.tsx` | **No** | The Seed Builder hosts `BranchItemRow` through the `branches` repeater, so it needs no edit. `features/shared` is consumed as-is. |
| `@beechcms/client`, `api-client`, `mcp`, `cli`, `testing` | **No** | Zero files. |

Middleware registration order: **unchanged and not touched** (zero `apps/api` files). The routes this UI calls, with their
permission rules read from `middleware/permission.middleware.ts`:
- `GET /api/settings` → `AUTHED` (L82): every editor can read `locales` / `defaultLocale`.
- `PUT /api/content/:slug/:id`, `POST /api/content/:slug`, `PUT /api/content/:slug/:id/draft`: unchanged content permissions.
  Chain in `factory.ts`: `repositoryMiddleware` → `seedRegistryMiddleware` → storage/queue/auth-providers/rate-limit/observability
  → CORS → security headers → `apiProtected` (`authMiddleware` → `oauthScopeMiddleware` → `permissionMiddleware`) → `draftApp` →
  `backrefsApp` → `contentFeature` (Sprint 4 §b, re-verified: `factory.ts` is not in any working-tree diff since).
- `PUT /api/seeds/:slug` → `LEGACY_ADMIN` (L93). This is the Seed Builder save, and the handler (`seeds.handler.ts:L168`) re-runs
  `validateSeedDefinitions`, which carries Fatal 17.

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "useEntryEditorDialog()" --depth 2
- entry-editor-dialog.tsx / EntryEditorDialog(), entry-editor/index.ts, App.tsx, components/fields/display/relation.tsx,
  ContentListModals.tsx, test/cross-slice/entry-editor.test.tsx, pages/content-list.tsx
$ graphify affected "prepareSubmissionPayload()" --depth 2
- test/cross-slice/entry-editor.test.tsx, entry-editor/test/unit/entry-json-form.test.ts      (signature unchanged)
$ graphify affected "validateEntryJsonFields()" --depth 2
- test/cross-slice/entry-editor.test.tsx, entry-editor/test/unit/entry-json-form.test.ts      (signature unchanged)
$ graphify affected "SchemaFormViewModel" --depth 2
- use-entry-editor-dialog.tsx, schema-form-shell.tsx (+ Props types), test/cross-slice/schema-form-shell.test.tsx,
  use-seed-editor-dialog.tsx, SeedBuilderPage.tsx, use-seed-editor-dialog.test.tsx, entry-editor-dialog.tsx, App.tsx,
  relation.tsx, ContentListModals.tsx, content-list.tsx, entry-editor.test.tsx, entry-json-form.test.ts
$ graphify affected "SchemaFormShell()" --depth 2
- entry-editor-dialog.tsx, SeedBuilderPage.tsx, use-seed-editor-dialog.tsx, schema-form-shell.test.tsx, entry-editor.test.tsx,
  entry-editor/index.ts, seed-builder/index.ts, App.tsx, relation.tsx, ContentListModals.tsx, content-list.tsx
$ graphify affected "BranchItemRow()" --depth 2
- components/fields/index.ts, repeater.tsx, repeater.test.tsx, repeater-branch-options.tsx, registry.ts, layout-elements.tsx,
  layout-renderer.tsx, column-card.tsx, bulk-edit-dialog.tsx, bulk-edit-steps.tsx, kanban-card.tsx, gallery-peek-*.tsx,
  dynamic-columns.tsx, test-fields.tsx          (the index.ts fan-out: they import other symbols from components/fields)
$ graphify affected "useContentEntry()" --depth 2
- use-entry-editor-dialog.tsx / useEntryEditorDialog(), entry-editor-dialog.tsx, entry-editor.test.tsx, entry-editor/index.ts,
  content-list.tsx, entry-json-form.test.ts
$ graphify affected "useLocaleConfig()" --depth 2
- App.tsx, relation-label.ts, relation.tsx, relation-multi.tsx, relation-single.tsx, use-kanban-column-query.ts,
  ContentTrashView.tsx, use-content-list.ts, use-locale-config.test.tsx, app.test.tsx, main.tsx    (consumed, not changed)
$ graphify affected "ColumnRenderer()" --depth 2
- No unique node match (module-private; its only caller is SectionRenderer in the same file)
```

**Breaking-change verdict: none for a seed with no localized branch.**
- **Editor hook.** `localeConfig` is `undefined` whenever the active seed has no localized branch, even if another seed does. Every
  new code path (projection, per-locale write, patch payload, switcher, indicators) is gated on it. The payload is then exactly
  `prepareSubmissionPayload(...)` over all branches, as today. `isSeedLoading` gains `isLocaleConfigPending`, which is `false`
  for such a seed.
- **`SchemaFormViewModel`** gains two **optional** members (`headerSlot`, `localization`). `useSeedEditorDialog` and every test that
  builds a VM compile unchanged. When both are absent, the shell and the renderer produce the same DOM as today.
- **`LayoutRenderer` / `TabSections`** gain an optional prop. `entry-layout-builder-components.test.tsx` and `schema-form-shell.test.tsx`
  are unaffected.
- **`useContentEntry`** returns the query unchanged unless `data` is a relation-label stub (`updated_at === null`). A row from
  `GET /api/content/:slug/:id` always carries `updated_at` (`get.ts:L50` spreads the repository row). The only consumer is the
  editor hook.
- **`BranchItemRow`**: `withoutIneligibleLocalized` returns its argument unchanged unless `localized === true` is illegal. A persisted
  seed can never be in that state (Fatal 17), so editing an existing seed changes nothing unless the owner changes the type or
  classification. The index-based button selectors in `repeater.test.tsx` (`getAllByRole("button")[1]`) are not shifted: the new
  checkbox sits inside the collapsed content and has `role="checkbox"`.
- **`test/cross-slice/entry-editor.test.tsx`** mocks `@/features/shared` as `{ useActiveSeed }`. The hook now also calls
  `useLocaleConfig`, so the mock adds `useLocaleConfig: () => undefined`. That completes the fixture and changes no assertion (§7.10).

**VSA boundary proof:**
```
$ graphify path "useEntryEditorDialog()" "useLocaleConfig()"
  useEntryEditorDialog() --calls--> useActiveSeed() --calls--> useSchema() <--calls-- useLocaleConfig()
  (both in features/shared; the new direct call entry-editor → features/shared is allowed)
$ graphify path "useEntryEditorDialog()" "useContentEntry()"
  useEntryEditorDialog() --calls--> useContentEntry()        (PRE-EXISTING entry-editor → content-management edge; see VETO §2)
$ graphify path "BranchItemRow()" "useLocaleConfig()"
  BranchItemRow() <--re_exports-- index.ts <--imports_from-- test-fields.tsx <--imports_from-- App.tsx --imports--> useLocaleConfig()
  (no direct edge: components/fields stays module-agnostic, and the toggle needs no locale config)
$ graphify path "useSeedEditorDialog()" "SchemaFormShell()"
  useSeedEditorDialog() <--imports-- SeedBuilderPage.tsx --imports--> SchemaFormShell()   (PRE-EXISTING, untouched)
```
Every import added by this sprint points to `@beechcms/core`, `@/features/shared`, `@/components/ui/*`, `@/lib/dynamic-columns`,
or a file in the same slice. No new edge between two slices.

---

### VETO Audit

**1. THE BOTANICAL INVARIANT: no D1 query bypasses `@beechcms/core`.**
- ✅ Zero API or SQL changes. The dashboard writes through the existing `PUT/POST /api/content…` and `PUT /api/seeds/:slug`. The
  server validates (`localizedSchema`, Fatal 17) and merges (`mergeLocalizedFields`) through core, as it has since Sprints 1–2.
- ✅ The dictionary semantics are core's, not the dashboard's. A stored value is read as a dictionary only through core
  `asLocaleDictionary` (a legacy value → default locale, a json object without a registered key → legacy). Eligibility mirrors
  Fatal 17 through core `LOCALIZABLE_BRANCH_TYPES` + `resolveClassification`. The payload is a core `LocalizedPatch`
  (`{locale: value | null}`) that core `toLocalizedPatch` accepts verbatim.
- ✅ No hardcoded field names. Every rule keys on `isLocalizedBranch(branch)`, `branch.type` and `branch.alias` from the seed definition.
- **Rejected alternative: exporting core's private `isEffectivelyEmpty` for "blank" detection.** It treats a richtext doc with only an
  image as empty (`isRichtextDocEmpty` counts text only). Using it to decide "send `null` = clear this locale" would **delete** an
  image-only translation. That is data loss, and brief §2 forbids it. The editor needs a narrower, structural rule: blank means
  exactly the values the editor itself produces for an empty field (`""`, `{}`, a doc made only of empty paragraphs). That rule
  lives in the dashboard (`isBlankEditorValue`), and core stays untouched.

**2. VSA ENFORCEMENT: zero cross-feature imports.**
- ✅ The editor gets the language config from `@/features/shared` (`useLocaleConfig`, Sprint 4). All dictionary logic lives in the
  editor's own `lib/`.
- ✅ The Seed Builder toggle lives in `components/fields` (where `BranchItemRow` and every other branch-option form live) and imports only
  core. It needs no locale config, so there is no new DI slot.
- ✅ The stub fix stays in `content-management`, in the hook that owns the detail key. The editor keeps importing exactly the symbols it
  imports today.
- ⚠️ Pre-existing, **not fixed and not extended**: `entry-editor → content-management` (content hooks), `entry-editor → backrefs`
  (`ReferencedByPanel`), `seed-builder → entry-editor` (`SchemaFormShell`, VM types). This sprint adds no symbol to any of them.
- **Rejected alternative: moving `contentLanguageName` (`features/settings/lib/content-languages.ts`) to `features/shared` so the
  switcher shows language names.** That churns the settings slice and its test for a cosmetic gain. The switcher shows the codes
  (`IT`, `EN`, `PT-BR`), which is compact enough for an editor-header control. Settings keeps showing names.

**3. CLOUDFLARE PURITY.** ✅ No migration, table, KV, queue or background job. No new dependency: the switcher uses the existing
shadcn `Select`.

**4. YAGNI: rejected alternatives.**
- ❌ **VETOED: a completion badge on list surfaces (table, gallery card, kanban card).** Brief §4 asks for an indicator "nella scheda
  dell'articolo", which is the entry's own sheet, i.e. the editor. Sprint 4 resolved list items to flat default-locale data in the
  `select` view, so a list badge would need a second, unresolved pass over every row. The counter lives in the editor's locale switcher
  (`IT 3/3 · EN 1/3`).
- ❌ **VETOED: per-field language tabs or duplicated inputs.** Brief §4: one selector in the header, not per-field controls.
- ❌ **VETOED: machine translation in "Copy from default".** It copies the default-locale value verbatim (brief §5: no built-in MT).
- ❌ **VETOED: a server-side editor mode (`?lang=all` on the authenticated read).** `GET /api/content/:slug/:id` already returns the stored
  dictionaries (Sprint 4 VETO §4). Core `asLocaleDictionary` covers the legacy case client-side.
- ❌ **VETOED: remembering the editor's language per user.** The switcher starts on the default locale for each editor session. Nothing in the
  brief asks for persistence.
- ❌ **VETOED: blocking "disable localization" when the table has entries.** Brief §3: turning localization on or off is metadata-only.
  The toggle shows a warning instead (see §6).

**5. Carried-in decisions (ROADMAP §5).**
- **(a) Never send `null` for an untouched localized field.** Honoured by construction. The editor tracks touched locales per alias
  (`TouchedLocales`), and `buildLocalizedPatch` emits a branch only when at least one locale was touched, as `{[locale]: value | null}`.
  A top-level `null` is never produced, and a cleared locale sends `{[locale]: null}`, which clears that locale only (core `applyLocalizedPatch`).
  Draft saves get the same payload. The draft upsert writes only the columns it receives (`saveDraft`, `content.repository.d1.ts:L1337`),
  and the server bases the merge on draft-or-live (`draft.handler.ts:L143-147`), so omitting a field loses nothing.
- **(b) A blank default must not be stored as a translation.** An untouched locale is never sent. A touched locale whose value is
  `isBlankEditorValue` (`""`, whitespace, `{}` / blank JSON text, a doc of empty paragraphs) is sent as `null`. The empty doc
  `createInitialFormData` seeds on create therefore never becomes an `it` "translation" that would stop the fallback chain.
- **(c) The editor keeps `useContentEntry` (raw dictionaries).** Honoured. It is never routed through `useLocalizeEntryData`.
- **(d) A primed relation-label stub must not be trusted as a complete entry.** Fixed in `content-management`. `isRelationLabelStub`
  recognises the stub (`updated_at: null`, which a real row never has). `useContentEntry` gives it `staleTime: 0`, so mounting the editor
  refetches it, and reports it as `{ data: undefined, isLoading: true }` until the full row lands. The form is therefore never seeded from `{title: label}`.

**6. Disabling localization (brief §3, no data loss).** Unchecking the toggle removes `localized` from the branch. The server keeps every
stored dictionary untouched (metadata-only, `seed-localization.integration.test.ts:L111`). While the flag is off, the column still holds the
dictionary text, so the editor and the lists show it as raw text until localization is turned back on. When a **persisted** branch of a
seed **with entries** is unchecked, `LocalizedOptionsForm` shows a warning (`role="status"`) that translations stay stored and that the
field shows raw text until re-enabled. This is a known v1 limit (ROADMAP), not a defect.

**7. Slug.** Slugs are global, not translated (brief §5). On create, the auto-slug reads the first text branch. When that branch is
localized, the slug comes from its **default-locale** value, whatever language the editor is showing. Today `deriveAutoSlugText`
would receive an object and return `""`.

VETO verdict: **approved**. HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

This is the last sprint of the series. It comes last because each earlier boundary had to exist first. Core defines the dictionary
(Sprint 1). The API stores it without losing a translation (Sprint 2) and serves it per language (Sprint 3). The dashboard reads it
everywhere else (Sprint 4). Only then is it safe to let a non-technical owner turn localization on: from the moment they do, every
other surface already behaves. The toggle and the editor ship **together** in this sprint. The toggle alone would create fields the
editor cannot edit. The editor alone would have nothing to edit. This keeps the rollout invariant intact until the final merge.

Botanical Engine: zero core changes. Every dictionary read goes through core `asLocaleDictionary`, the eligibility rule through core
`LOCALIZABLE_BRANCH_TYPES` + `resolveClassification`, and the server applies the patch through core `mergeLocalizedFields`. VSA: the
dictionary logic is private to `features/entry-editor`, the toggle lives with the other branch-option forms in `components/fields`, and the
stub fix lives in the slice that owns the detail cache. No slice imports another.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Core (unchanged, consumed).** `packages/core/src/engine/localization.ts`:
- `LOCALIZABLE_BRANCH_TYPES` (`text | richtext | json`) and `isLocalizedBranch(branch)`.
- `toLocalizedPatch` / `applyLocalizedPatch`: a write dictionary keeps its **registered** locales, a `null` / blank-string entry
  clears that locale, unmentioned stored locales (registered or not) are kept, and a top-level `null` clears the whole field.
- `asLocaleDictionary(branch, value, config)`: a stored dictionary as-is, a legacy value as `{ [defaultLocale]: value }`, a blank value
  as `null`. A json object counts as a dictionary only when at least one key is a registered locale.
- `resolveLocalizedValue`: requested → default → first stored translation → `null`, where "blank" means `null`/`undefined`/blank string
  only. An empty TipTap doc or `{}` therefore counts as a translation (carried-in (b)).

`policies.ts:L61 resolveClassification(branch).storage` (`plain | encrypt | hash`) is what Fatal 17 checks (`seed-validation.ts:L375`).
`content/richtext/richtext.ts:L15 isRichtextEnvelopeV1` is exported.

**API (unchanged).** Validation of a localized branch (`schema-builders.ts:L456 localizedSchema`) accepts a plain value or a
dictionary, and reports failures at `<alias>.<locale>…` for dictionary input. `requiredOnCreate` checks the default locale only.
`requiredOnUpdate` is skipped when the patch does not name the default locale (`validation/index.ts:L186-193`). Create compacts
(`create.ts:L115`). Update merges against the stored row and adds an implicit `If-Match` (`update.ts:L155-184`). Draft save merges
against draft-or-live and upserts only the received columns (`draft.handler.ts:L143-148`, `content.repository.d1.ts:L1337`).
`GET /api/content/:slug/:id` returns the row with raw dictionaries in `data` (`get.ts:L50`). `PUT /api/seeds/:slug` validates the whole
definition (Fatal 17), and toggling `localized` on a table with rows is metadata-only (covered by `seed-localization.integration.test.ts`).

**Dashboard: Entry Editor (`features/entry-editor`).**
- `hooks/use-entry-editor-dialog.tsx`:
  - `formData` holds `entryData.data` (live) or `{...live, ...draft}` (L310-324). Create mode seeds `createInitialFormData`
    (`""` for text/json, an empty doc for richtext, L62-76).
  - `handleInputChange(alias, value)` replaces `formData[alias]` (L249).
  - Save builds `prepareSubmissionPayload({branches, formData, slug, status})`, which sends **every branch present in `formData`**
    (L103-144), and validates JSON with `validateEntryJsonFields` (L146-164).
  - A 400 maps `errors[].field → message` verbatim (L421-429).
  - The auto-slug reads the first `text` branch through `deriveAutoSlugText`, which returns `""` for an object (L356-370).
  - It uses no locale config at all.
- `renderer/schema-form-view-model.ts:L32` is the VM contract shared with the Seed Builder. `renderer/schema-form-shell.tsx:L168`
  has an absolute top-right action group (read-only pencil, layout builder) and passes `formData` to `LayoutRenderer` (L273).
- `renderer/layout-renderer.tsx` → `layout-elements.tsx` `TabSections` → `SectionRenderer` → `ColumnRenderer` (L71). `ColumnRenderer` renders
  a `Label` (label, hint tooltip, required asterisk), then `FieldEdit` (unkeyed), then the field error.
- Field editors: `TextEdit` is controlled. `JsonEdit` → `JsonCodeEditor` emits **JSON text** (a string) and keeps an internal doc
  (`json-code-editor.tsx:L113`). `RichtextEdit` → `MinimalTiptapEditor` (`output="json"`) syncs a new `value` but **ignores
  `null`/`undefined`** (`use-minimal-tiptap.ts:L282`). Switching locales therefore needs a remount (`key`).

**Dashboard: content-management.** `hooks/use-content-item.ts:L14 useContentEntry` is `useQuery(CONTENT_QUERY_KEYS.detail, fetchById,
staleTime 10 s)`. `hooks/use-content-list.ts:L57-83` primes that same key for each relation target with
`{ id, schema_slug, slug: null, status: "published", data: { [labelAlias]: label }, created_at: null, updated_at: null }`. An editor
opened on such a target within 10 s (for example from a relation chip, through `components.EntryEditorDialog`) receives the stub as its entry.

**Dashboard: shared.** `features/shared/hooks/use-locale-config.ts:L26 useLocaleConfig()` returns the resolved `LocaleConfig`, or
`undefined` while no seed has a localized branch. It is `undefined` too while `/settings` is loading.

**Dashboard: Seed Builder.** The Seed Builder is a `SchemaFormShell` over a meta-seed. Its `branches` field is a repeater whose items
render `components/fields/edit/repeater/repeater-branch-item.tsx:L94 BranchItemRow`: alias, type (locked when persisted), label, then
type-specific option forms, then `PoliciesOptionsForm` (classification and flags, hidden for sub-fields). Every sub-form calls `onChange`
directly. Repeater sub-fields reuse `BranchItemRow` with `subField` set. `localized` currently round-trips untouched (spread on every
change), and nothing renders it.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Production files (**zero** under `packages/` and under `apps/api/`):

| # | File | Change |
|---|------|--------|
| 1 | `apps/dashboard/src/features/entry-editor/lib/localized-form.ts` | **New.** Pure dictionary helpers: `TouchedLocales`, `localeValue`, `withLocaleValue`, `projectLocale`, `markTouched`, `isBlankEditorValue`, `buildLocalizedPatch`, `findInvalidLocalizedJson`, `localeCompletion`, `localizedFieldStates`, `foldFieldErrors`. |
| 2 | `apps/dashboard/src/features/entry-editor/renderer/locale-switcher.tsx` | **New.** `LocaleSwitcher` (shadcn `Select`, per-locale completion). |
| 3 | `apps/dashboard/src/features/entry-editor/renderer/layout-renderer.tsx` | + `RendererLocalization` type and an optional `localization` prop, threaded to `TabSections`. |
| 4 | `apps/dashboard/src/features/entry-editor/renderer/layout-elements.tsx` | Threads `localization`. `ColumnRenderer`: locale badge on the label, per-locale `key` on `FieldEdit`, missing indicator and "Copy from default". |
| 5 | `apps/dashboard/src/features/entry-editor/renderer/schema-form-view-model.ts` | + optional `headerSlot`, `localization`. |
| 6 | `apps/dashboard/src/features/entry-editor/renderer/schema-form-shell.tsx` | Renders `headerSlot` first in the top-right group. Passes `localization` to `LayoutRenderer`. |
| 7 | `apps/dashboard/src/features/entry-editor/hooks/use-entry-editor-dialog.tsx` | Locale state, touched tracking, projection, patch payload, JSON and field-error handling, slug source, loading gate, VM. |
| 8 | `apps/dashboard/src/features/content-management/hooks/use-content-item.ts` | + `isRelationLabelStub`. `useContentEntry` is stub-aware. |
| 9 | `apps/dashboard/src/features/content-management/hooks/use-content-list.ts` | One comment on the stub marker. No behaviour change. |
| 10 | `apps/dashboard/src/components/fields/edit/repeater/repeater-branch-options.tsx` | + `LocalizationBlocker`, `localizationBlocker`, `withoutIneligibleLocalized`, `LocalizedOptionsForm`. |
| 11 | `apps/dashboard/src/components/fields/edit/repeater/repeater-branch-item.tsx` | Wraps `onChange` with `withoutIneligibleLocalized`. Renders `LocalizedOptionsForm` and a "localized" badge. |
| 12 | `apps/dashboard/src/locales/en.json`, `apps/dashboard/src/locales/it.json` | `content.editor.localization.*`, `seedBuilder.branchEditor.localized*`. |

Test files:

| # | File | Tier |
|---|------|------|
| T1 | `apps/dashboard/src/features/entry-editor/test/unit/localized-form.test.ts` | unit (new) |
| T2 | `apps/dashboard/src/test/cross-slice/entry-editor-localization.test.tsx` | dashboard cross-slice (new) |
| T3 | `apps/dashboard/src/features/content-management/test/unit/use-content-entry.test.ts` | unit (new) |
| T4 | `apps/dashboard/src/components/fields/localized-options-form.test.tsx` | unit (new) |
| T5 | `apps/dashboard/src/test/cross-slice/entry-editor.test.tsx` | Fixture completion only (one mock key, see Task 12). |

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

Conventions: dashboard files use double quotes, no semicolons, the SPDX header shown below, and TypeDoc on every export. No `any`,
and no cast added to silence a type guard.

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.
```

---

### Task 1 — `features/entry-editor/lib/localized-form.ts` (new)

```ts
// SPDX header

import {
  asLocaleDictionary,
  isLocaleCode,
  isLocalizedBranch,
  isRichtextEnvelopeV1,
  type Branch,
  type LocaleConfig,
} from "@beechcms/core"

/**
 * @module entry-editor/lib/localized-form
 * How the Entry Editor holds and saves localized branches. `formData` keeps each localized value as stored (a locale
 * dictionary, or a legacy plain value); these helpers read and write one locale of it through core `asLocaleDictionary`,
 * and turn the locales the editor touched into a core `LocalizedPatch`. Pure: no React, no I/O.
 */

/** Locales the editor changed, per localized branch alias. Only these reach the save payload (patch semantics). */
export type TouchedLocales = Readonly<Record<string, readonly string[]>>

/** Per-locale completion of an entry: how many of its localized branches hold a value in that locale. */
export interface LocaleCompletion {
  readonly filled: number
  readonly total: number
}

/** How one localized field looks in the active locale. */
export interface LocalizedFieldState {
  /** The active locale is blank but another stored locale is not: readers of this locale get a fallback. */
  readonly isMissing: boolean
  /** The default locale, when "Copy from default" applies (missing, not the default, default has a value); else `null`. */
  readonly copyFromLocale: string | null
}

/** A validation error as `PUT/POST /api/content…` return it (`errors[]`). */
export interface ApiFieldError {
  readonly field: string
  readonly message: string
}

function localizedBranchesOf(branches: readonly Branch[]): Branch[] {
  return branches.filter(isLocalizedBranch)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** The stored value as a dictionary (legacy value → default locale, blank → `{}`), via core `asLocaleDictionary`. */
function dictionaryOf(branch: Branch, stored: unknown, config: LocaleConfig): Record<string, unknown> {
  const dictionary = asLocaleDictionary(branch, stored, config)
  return isRecord(dictionary) ? dictionary : {}
}

/** The json code editor emits text: parse it for the payload. Blank text is `null`; invalid text is returned as-is. */
function parseJsonText(branch: Pick<Branch, "type">, value: unknown): unknown {
  if (branch.type !== "json" || typeof value !== "string") return value
  if (!value.trim()) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

/** True for a TipTap doc (or v1 envelope) made only of paragraphs without content: the editor's empty state. */
function isBlankRichtextDoc(value: unknown): boolean {
  const doc = isRichtextEnvelopeV1(value) ? value.doc : value
  if (!isRecord(doc) || doc.type !== "doc") return false
  const nodes = Array.isArray(doc.content) ? doc.content : []
  return nodes.every((node) => isRecord(node) && node.type === "paragraph"
    && !(Array.isArray(node.content) && node.content.length > 0))
}

/**
 * True for the values the editor itself produces for an empty field: `null` / `undefined`, blank text, `{}` or blank
 * JSON text (json), and a doc of empty paragraphs (richtext). Deliberately structural: a doc holding only an image is
 * content, so a translation is never cleared because it has no text.
 */
export function isBlankEditorValue(branch: Pick<Branch, "type">, value: unknown): boolean {
  const parsed = parseJsonText(branch, value)
  if (parsed === null || parsed === undefined) return true
  if (typeof parsed === "string") return parsed.trim() === ""
  if (branch.type === "richtext") return isBlankRichtextDoc(parsed)
  if (branch.type === "json") return isRecord(parsed) && Object.keys(parsed).length === 0
  return false
}

/** The value of `locale` in a localized branch's stored value; a legacy value reads as the default locale. */
export function localeValue(branch: Branch, stored: unknown, locale: string, config: LocaleConfig): unknown {
  return dictionaryOf(branch, stored, config)[locale]
}

/** Writes `value` under `locale`, keeping every other stored locale, including unregistered ones (brief §2). */
export function withLocaleValue(
  branch: Branch,
  stored: unknown,
  locale: string,
  value: unknown,
  config: LocaleConfig,
): Record<string, unknown> {
  return { ...dictionaryOf(branch, stored, config), [locale]: value }
}

/** The form data the renderer shows: each localized branch replaced by its `locale` value; other values pass through. */
export function projectLocale(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  locale: string,
  config: LocaleConfig,
): Record<string, unknown> {
  const view: Record<string, unknown> = { ...formData }
  for (const branch of localizedBranchesOf(branches)) {
    if (Object.hasOwn(view, branch.alias)) view[branch.alias] = localeValue(branch, view[branch.alias], locale, config)
  }
  return view
}

/** Records that `locale` of `alias` was edited. Returns `touched` itself when already recorded. */
export function markTouched(touched: TouchedLocales, alias: string, locale: string): TouchedLocales {
  const locales = touched[alias] ?? []
  return locales.includes(locale) ? touched : { ...touched, [alias]: [...locales, locale] }
}

/**
 * The localized half of a save payload: per localized branch, only the registered locales the editor touched, as
 * `{ [locale]: value }`, with a blank value sent as `null` (clears that locale only). A branch with no touched
 * locale is omitted: a top-level `null` would clear every locale, and an untouched blank default (empty doc, `{}`)
 * would be stored as a translation and stop the fallback chain.
 */
export function buildLocalizedPatch(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  touched: TouchedLocales,
  config: LocaleConfig,
): Record<string, Record<string, unknown>> {
  const patch: Record<string, Record<string, unknown>> = {}
  for (const branch of localizedBranchesOf(branches)) {
    const locales = (touched[branch.alias] ?? []).filter((locale) => config.locales.includes(locale))
    if (locales.length === 0) continue
    const entry: Record<string, unknown> = {}
    for (const locale of locales) {
      const value = localeValue(branch, formData[branch.alias], locale, config)
      entry[locale] = isBlankEditorValue(branch, value) ? null : parseJsonText(branch, value)
    }
    patch[branch.alias] = entry
  }
  return patch
}

/** The first touched translation of a localized json branch holding text that is not valid JSON, or `null`. */
export function findInvalidLocalizedJson(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  touched: TouchedLocales,
  config: LocaleConfig,
): { label: string; locale: string } | null {
  for (const branch of localizedBranchesOf(branches)) {
    if (branch.type !== "json") continue
    for (const locale of touched[branch.alias] ?? []) {
      const value = localeValue(branch, formData[branch.alias], locale, config)
      if (typeof value !== "string" || !value.trim()) continue
      try {
        JSON.parse(value)
      } catch {
        return { label: branch.label, locale }
      }
    }
  }
  return null
}

/** For every registered locale, how many of the seed's localized branches hold a non-blank value in it. */
export function localeCompletion(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  config: LocaleConfig,
): Record<string, LocaleCompletion> {
  const localized = localizedBranchesOf(branches)
  const completion: Record<string, LocaleCompletion> = {}
  for (const locale of config.locales) {
    const filled = localized.filter(
      (branch) => !isBlankEditorValue(branch, localeValue(branch, formData[branch.alias], locale, config)),
    ).length
    completion[locale] = { filled, total: localized.length }
  }
  return completion
}

/** Fallback indicator state of every localized branch in `locale` (see {@link LocalizedFieldState}). */
export function localizedFieldStates(
  branches: readonly Branch[],
  formData: Record<string, unknown>,
  locale: string,
  config: LocaleConfig,
): Record<string, LocalizedFieldState> {
  const states: Record<string, LocalizedFieldState> = {}
  for (const branch of localizedBranchesOf(branches)) {
    const dictionary = dictionaryOf(branch, formData[branch.alias], config)
    const hasValue = (code: string) => !isBlankEditorValue(branch, dictionary[code])
    const isMissing = !hasValue(locale) && Object.keys(dictionary).some(hasValue)
    const canCopy = isMissing && locale !== config.defaultLocale && hasValue(config.defaultLocale)
    states[branch.alias] = { isMissing, copyFromLocale: canCopy ? config.defaultLocale : null }
  }
  return states
}

/**
 * Maps API validation errors to field aliases. A `<alias>.<locale>…` path on a localized branch (dictionary input,
 * `localizedSchema`) is shown on its field, prefixed by the upper-cased locale. Any other path is kept verbatim.
 */
export function foldFieldErrors(errors: readonly ApiFieldError[], branches: readonly Branch[]): Record<string, string> {
  const localizedAliases = new Set(localizedBranchesOf(branches).map((branch) => branch.alias))
  const mapped: Record<string, string> = {}
  for (const { field, message } of errors) {
    const [alias, locale] = field.split(".")
    if (localizedAliases.has(alias) && isLocaleCode(locale)) {
      mapped[alias] = `${locale.toUpperCase()}: ${message}`
    } else {
      mapped[field] = message
    }
  }
  return mapped
}
```

Notes for the executor:
- `isLocaleCode(undefined)` is `false` (it checks `typeof value === "string"`). The destructured `locale` may be `undefined`, and no
  extra guard is needed.
- `isRichtextEnvelopeV1` narrows to `RichtextEnvelopeV1` (`doc: Record<string, unknown>`, `richtext.ts:L10-13`). The ternary in
  `isBlankRichtextDoc` therefore types `doc` as `unknown`, and `isRecord(doc)` narrows it. **Do not** cast.

---

### Task 2 — `features/entry-editor/renderer/locale-switcher.tsx` (new)

```tsx
// SPDX header

import { useTranslation } from "react-i18next"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { LocaleCompletion } from "../lib/localized-form"

/** Properties for the {@link LocaleSwitcher} component. */
export interface LocaleSwitcherProps {
  /** Registered content locales, in project order. */
  readonly locales: readonly string[]
  /** The project default locale (badged in the list). */
  readonly defaultLocale: string
  /** The locale the editor currently shows. */
  readonly activeLocale: string
  /** Per-locale completion of the entry being edited. */
  readonly completion: Readonly<Record<string, LocaleCompletion>>
  /** Fired with the picked locale. */
  readonly onLocaleChange: (locale: string) => void
}

/**
 * The Entry Editor's single content-language selector (brief §4: one selector in the header, no per-field tabs).
 * Each option shows how many localized fields hold a value in that language.
 */
export function LocaleSwitcher({ locales, defaultLocale, activeLocale, completion, onLocaleChange }: LocaleSwitcherProps) {
  const { t } = useTranslation()
  return (
    <Select value={activeLocale} onValueChange={onLocaleChange}>
      <SelectTrigger size="sm" className="h-7 text-xs" aria-label={t("content.editor.localization.switcherLabel")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((locale) => {
          const { filled, total } = completion[locale] ?? { filled: 0, total: 0 }
          return (
            <SelectItem key={locale} value={locale} className="text-xs">
              <span className="font-medium">{locale.toUpperCase()}</span>
              {locale === defaultLocale && (
                <span className="text-muted-foreground">{t("content.editor.localization.defaultBadge")}</span>
              )}
              <span className={filled === total ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>
                {t("content.editor.localization.completion", { filled, total })}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}
```

---

### Task 3 — `features/entry-editor/renderer/layout-renderer.tsx`

Add the type and the prop, and thread the prop to `TabSections`:

```ts
import type { LocalizedFieldState } from "../lib/localized-form"

/**
 * Content-localization context for the renderer. Present only when the entry's seed has localized branches and the
 * project has two or more content languages; absent, every field renders exactly as before.
 */
export interface RendererLocalization {
  /** The locale every localized field currently shows and edits. */
  readonly activeLocale: string
  /** Localized branch aliases → their state in the active locale. Aliases absent here are not localized. */
  readonly fields: Readonly<Record<string, LocalizedFieldState>>
  /** Copies the default-locale value into the active locale of `alias`. */
  readonly onCopyFromDefault: (alias: string) => void
}
```
- `RendererProps` gets `/** Content-localization context; see {@link RendererLocalization}. */ readonly localization?: RendererLocalization`.
- Destructure `localization` in `LayoutRenderer`, and pass `localization={localization}` to `<TabSections … />`.

---

### Task 4 — `features/entry-editor/renderer/layout-elements.tsx`

- Imports: add `import { Button } from "@/components/ui/button"`. Change `import type { RendererBranchMap } from "./layout-renderer"` to
  `import type { RendererBranchMap, RendererLocalization } from "./layout-renderer"`.
- `ColumnRendererProps`, `SectionRendererProps` and `TabSectionsProps` each get
  `/** Content-localization context, forwarded to each field. */ readonly localization?: RendererLocalization`.
  `TabSections` → `SectionRenderer` → `ColumnRenderer` destructure it and forward it unchanged.
- `ColumnRenderer`: replace the per-field `<div key={field.branchId} …>` body with:

```tsx
        const localizedState = localization?.fields[branch.alias]
        return (
          <div key={field.branchId} className="space-y-2">
            <Label htmlFor={branch.alias} className="flex items-center gap-1">
              {/* unchanged: hint tooltip / label */}
              {branch.requiredOnCreate && <Asterisk className="inline size-3 text-destructive" />}
              {localizedState && localization && (
                <span className="ml-1 rounded border px-1 text-[10px] font-medium uppercase text-muted-foreground">
                  {localization.activeLocale}
                </span>
              )}
            </Label>
            <FieldEdit
              // TipTap and CodeMirror keep internal state and ignore a null value: remount per locale so each
              // language opens on its own value instead of the previous language's text.
              key={localizedState && localization ? localization.activeLocale : undefined}
              branch={branch as any}
              value={formData[branch.alias]}
              onChange={(value) => onChange(branch.alias, value)}
              disabled={isReadOnly}
              readOnly={isReadOnly || Boolean((branch as unknown as { readOnly?: boolean }).readOnly)}
            />
            {localizedState?.isMissing && localization && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {translate("content.editor.localization.missing", { locale: localization.activeLocale.toUpperCase() })}
                </span>
                {localizedState.copyFromLocale && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => localization.onCopyFromDefault(branch.alias)}
                  >
                    {translate("content.editor.localization.copyFromDefault", {
                      locale: localizedState.copyFromLocale.toUpperCase(),
                    })}
                  </Button>
                )}
              </div>
            )}
            {fieldErrors[branch.alias] && (
              <p className="text-xs text-destructive">{fieldErrors[branch.alias]}</p>
            )}
          </div>
        )
```
The existing `branch as any` is kept as-is: it is pre-existing and this task adds no `any`. The copy button sits inside the tab's
`<fieldset disabled={isReadOnly}>`, so read-only mode disables it with no extra code.

---

### Task 5 — `features/entry-editor/renderer/schema-form-view-model.ts`

```ts
import type { RendererBranchMap, RendererLocalization } from "./layout-renderer"
…
  // content localization (entry editor only; both absent → the shell renders exactly as before)
  /** Extra header control rendered first in the top-right action group (the entry editor's locale switcher). */
  headerSlot?: React.ReactNode
  /** Forwarded to LayoutRenderer; see {@link RendererLocalization}. */
  localization?: RendererLocalization
```
Place these after the `// readonly mode` block.

---

### Task 6 — `features/entry-editor/renderer/schema-form-shell.tsx`

- Destructure `headerSlot` and `localization` from `vm`.
- In `<div className="absolute top-2 right-10 flex items-center gap-1">`, render `{headerSlot}` as the **first** child, before the
  read-only tooltip.
- `<LayoutRenderer … isReadOnly={vm.isReadOnly} localization={localization} />`.

No other change. The switcher stays usable in read-only mode (viewing translations is not editing).

---

### Task 7 — `features/entry-editor/hooks/use-entry-editor-dialog.tsx`

Exported helpers (`prepareSubmissionPayload`, `validateEntryJsonFields`, `createInitialFormData`, …) keep their signatures and
behaviour. Changes, in file order:

**7a. Imports.**
```ts
import {
  slugify,
  generateDefaultLayout,
  canEditLayout,
  isLocalizedBranch,
  type Branch,
  type FormLayout,
} from "@beechcms/core"
import { useActiveSeed, useLocaleConfig } from "@/features/shared"
import type { RendererBranchMap, RendererLocalization } from "../renderer/layout-renderer"
import { LocaleSwitcher } from "../renderer/locale-switcher"
import {
  buildLocalizedPatch,
  findInvalidLocalizedJson,
  foldFieldErrors,
  localeCompletion,
  localeValue,
  localizedFieldStates,
  markTouched,
  projectLocale,
  withLocaleValue,
  type ApiFieldError,
  type TouchedLocales,
} from "../lib/localized-form"
```

**7b. Locale state**, right after the existing `branches` memo and before `branchById`:
```ts
  const seedBranches = React.useMemo<readonly Branch[]>(() => seed?.branches ?? [], [seed])
  const localizedByAlias = React.useMemo(
    () => new Map(seedBranches.filter(isLocalizedBranch).map((branch) => [branch.alias, branch])),
    [seedBranches]
  )
  const projectLocaleConfig = useLocaleConfig()
  // Scoped to the active seed: a seed without localized branches edits exactly as before, even when another seed is localized.
  const localeConfig = localizedByAlias.size > 0 ? projectLocaleConfig : undefined
  const isLocaleConfigPending = localizedByAlias.size > 0 && !projectLocaleConfig
  const [selectedLocale, setSelectedLocale] = React.useState<string | undefined>(undefined)
  const activeLocale = localeConfig
    ? (selectedLocale && localeConfig.locales.includes(selectedLocale) ? selectedLocale : localeConfig.defaultLocale)
    : undefined
  const [touchedLocales, setTouchedLocales] = React.useState<TouchedLocales>({})
```

**7c. `handleInputChange`**: replace it with the following, and add `handleCopyFromDefault` right after it:
```ts
  const handleInputChange = React.useCallback((alias: string, value: unknown) => {
    const localizedBranch = localizedByAlias.get(alias)
    if (localizedBranch && localeConfig && activeLocale) {
      setFormData((prev) => ({
        ...prev,
        [alias]: withLocaleValue(localizedBranch, prev[alias], activeLocale, value, localeConfig),
      }))
      setTouchedLocales((prev) => markTouched(prev, alias, activeLocale))
    } else {
      setFormData((prev) => ({ ...prev, [alias]: value }))
    }
    setIsDirty(true)
  }, [localizedByAlias, localeConfig, activeLocale])

  /** "Copy from default": writes the default-locale value into the active locale (a touched edit like any other). */
  const handleCopyFromDefault = React.useCallback((alias: string) => {
    const localizedBranch = localizedByAlias.get(alias)
    if (!localizedBranch || !localeConfig) return
    handleInputChange(alias, localeValue(localizedBranch, formData[alias], localeConfig.defaultLocale, localeConfig))
  }, [localizedByAlias, localeConfig, formData, handleInputChange])
```

**7d. Reset touched locales whenever `formData` is re-seeded.** In the live/draft sync block, add `setTouchedLocales({})` next to
`setIsDirty(false)`. In the create-mode init block, add `setTouchedLocales({})` next to `setSlugTouched(false)`.

**7e. Auto-slug source.** Replace the `firstTextAlias` / `firstTextValue` computation (the `useEffect` below it is unchanged):
```ts
  const firstTextBranch = React.useMemo(() => seedBranches.find((b) => b.type === "text"), [seedBranches])
  const firstTextAlias = firstTextBranch?.alias
  const rawFirstTextValue =
    firstTextAlias && Object.hasOwn(formData, firstTextAlias) ? formData[firstTextAlias] : undefined
  // Slugs are global, never translated (brief §5): a localized source field feeds the slug from its default locale.
  const firstTextValue =
    firstTextBranch && localeConfig && localizedByAlias.has(firstTextBranch.alias)
      ? localeValue(firstTextBranch, rawFirstTextValue, localeConfig.defaultLocale, localeConfig)
      : rawFirstTextValue
```

**7f. Payload and JSON validation.** Define these before `handleSaveLive`:
```ts
  /** Non-localized branches keep today's payload rules; localized ones send only the touched locales (patch semantics). */
  const buildPayload = (): Record<string, unknown> => {
    const payload = prepareSubmissionPayload({
      branches: localeConfig ? branches.filter((branch) => !localizedByAlias.has(branch.alias)) : branches,
      formData,
      slug,
      status,
    })
    return localeConfig
      ? { ...payload, ...buildLocalizedPatch(seedBranches, formData, touchedLocales, localeConfig) }
      : payload
  }

  /** Toasts and returns true when a json field, or one touched json translation, holds invalid JSON. */
  const hasInvalidJson = (): boolean => {
    const jsonValidation = validateEntryJsonFields(branches, formData)
    if (!jsonValidation.isValid) {
      toast.error(t("content.editor.jsonError", { field: jsonValidation.errorFieldLabel }))
      return true
    }
    const invalidTranslation = localeConfig
      ? findInvalidLocalizedJson(seedBranches, formData, touchedLocales, localeConfig)
      : null
    if (invalidTranslation) {
      toast.error(t("content.editor.jsonError", {
        field: `${invalidTranslation.label} (${invalidTranslation.locale.toUpperCase()})`,
      }))
      return true
    }
    return false
  }
```
- In `handleSaveLive` and in `handleSaveDraftOnly`, replace the `validateEntryJsonFields` block with `if (hasInvalidJson()) return`,
  and replace `prepareSubmissionPayload({ branches, formData, slug, status })` with `buildPayload()`. The draft path still deletes
  `slug` / `status` from the copy.
- `validateEntryJsonFields` skips a localized json branch on its own, because its value is a dictionary object, not a string.
- In `handleSaveLive`'s 400 branch, replace the `errors.forEach(...)` mapping with:
  ```ts
          type ApiValidationError = ApiFieldError
          …
          setFieldErrors(foldFieldErrors(errors, seedBranches))
  ```
  Keep the local `ApiErrorBody` type, with `errors?: ApiValidationError[]`.

**7g. Localization view model.** Define this right before `const capabilities`. Every hook here is unconditional:
```ts
  const fieldStates = React.useMemo(
    () => (localeConfig && activeLocale ? localizedFieldStates(seedBranches, formData, activeLocale, localeConfig) : {}),
    [seedBranches, formData, activeLocale, localeConfig]
  )
  const completion = React.useMemo(
    () => (localeConfig ? localeCompletion(seedBranches, formData, localeConfig) : {}),
    [seedBranches, formData, localeConfig]
  )
  const viewFormData = React.useMemo(
    () => (localeConfig && activeLocale ? projectLocale(seedBranches, formData, activeLocale, localeConfig) : formData),
    [seedBranches, formData, activeLocale, localeConfig]
  )
  // With one content language, dictionaries are still edited (under the default locale), but there is nothing to switch.
  const isMultilingual = localeConfig !== undefined && localeConfig.locales.length > 1
  const localization: RendererLocalization | undefined = isMultilingual && activeLocale
    ? { activeLocale, fields: fieldStates, onCopyFromDefault: handleCopyFromDefault }
    : undefined
  const headerSlot = isMultilingual && localeConfig && activeLocale ? (
    <LocaleSwitcher
      locales={localeConfig.locales}
      defaultLocale={localeConfig.defaultLocale}
      activeLocale={activeLocale}
      completion={completion}
      onLocaleChange={setSelectedLocale}
    />
  ) : undefined
```

**7h. Return value.** `isSeedLoading: isSeedLoading || isLocaleConfigPending`, `formData: viewFormData` (instead of `formData`), and
add `headerSlot` and `localization`. Everything else is unchanged. `onSaved` still receives `data: payload`, where payload is now
`buildPayload()`'s result. Its only consumer, `useKanbanEntrySync`, reads the axis branch, which is never localized (core
`isAxisCandidate`).

---

### Task 8 — `features/content-management/hooks/use-content-item.ts`

```ts
import type { ContentEntry } from "@/lib/dynamic-columns"

/**
 * True for the relation-label stub `useContentList` primes into the detail cache: `updated_at: null` and `data` holding
 * only the target's display name. A row read from `GET /api/content/:slug/:id` always carries `updated_at`.
 */
export function isRelationLabelStub(entry: ContentEntry | undefined): boolean {
  return entry !== undefined && entry.updated_at === null
}

/**
 * Hook for fetching a single content entry. A primed relation-label stub is never returned as the entry: it is
 * stale at once (so mounting refetches the full row) and reads as loading until that row lands.
 */
export function useContentEntry(slug: string | undefined, id: string | undefined) {
  const query = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(slug || "", id || ""),
    queryFn: () => {
      if (!slug || !id) throw new Error("Slug and ID are required")
      return contentApi.fetchById(slug, id)
    },
    enabled: Boolean(slug && id),
    staleTime: (cached) => (isRelationLabelStub(cached.state.data) ? 0 : 10 * 1000), // 10 seconds for real rows
  })
  // The editor seeds its form from `data`: seeding it from `{ title: label }` would show an almost empty entry.
  return isRelationLabelStub(query.data) ? { ...query, data: undefined, isLoading: true } : query
}
```
TanStack Query ^5.90 accepts a function `staleTime`. Leave the return type inferred. The editor destructures `data`, `isLoading` and
`error`, and all three exist on both branches of the union.

### Task 9 — `features/content-management/hooks/use-content-list.ts`

On the priming object's `updated_at: null,` line, append the comment `// stub marker read by isRelationLabelStub (use-content-item.ts)`.
Nothing else changes.

---

### Task 10 — `components/fields/edit/repeater/repeater-branch-options.tsx`

Imports: add `import { useState } from "react"`, and extend the core import to
`import { LOCALIZABLE_BRANCH_TYPES, resolveClassification, resolvePolicies, type Branch, type DataClassification, type Seed } from "@beechcms/core"`.
Append:

```tsx
/** Why a text / richtext / json branch cannot be localized; mirrors seed-validation Fatal 17. */
export type LocalizationBlocker = "sub-field" | "classification"

/** The reason `branch` cannot carry `localized: true`, or `null` when it can (the type check is the caller's). */
export function localizationBlocker(branch: Branch, subField: boolean): LocalizationBlocker | null {
  if (subField) return "sub-field"
  return resolveClassification(branch).storage === "plain" ? null : "classification"
}

/**
 * Drops `localized: true` from a branch that a type or classification change made ineligible, since `PUT /api/seeds`
 * would refuse the whole seed (Fatal 17). Returns `branch` itself when nothing changes.
 */
export function withoutIneligibleLocalized(branch: Branch, subField: boolean): Branch {
  if (branch.localized !== true) return branch
  if (LOCALIZABLE_BRANCH_TYPES.has(branch.type) && localizationBlocker(branch, subField) === null) return branch
  const next: Branch = { ...branch }
  delete next.localized
  return next
}

/** Properties for the {@link LocalizedOptionsForm} component. */
export interface LocalizedOptionsFormProps {
  /** The branch being edited. */
  branch: Branch
  /** Fired with the updated branch. */
  onChange: (updated: Branch) => void
  /** True for a repeater sub-field (never localizable). */
  subField?: boolean
  /** True when the branch is already persisted (its column exists). */
  isExisting: boolean
  /** False when the seed's table already has entries. */
  tableEmpty?: boolean
}

/**
 * The "Localized" toggle. Shown only for text, richtext and json branches; disabled, with the reason, on repeater
 * sub-fields and on confidential / restricted fields. Turning it off is metadata-only (translations stay stored), so
 * unchecking a persisted branch of a table with entries warns that the field shows raw text until re-enabled.
 */
export function LocalizedOptionsForm({
  branch,
  onChange,
  subField = false,
  isExisting,
  tableEmpty = true,
}: LocalizedOptionsFormProps) {
  const { t } = useTranslation()
  const [showDisableWarning, setShowDisableWarning] = useState(false)

  if (!LOCALIZABLE_BRANCH_TYPES.has(branch.type)) return null

  const blocker = localizationBlocker(branch, subField)
  const checkboxId = `localized-${branch.id}`

  function handleToggle(checked: boolean) {
    setShowDisableWarning(!checked && isExisting && !tableEmpty)
    const next: Branch = { ...branch }
    if (checked) next.localized = true
    else delete next.localized
    onChange(next)
  }

  let hint = t("seedBuilder.branchEditor.localizedHint")
  if (blocker === "sub-field") hint = t("seedBuilder.branchEditor.localizedBlockedSubField")
  if (blocker === "classification") hint = t("seedBuilder.branchEditor.localizedBlockedClassification")

  return (
    <div className="space-y-1 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={branch.localized === true}
          disabled={blocker !== null}
          onCheckedChange={(value) => handleToggle(value === true)}
        />
        <Label htmlFor={checkboxId} className="text-xs">{t("seedBuilder.branchEditor.localized")}</Label>
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      {showDisableWarning && (
        <p role="status" className="text-[11px] text-amber-600 dark:text-amber-400">
          {t("seedBuilder.branchEditor.localizedDisableWarning")}
        </p>
      )}
    </div>
  )
}
```

### Task 11 — `components/fields/edit/repeater/repeater-branch-item.tsx`

- Import `LocalizedOptionsForm` and `withoutIneligibleLocalized` from `"./repeater-branch-options"`, next to the existing named imports.
- Inside `BranchItemRow`, before `set`:
  ```ts
  // A type or classification change must never leave `localized: true` where seed validation refuses it (Fatal 17).
  function emitChange(updated: Branch) {
    onChange(withoutIneligibleLocalized(updated, subField))
  }
  ```
  `set` calls `emitChange({ ...branch, [key]: value })` instead of `onChange(...)`. Every sub-form (`RelationOptionsForm`,
  `NumberOptionsForm`, `FileOptionsForm`, `RepeaterOptionsForm`, `TagsOptionsForm`, `PoliciesOptionsForm`) receives
  `onChange={emitChange}`. `onRemove` is unchanged.
- In the header row, after the type `<Badge>`:
  ```tsx
  {branch.localized === true && (
    <Badge variant="outline" className="text-xs">{t("seedBuilder.branchEditor.localizedBadge")}</Badge>
  )}
  ```
- In `CollapsibleContent`, right after the Label `<div className="space-y-1">…</div>` block and before the type-specific sub-forms:
  ```tsx
  <LocalizedOptionsForm
    branch={branch}
    onChange={emitChange}
    subField={subField}
    isExisting={isExisting}
    tableEmpty={tableEmpty}
  />
  ```

---

### Task 12 — i18n and fixture completion

`apps/dashboard/src/locales/en.json`: add `content.editor.localization` (a new object inside `content.editor`):
```json
"localization": {
  "switcherLabel": "Content language",
  "defaultBadge": "default",
  "completion": "{{filled}}/{{total}} translated",
  "missing": "No {{locale}} value yet: readers in {{locale}} see a fallback language.",
  "copyFromDefault": "Copy from default ({{locale}})"
}
```
and in `seedBuilder.branchEditor`:
```json
"localized": "Localized",
"localizedBadge": "localized",
"localizedHint": "Editors fill this field once per content language (Settings → Site → Content languages).",
"localizedBlockedSubField": "Repeater sub-fields can't be localized.",
"localizedBlockedClassification": "Confidential and restricted fields are stored encrypted or hashed, so they can't be localized.",
"localizedDisableWarning": "Existing translations stay stored. Until you turn localization back on, this field shows them as raw text."
```
`apps/dashboard/src/locales/it.json`, same keys:
```json
"localization": {
  "switcherLabel": "Lingua del contenuto",
  "defaultBadge": "predefinita",
  "completion": "{{filled}}/{{total}} tradotti",
  "missing": "Nessun valore in {{locale}}: chi legge in {{locale}} vede una lingua di ripiego.",
  "copyFromDefault": "Copia dal valore predefinito ({{locale}})"
}
```
```json
"localized": "Localizzato",
"localizedBadge": "localizzato",
"localizedHint": "Gli editor compilano questo campo per ogni lingua dei contenuti (Impostazioni → Sito → Lingue dei contenuti).",
"localizedBlockedSubField": "I sotto-campi di un repeater non possono essere localizzati.",
"localizedBlockedClassification": "I campi riservati e ristretti sono salvati cifrati o come hash, quindi non possono essere localizzati.",
"localizedDisableWarning": "Le traduzioni esistenti restano salvate. Finché non riattivi la localizzazione, questo campo le mostra come testo grezzo."
```
Do not reorder or reformat the surrounding JSON. Both files are UTF-8.

**T5, fixture completion** in `apps/dashboard/src/test/cross-slice/entry-editor.test.tsx`: in the `vi.mock("@/features/shared", …)`
factory, add `useLocaleConfig: () => undefined,` next to `useActiveSeed`. No assertion changes.

---

### Task 13 — Tests

All new test files follow `_config/testing_conventions.md`: SPDX header, one tier, `describe` = the subject, an `it` that states
behaviour and outcome without "should", four zones separated by one blank line with no zone labels, one act assigned to a named
variable, no `any`, no `if` in a test, no sleeps, and comments only for the §6.2 cases. Mocks go at the top, above the imports that
consume them, with `beforeEach(() => vi.clearAllMocks())`. Seeds are hand-rolled `Seed` / `Branch` literals, as in the Sprint 4
dashboard tests (`content-list-localization.test.tsx`), because `@beechcms/testing` ships API-side fixtures only. Entry ids use the
v4 shape (`"3f1c2a4e-9b7d-4c1e-8a2f-5d6e7f8a9b0c"`).

Shared fixture values (re-declare them per file, never import them across files):
```ts
const CONFIG: LocaleConfig = { locales: ["it", "en"], defaultLocale: "it" }
const TITLE: Branch = { id: "br_01", alias: "title", label: "Title", type: "text", localized: true }
const BODY: Branch = { id: "br_02", alias: "body", label: "Body", type: "richtext", localized: true }
const META: Branch = { id: "br_03", alias: "meta", label: "Meta", type: "json", localized: true }
const SKU: Branch = { id: "br_04", alias: "sku", label: "SKU", type: "text" }
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] }
const IMAGE_DOC = { type: "doc", content: [{ type: "image", attrs: { src: "https://cdn.example/x.png" } }] }
```

**T1 — `features/entry-editor/test/unit/localized-form.test.ts`** (unit, no mocks, real core). One `describe` per export:
- `localeValue`: reads a legacy plain string as the default-locale value (`localeValue(TITLE, "Scarpa", "it", CONFIG)` → `"Scarpa"`, and `"en"` → `undefined`). Reads a json object without a registered key as the default locale's value (`{url: "u", alt: "a"}` under `"it"`).
- `withLocaleValue`: keeps unregistered stored locales (`{fr: "Chaussure", it: "Scarpa"}` + `en` → all three keys). Comment: regression guard, removing a language must never drop its translations (brief §2).
- `projectLocale`: replaces only localized aliases (`title` dictionary → `"Shoe"` for `en`; `sku` unchanged).
- `markTouched`: returns the same object when the locale is already recorded (`toBe`).
- `isBlankEditorValue` (matrix, Rule 1.6): `""`, `"   "`, `null`, `undefined` (text), `EMPTY_DOC` (richtext), `"{}"`, `"  "`, `{}` (json) → `true`. `IMAGE_DOC` (richtext), `"x"` (text), `'{"a":1}'`, `[]` (json) → `false`. Comment on `IMAGE_DOC`: it is content, and treating it as blank would clear an image-only translation.
- `buildLocalizedPatch`:
  1. Omits a localized branch with no touched locale. The payload has no `body` key even though `formData.body` is `EMPTY_DOC`. Comment: regression guard for carried-in (a)/(b), where a top-level `null` clears every locale and an untouched empty doc would be stored as a translation.
  2. Sends only touched locales: formData `title: {it: "Scarpa", en: "Shoe"}`, touched `{title: ["en"]}` → `{ title: { en: "Shoe" } }`.
  3. A touched blank value becomes `null`: `title` `en: "  "` → `{ en: null }`. `body` `en: EMPTY_DOC` → `{ en: null }`.
  4. Parses json text: `meta` `en: '{"a":1}'` → `{ en: { a: 1 } }`.
  5. Ignores an unregistered touched locale: touched `{title: ["fr"]}` → `{}`.
- `findInvalidLocalizedJson`: `meta` `en: "{bad"` touched → `{ label: "Meta", locale: "en" }`. The same text untouched → `null`.
- `localeCompletion`: formData `{ title: {it: "Scarpa", en: "Shoe"}, body: {it: IMAGE_DOC}, meta: {} }` over `[TITLE, BODY, META, SKU]` → `it: {filled: 2, total: 3}`, `en: {filled: 1, total: 3}`.
- `localizedFieldStates`: (1) `title: {it: "Scarpa"}` in `en` → `{ isMissing: true, copyFromLocale: "it" }`. (2) `title: {en: "Shoe"}` in `it` (the default) → `{ isMissing: true, copyFromLocale: null }`. (3) `title` absent → `{ isMissing: false, copyFromLocale: null }`.
- `foldFieldErrors`: `[{field: "title.en", message: "Too long"}, {field: "sku", message: "Required"}]` → `{ title: "EN: Too long", sku: "Required" }`. `title.xx_bad` (not a locale code) stays keyed verbatim.

**T2 — `test/cross-slice/entry-editor-localization.test.tsx`** (dashboard cross-slice). File docblock: entry-editor + content-management
+ shared. The real `useSchema` / `useLocaleConfig` / `useContentEntry` / `useSaveContent` chain runs, and only the HTTP client and chrome
are mocked.

Mocks, at the top, typed and without `any`:
```tsx
const mockNavigate = vi.fn()
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useBlocker: () => ({ state: "unblocked", reset: vi.fn(), proceed: vi.fn() }),
}))
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "u1", role: "editor" }, status: "authenticated" }) }))
vi.mock("@/features/shared/hooks/use-permissions", () => ({
  usePermissions: () => ({ can: () => true, canAnywhere: () => true, effective: {} }),
}))
vi.mock("@/features/backrefs", () => ({ ReferencedByPanel: () => null }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
// Radix Select needs pointer capture jsdom lacks: a context-driven stub keeps onValueChange real.
vi.mock("@/components/ui/select", async () => {
  const React = await import("react")
  const SelectContext = React.createContext<(value: string) => void>(() => {})
  return {
    Select: ({ onValueChange, children }: { onValueChange: (value: string) => void; children: ReactNode }) => (
      <SelectContext.Provider value={onValueChange}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <div role="listbox">{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
      const onValueChange = React.useContext(SelectContext)
      return <button type="button" role="option" aria-selected={false} onClick={() => onValueChange(value)}>{children}</button>
    },
  }
})
```
Fixtures:
```ts
const ENTRY_ID = "3f1c2a4e-9b7d-4c1e-8a2f-5d6e7f8a9b0c"
const SEED: Seed = {
  slug: "loc_posts", label: "Post", displayNameAlias: "title",
  branches: [
    { id: "br_01", alias: "title", label: "Title", type: "text", localized: true, requiredOnCreate: true },
    { id: "br_02", alias: "summary", label: "Summary", type: "text", localized: true },
    { id: "br_03", alias: "sku", label: "SKU", type: "text" },
  ],
}
const BILINGUAL = { locales: ["it", "en"], defaultLocale: "it", defaultLanguage: "it" }
const ENTRY = {
  id: ENTRY_ID, schema_slug: "loc_posts", slug: "scarpa", status: "published", has_pending_draft: false,
  data: { title: { it: "Scarpa" }, summary: { it: "Comoda", en: "Comfy" }, sku: "S-1" },
  created_at: 1700000000, updated_at: 1700000100,
}
```
Declare these inside the `describe`: a `routeApi(settings)` helper that implements `api.get` for `/schema` → `[SEED]`, `/settings` →
`settings` and `/content/loc_posts/${ENTRY_ID}` → `ENTRY`, and throws on anything else. Also set `api.put` → `{ data: { success: true } }`
and `api.post` → `{ data: { id: ENTRY_ID } }`. Add a `renderEditor(entryId?: string)` that wraps `<EntryEditorDialog schemaSlug="loc_posts"
entryId={entryId} isDraftContext={false} open onClose={vi.fn()} />` in a fresh `QueryClientProvider` (`retry: false`). Add a `payloadOf(mock)`
helper that returns `mock.mock.calls[0][1] as Record<string, unknown>` (the body argument). `beforeEach`: `vi.clearAllMocks()` and `routeApi(BILINGUAL)`.

Tests (inputs are found through `findByLabelText(/^Title/)`, `/^Summary/`, `/^SKU/`, and options through `getByRole("option", { name: /^EN/ })`):
1. `switching to EN shows each localized field's EN value and leaves non-localized fields unchanged`. Arrange: render the edit mode and await Title = `"Scarpa"`. Act: click the EN option. Assert: Title `""`, Summary `"Comfy"`, SKU `"S-1"`.
2. `saving after typing only the EN title sends { title: { en } } and omits untouched localized fields`. Arrange: EN, then change Title to `"Shoe"`. Act: click `Save`. Assert (`await waitFor` on `api.put` called once): URL `/content/loc_posts/${ENTRY_ID}`, `payload.title` `toEqual({ en: "Shoe" })`, `payload.sku` `"S-1"`, and `payload` `not.toHaveProperty("summary")`. Comment: regression guard for carried-in (a), where a top-level `null`, or a resend of every field, would overwrite translations the editor never touched.
3. `clearing the EN summary sends null for EN only`. Arrange: EN, then change Summary to `""`. Act: `Save`. Assert: `payload.summary` `toEqual({ en: null })` and `payload` `not.toHaveProperty("title")`.
4. `a missing EN value offers Copy from default, which fills it with the IT value`. Arrange: EN. Act: click the button `/Copy from default \(IT\)/`. Assert: Title `"Scarpa"`.
5. `the locale switcher counts filled localized fields per language`. Act: render and await load. Assert: the IT option has text `/2\/2 translated/` and the EN option `/1\/2 translated/`.
6. `with one content language the editor shows no locale switcher`. Arrange: `routeApi({ locales: ["it"], defaultLocale: "it", defaultLanguage: "it" })`. Act: render and await Title `"Scarpa"`. Assert: `queryAllByRole("option")` has length 0.
7. `creating an entry sends only the touched default-locale title and derives the slug from it`. Arrange: render the create mode (`entryId` undefined) and change Title to `"Scarpa Rossa"`. Act: click `Create`. Assert (`await waitFor` on `api.post`): URL `/content/loc_posts`, `payload.title` `toEqual({ it: "Scarpa Rossa" })`, `payload.slug` `"scarpa-rossa"`, and `payload` `not.toHaveProperty("summary")`. Comment: regression guard, since the auto-slug used to receive a dictionary object and produce `""`.

**T3 — `features/content-management/test/unit/use-content-entry.test.ts`** (unit). Mock `@/lib/api` (`api.get`), and use a fresh
`QueryClient` per test (`retry: false`) with a local `wrapper`. Fixtures: `FULL_ENTRY: ContentEntry` (v4 id, `updated_at: 1700000100`,
`data` containing `title: {it, en}` and `sku`) and `PRIMED_STUB: ContentEntry`, which is exactly the shape `useContentList` primes (comment
pointing to `use-content-list.ts`): `slug: null, status: "published", data: { title: "Scarpa" }, created_at: null, updated_at: null`.
1. `reports a primed relation-label stub as loading and refetches the full entry`. Arrange: `setQueryData(CONTENT_QUERY_KEYS.detail("posts", id), PRIMED_STUB)` and `api.get` → `{ data: FULL_ENTRY }`. Act: `renderHook(() => useContentEntry("posts", id))`. Assert: `result.current.isLoading` `true` and `data` `undefined` on the first render, then `await waitFor(() => expect(result.current.data).toEqual(FULL_ENTRY))`, and `api.get` was called with `/content/posts/${id}`. Comment: regression guard for carried-in (d).
2. `serves a cached full entry without refetching`. Arrange: `setQueryData(…, FULL_ENTRY)`. Act: `renderHook`. Assert: `data` `toEqual(FULL_ENTRY)` and `api.get` not called.

**T4 — `components/fields/localized-options-form.test.tsx`** (unit, real i18n from `test/setup.ts`). Import from
`@/components/fields/edit/repeater/repeater-branch-options`.
- `describe("LocalizedOptionsForm")`:
  1. `a top-level text branch gets an enabled Localized toggle that sets localized: true`. Act: click `getByRole("checkbox", { name: "Localized" })`. Assert: `onChange` called once with `expect.objectContaining({ localized: true })`.
  2. `unchecking removes the localized key instead of writing false`. Arrange: a branch with `localized: true`. Act: click. Assert: `onChange.mock.calls[0][0]` `not.toHaveProperty("localized")`.
  3. `the toggle is disabled on a repeater sub-field and on a confidential field` (matrix from an array of `{ branch, subField }`: plain text with `subField: true`, and text with `policies: { classification: "confidential" }`). Render, assert the checkbox is disabled, and `unmount` for each case.
  4. `a number branch renders no Localized toggle`. Assert: `container` is empty.
  5. `unchecking a persisted branch of a table with entries warns that translations stay stored`. Arrange: `localized: true`, `isExisting`, `tableEmpty={false}`. Act: click. Assert: `getByRole("status")` is in the document.
- `describe("withoutIneligibleLocalized")`:
  1. `drops localized when a type or classification change makes it illegal` (matrix: `type: "number"`, `classification: "restricted"`, `subField: true`). Each result has no `localized` key.
  2. `returns the same branch when localization stays legal`. Assert: `toBe(branch)` for a localized text branch.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless noted:
```
pnpm --filter @beechcms/core build
pnpm --filter @beechcms/dashboard type-check
pnpm --filter @beechcms/dashboard test
pnpm beech test --diff
pnpm lint
graphify update . --force
```
There is no `pnpm beech db:migrate` / `db:reset`, because this sprint ships no migration. There is no API command either, because
zero `apps/api` files change. `pnpm beech test --diff` still runs whatever the diff touches.

Manual runtime check (the reviewer runs this in the dashboard, `pnpm beech dev`):
1. Settings → Site → Content languages: configure `it` (default) + `en`.
2. Seed Builder → edit a seed → Fields. On a text field, "Localized" is enabled, with a hint. On a repeater sub-field, and on a field
   switched to Confidential, it is disabled with the reason. A number field has no toggle. Check it on the display-name text field and
   on a richtext field, save, and confirm that the "localized" badge shows on those rows.
3. Open an existing entry. The header shows `IT · default · n/2`. Switch to `EN`. The localized fields are empty and show "No EN value
   yet…" with "Copy from default (IT)". Copy one, type into the richtext field, and save. Reopen the entry: the IT values are
   unchanged and the EN values are stored. The content table still shows IT. The public API with `?lang=en` returns the EN values.
4. In EN, clear a translated text and save. The public API with `?lang=en` now falls back to IT for that field.
5. Create an entry while viewing EN, filling only the EN title: the save returns a validation error on the title (default locale
   required). Fill IT: the slug is derived from the IT title.
6. Uncheck "Localized" on a field of a seed that has entries: the warning appears. After saving, the field shows the raw dictionary
   text. Re-enable it, and the translations come back.
7. Open an entry from a relation chip right after loading a list that references it: the editor shows a skeleton and then the full
   entry, never a form with only the title.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Zero changes under `packages/` and under `apps/api/`. Zero changes to `apps/dashboard/src/{App.tsx,features/seed-builder,features/shared,features/settings}`.
- [ ] A seed with no localized branch: the editor makes no `GET /api/settings`, renders no switcher, badge or indicator, and sends a
      payload identical to `prepareSubmissionPayload` over all branches (existing `entry-editor.test.tsx` passes with only the T5 mock key added).
- [ ] The locale switcher renders only when the seed has a localized branch and the project has ≥ 2 content languages. It starts on the
      default locale, lists every registered locale with its `filled/total` count, and stays usable in read-only mode (T2-1, T2-5, T2-6).
- [ ] Switching locale shows each localized field's value in that locale (legacy values count as the default locale via core
      `asLocaleDictionary`), leaves non-localized fields untouched, and remounts TipTap / CodeMirror per locale (`key`) (T2-1).
- [ ] Saves (live, create and draft) send, for each localized branch, only the touched registered locales as `{locale: value | null}`.
      An untouched localized branch is absent from the payload, and no top-level `null` is ever sent for one (T1, T2-2, T2-3, T2-7).
- [ ] A touched blank value (`""`, whitespace, `{}` / blank JSON text, a doc of empty paragraphs) is sent as `null`. An image-only doc is
      never treated as blank (T1).
- [ ] Invalid JSON in a touched json translation blocks the save with the `content.editor.jsonError` toast naming field and locale (T1).
      A `<alias>.<locale>` API error is shown on its field, prefixed by the locale (T1).
- [ ] A field whose active locale is blank while another locale has a value shows the missing indicator. "Copy from default" appears
      only when the active locale is not the default and the default has a value, and it fills the field (T1, T2-4).
- [ ] On create, the auto-slug derives from the default-locale value of a localized first text field (T2-7).
- [ ] `useContentEntry` never returns a relation-label stub as data. It reports loading and refetches the full row, and a full cached row
      is served as before (T3).
- [ ] Seed Builder: "Localized" shows only for text / richtext / json branches. It is disabled with its reason on repeater sub-fields and
      on confidential / restricted classification, and it is removed automatically when a type or classification change makes it illegal.
      Unchecking removes the key (never `false`). Unchecking a persisted branch of a table with entries shows the keep-translations
      warning. Localized rows show a badge (T4).
- [ ] `en.json` / `it.json` carry every key from Task 12.
- [ ] No new cross-slice import (the pre-existing `entry-editor → content-management / backrefs` and `seed-builder → entry-editor` edges
      gain no symbol). No `any`, no new dependency, no cast added to satisfy a type guard.
- [ ] Every SECTION 5 command passes. Every new or changed test file conforms to `_config/testing_conventions.md` §8.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify:
- **Any core change** (including exporting `isEffectivelyEmpty`, VETO §1), and **any API change**: handlers, validation, migrations,
  repositories, settings, seeds, widget, public API, SDK, MCP.
- **A completion indicator on list surfaces** (table, gallery card, peek, kanban card) or any list-level language picker (VETO §4). Lists
  keep showing the default locale (Sprint 4).
- **Language names in the switcher** or moving `contentLanguageName` out of `features/settings` (VETO §2).
- **Persisting the editor's language** per user or per session beyond the open dialog (VETO §4).
- **Machine translation** of any kind, including inside "Copy from default" (brief §5).
- **Blocking "disable localization"** on seeds with entries, or any purge / rewrite of stored dictionaries when localization is turned off
  (brief §3, orphan purge is permanently out of scope).
- **Localizing repeater sub-fields, `number | boolean | date | file | tags | relation | repeater`, or confidential / restricted fields**
  (brief §5). The toggle only mirrors those refusals.
- **Bulk edit and automation `edit_field` per-locale merge** (known v1 limits), **widget data API** and **vector-index titles** (ROADMAP fast-follows).
- **Moving `useGeneralSettings` to `features/shared`** (pre-existing `automations → settings` import, ROADMAP fast-follow), and fixing the
  pre-existing `entry-editor → content-management / backrefs` or `seed-builder → entry-editor` edges.
- **Documentation** of the public `?lang` API, `Content-Language` and SDK `.lang()`: a ROADMAP fast-follow, which this sprint unblocks but does not do.
