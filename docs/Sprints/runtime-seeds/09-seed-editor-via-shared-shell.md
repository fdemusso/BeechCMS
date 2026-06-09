# Runtime Seeds — Sprint 09: Seed Editor via the Shared Shell

> **Audience:** an AI coding agent with no prior knowledge of Beech CMS. Everything is
> inline. Trust live code over snippets if they drift.
>
> **Depends on Sprint 07** (shared `SchemaFormShell` + `SchemaFormViewModel`) **and
> Sprint 08** (the `repeater` field renderer). Read [`00-overview.md`](./00-overview.md)
> and [`seed-creation-modal-analysis.md`](./seed-creation-modal-analysis.md) first.

## 0. Why this sprint exists — the payoff

This sprint **achieves the analysis goal**: the Seed-creation modal becomes the **same
component** as the content-creation modal. After it lands, editing a content type uses
`SchemaFormShell` — the very shell that edits articles — driven by a Seed-specific hook.
`SeedEditorDialog` is deleted.

The trick, validated in sprints 07–08: `SchemaFormShell` consumes a
`SchemaFormViewModel`. We write a **second** implementer, `useSeedEditorDialog`, that
presents a `Seed` as if it were an "entry" of a synthetic meta-seed `_seed`:

- Its `formData` is the Seed flattened to aliases (`slug`, `label`, `allow_drafts`, …).
- Its `branchById` is a set of **virtual** branches — `text` for `slug`/`label`,
  `boolean` for the flags, and **one `repeater`** branch for `branches`.
- Its `layout` is a hand-built `FormLayout` (tabs: General / Fields / Dashboard).
- Its `handleSubmit` reassembles a `Seed` and calls the **existing** sprint-05
  `seedsApi.create` / `seedsApi.update` (`POST/PUT /api/seeds`).
- Its `capabilities` are `{ drafts:false, backrefs:false, delete:false,
  layoutBuilder:false }` — Seeds have none of that chrome.

**No Botanical Engine change.** The Seed is serialized by the hook to the `seeds` table
(sprint 03), never to a `content_` table — so the `repeater` does not need DDL. The
virtual meta-seed lives only in the hook's memory.

## 1. Role & ground rules

Senior front-end engineer, `apps/dashboard`. **VSA**: the new hook lives in the existing
`seed-builder` slice (`apps/dashboard/src/features/seed-builder/`); it imports
`SchemaFormShell` + `SchemaFormViewModel` from the `entry-editor` **barrel**, and the
`repeater` renderer is already in the global field registry (sprint 08) so nothing extra
to import for rendering. All text via `t()` in both locales. Docs English.

## 2. What this sprint builds

In `apps/dashboard/src/features/seed-builder/`:
- `hooks/use-seed-editor-dialog.ts` — implements `SchemaFormViewModel` for a `Seed`.
- `lib/meta-seed-layout.ts` — builds the synthetic `FormLayout` + virtual `branchById`
  for the meta-seed, from a `SeedRecordDTO` (or empty, for create).
- `lib/seed-form-mapping.ts` — `seedToFormData(seed)` and `formDataToSeed(formData)` —
  the flatten/assemble round-trip.
- `components/SeedBuilderPage.tsx` — swap the two `<SeedEditorDialog/>` usages for the
  shared shell driven by `useSeedEditorDialog`.
- **Delete** `components/SeedEditorDialog.tsx` and `components/BranchEditor.tsx` (the
  latter subsumed by the sprint-08 `repeater`; keep only the shim removal).

## 3. The meta-seed model — `lib/meta-seed-layout.ts`

The meta-seed is a fixed schema. Build it with **stable virtual branch ids** so the layout
references resolve (the engine invariant: layout keys on `branch.id`). These ids are
private to the hook — they are never persisted.

```ts
import type { Branch, FormLayout, Seed } from "@beechcms/core"

// Stable virtual branch ids for the meta-seed. Never persisted.
export const META = {
  slug: "br_meta_slug",
  label: "br_meta_label",
  labelPlural: "br_meta_label_plural",
  displayNameAlias: "br_meta_display",
  allowPublicRead: "br_meta_pub_read",
  allowPublicPost: "br_meta_pub_post",
  allowPublicEdit: "br_meta_pub_edit",
  allowDrafts: "br_meta_drafts",
  branches: "br_meta_branches",
  dashIcon: "br_meta_dash_icon",
  dashGroup: "br_meta_dash_group",
  dashOrder: "br_meta_dash_order",
  dashHidden: "br_meta_dash_hidden",
  dashDescription: "br_meta_dash_desc",
} as const

export function buildMetaBranches(opts: {
  isEdit: boolean
  branchAliasOptions: string[]      // for displayNameAlias select
  activeSeedsForRelation: Seed[]    // for the branches repeater (relation targets)
  iconNames: string[]               // for dashIcon select
}): Branch[] {
  // Each entry is a *virtual* Branch. Types map straight onto existing FieldEdit
  // renderers; `branches` uses the sprint-08 'repeater' renderer.
  return [
    { id: META.slug, alias: "slug", label: t("seedBuilder.editor.slug"),
      type: "text", requiredOnCreate: true,
      // slug is immutable on edit (it is the table name) — express via readOnly meta
      ...(opts.isEdit ? { /* readOnly handled by a custom text option, see §6 */ } : {}) },
    { id: META.label, alias: "label", label: t("seedBuilder.editor.label"),
      type: "text", requiredOnCreate: true },
    { id: META.labelPlural, alias: "label_plural", label: t("seedBuilder.editor.labelPlural"),
      type: "text" },
    { id: META.displayNameAlias, alias: "display_name_alias",
      label: t("seedBuilder.editor.displayNameAlias"),
      type: "tags", options: opts.branchAliasOptions, multiple: false }, // single-select over aliases
    { id: META.allowPublicRead, alias: "allow_public_read",
      label: t("seedBuilder.editor.allowPublicRead"), type: "boolean" },
    { id: META.allowPublicPost, alias: "allow_public_post",
      label: t("seedBuilder.editor.allowPublicPost"), type: "boolean" },
    { id: META.allowPublicEdit, alias: "allow_public_edit",
      label: t("seedBuilder.editor.allowPublicEdit"), type: "boolean" },
    { id: META.allowDrafts, alias: "allow_drafts",
      label: t("seedBuilder.editor.allowDrafts"), type: "boolean" },
    // THE repeater: the branches list. Item body = Branch (sprint 08 branch-item).
    { id: META.branches, alias: "branches", label: t("seedBuilder.editor.tabFields"),
      type: "repeater" as Branch["type"],
      // RepeaterMeta read by FieldEditRepeater (sprint 08):
      repeater: {
        itemKind: "branch",
        itemLabel: t("seedBuilder.branchEditor.addField"),
        branchItemContext: { activeSeedsForRelation: opts.activeSeedsForRelation },
      },
    } as Branch,
    { id: META.dashIcon, alias: "dash_icon", label: t("seedBuilder.editor.dashIcon"),
      type: "tags", options: opts.iconNames, multiple: false },
    { id: META.dashGroup, alias: "dash_group", label: t("seedBuilder.editor.dashGroup"),
      type: "text" },
    { id: META.dashOrder, alias: "dash_order", label: t("seedBuilder.editor.dashOrder"),
      type: "number" },
    { id: META.dashHidden, alias: "dash_hidden", label: t("seedBuilder.editor.dashHidden"),
      type: "boolean" },
    { id: META.dashDescription, alias: "dash_description",
      label: t("seedBuilder.editor.dashDescription"), type: "text" },
  ]
}

export function buildMetaLayout(): FormLayout {
  // One tab per current SeedEditorDialog tab: General / Fields / Dashboard.
  // Sections → columns → fields, referencing META.* ids. Mirror generateDefaultLayout's
  // shape (see packages/core seed-layout.ts) so LayoutRenderer consumes it unchanged.
  return {
    tabs: [
      { id: "general", label: t("seedBuilder.editor.tabGeneral"), sections: [ /* slug,label,labelPlural,displayNameAlias, + a flags section */ ] },
      { id: "fields",  label: t("seedBuilder.editor.tabFields"),  sections: [ /* single column: META.branches */ ] },
      { id: "dashboard", label: t("seedBuilder.editor.tabDashboard"), sections: [ /* dash_* fields */ ] },
    ],
  } as FormLayout
}
```

> **The two non-trivial meta-fields** — handle honestly:
> - **`displayNameAlias`** must be a *single-select over the current branch aliases*. The
>   `tags` renderer with `multiple:false` + `options` is the closest built-in. If its UX
>   is wrong for single-select, register a tiny `select` edit renderer in the fields slice
>   (one component, `options`-driven) rather than bending `tags`. Keep it minimal.
> - **`slug` immutability on edit**: the slug is the table name and must not change
>   (sprint 03 rejects it). Either pass a `readOnly` option the `text` renderer honours,
>   or render slug outside the layout as a fixed read-only row in edit mode. Pick one and
>   keep the rest schema-driven.

## 4. The mapping — `lib/seed-form-mapping.ts`

```ts
import type { Branch, Seed } from "@beechcms/core"
import type { SeedRecordDTO } from "../api/seeds.api"

export function seedToFormData(record: SeedRecordDTO | null): Record<string, unknown> {
  const d = record?.definition
  return {
    slug: d?.slug ?? "",
    label: d?.label ?? "",
    label_plural: d?.labelPlural ?? "",
    display_name_alias: d?.displayNameAlias ?? "",
    allow_public_read: d?.allowPublicRead ?? false,
    allow_public_post: d?.allowPublicPost ?? false,
    allow_public_edit: d?.allowPublicEdit ?? false,
    allow_drafts: d?.allowDrafts ?? false,
    branches: d?.branches ?? [],            // <-- the repeater value (Branch[])
    dash_icon: d?.dashboard?.icon ?? "",
    dash_group: d?.dashboard?.group ?? "",
    dash_order: d?.dashboard?.order ?? undefined,
    dash_hidden: d?.dashboard?.hidden ?? false,
    dash_description: d?.dashboard?.description ?? "",
  }
}

export function formDataToSeed(f: Record<string, unknown>): Seed {
  // Strip client-only ids from *new* branches (br_new_*), mirroring the current
  // SeedEditorDialog.buildSeed — the server assigns real br_NN ids (sprint 03).
  const rawBranches = (Array.isArray(f.branches) ? f.branches : []) as Branch[]
  const branches = rawBranches.map((b) =>
    b.id?.startsWith("br_new_") ? (({ id, ...rest }) => rest as Branch)(b) : b
  )
  return {
    slug: String(f.slug ?? ""),
    label: String(f.label ?? ""),
    labelPlural: (f.label_plural as string) || undefined,
    displayNameAlias: String(f.display_name_alias ?? ""),
    allowPublicRead: !!f.allow_public_read,
    allowPublicPost: !!f.allow_public_post,
    allowPublicEdit: !!f.allow_public_edit,
    allowDrafts: !!f.allow_drafts,
    branches,
    dashboard: {
      icon: (f.dash_icon as string) || undefined,
      group: (f.dash_group as string) || undefined,
      order: typeof f.dash_order === "number" ? f.dash_order : undefined,
      hidden: !!f.dash_hidden,
      description: (f.dash_description as string) || undefined,
      // features.* preserved from the existing editor — carry them through if you keep
      // the features toggles; otherwise default as today's defaultValues() does.
    },
  }
}
```

> This is exactly the transform `SeedEditorDialog.buildSeed` does today (see its lines
> ~105–139) — reuse that proven logic verbatim, just sourced from `formData` instead of
> react-hook-form values.

## 5. The hook — `hooks/use-seed-editor-dialog.ts`

```ts
export interface UseSeedEditorDialogProps {
  editRecord: SeedRecordDTO | null         // null = create
  activeSeedsForRelation: Seed[]
  onClose: () => void
}

export function useSeedEditorDialog(props): SchemaFormViewModel {
  const { t } = useTranslation()
  const isCreate = !props.editRecord
  const create = useCreateSeed()           // sprint-05 hooks
  const update = useUpdateSeed()

  const [formData, setFormData] = useState(() => seedToFormData(props.editRecord))
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({})
  const [isDirty, setIsDirty] = useState(false)
  // reset on open / record change (mirror SeedEditorDialog's effect)

  const branches = buildMetaBranches({
    isEdit: !isCreate,
    branchAliasOptions: (formData.branches as Branch[]).filter(b=>b.alias).map(b=>b.alias),
    activeSeedsForRelation: props.activeSeedsForRelation,
    iconNames: ICON_NAMES,
  })
  const branchById = Object.fromEntries(branches.map(b => [b.id, b]))
  const layout = buildMetaLayout()

  const handleInputChange = (alias, value) => { setFormData(p => ({...p,[alias]:value})); setIsDirty(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const seed = formDataToSeed(formData)
    try {
      if (isCreate) await create.mutateAsync(seed)
      else await update.mutateAsync({ slug: props.editRecord!.slug, seed })
      toast.success(isCreate ? t("seedBuilder.editor.createSuccess",{label:seed.label})
                             : t("seedBuilder.editor.updateSuccess",{label:seed.label}))
      setIsDirty(false)
      props.onClose()
    } catch (err) {
      // map RFC 7807 problem+json detail / field errors into fieldErrors + toast,
      // same pattern as useEntryEditorDialog.handleSaveLive (409 slug dup, 400/422 fields)
    }
  }

  return {
    t,
    title: isCreate ? t("seedBuilder.editor.createTitle")
                    : t("seedBuilder.editor.editTitle", { label: props.editRecord!.definition.label }),
    isCreate,
    seed: { label: t("seedBuilder.page.title"), slug: "_seed" }, // for the header only
    layout, branchById, formData, fieldErrors,
    isSeedLoading: false, isLoadingEntry: false, errorEntry: null,
    notFoundLabel: "",
    handleInputChange, handleSubmit,
    isBusy: create.isPending || update.isPending,
    saveLabel: isCreate ? t("common.create") : t("common.save"),
    goBack: props.onClose,
    blocker: useBlocker(() => isDirty),     // reuse the dirty guard for free
    capabilities: { drafts: false, backrefs: false, delete: false, layoutBuilder: false },
    // draft/delete/builder fields: provide inert defaults (false / no-op) — never read
    // because the capability flags are false, but the interface requires them.
    effectiveDraftContext: false, hasPendingDraftNotice: false, hasSaveDropdown: false,
    isPublishing: false, isDiscarding: false,
    showDiscardConfirm: false, setShowDiscardConfirm: () => {},
    handlePublishDraft: () => {}, handleDiscardDraft: () => {},
    navigate: () => {}, schemaSlug: "_seed", entryId: props.editRecord?.slug,
    isDeleting: false, showDeleteConfirm: false, setShowDeleteConfirm: () => {},
    handleDelete: () => {}, hasRestrictedRefs: false, setHasRestrictedRefs: () => {},
    canEditLayoutFlag: false, builderMode: false, setBuilderMode: () => {},
  }
}
```

> **Inert-field discipline.** The interface from sprint 07 is wide because it serves the
> content editor. For Seeds, supply harmless defaults for the capability-gated fields; the
> shell never reads them while the flags are `false`. A follow-up could split the
> interface into `core` + `capability` sub-objects, but **do not** refactor sprint 07's
> contract here — just satisfy it.

## 6. Wire the page — `components/SeedBuilderPage.tsx`

Replace the two `<SeedEditorDialog .../>` instances with the shared shell. Because
`SchemaFormShell` is a controlled dialog, wrap each in a tiny adapter that builds the
view-model and renders the shell when open:

```tsx
import { SchemaFormShell } from "@/features/entry-editor"
import { useSeedEditorDialog } from "../hooks/use-seed-editor-dialog"

function SeedFormDialog({ open, editRecord, activeSeeds, onClose }) {
  const vm = useSeedEditorDialog({ editRecord, activeSeedsForRelation: activeSeeds, onClose })
  if (!open) return null            // keep hooks stable: render the adapter always,
  return <SchemaFormShell vm={vm} open={open} />   // gate inside if hook order allows;
}                                                  // otherwise always render + pass open
```

> **React-hooks caveat:** don't early-return *before* `useSeedEditorDialog`. Always call
> the hook, then pass `open` to the shell (the shell already handles `open=false`). Build
> the create instance and the edit instance exactly where the old dialogs were.

Keep `DeleteSeedDialog` as-is (Seed soft-delete stays its own dialog — `capabilities.delete`
is false in the shell because Seed deletion has its own reference-guard flow from sprint 05).

## 7. Cleanup

- **Delete** `components/SeedEditorDialog.tsx`.
- **Delete** `components/BranchEditor.tsx` (its row became `BranchItemRow` in the fields
  slice in sprint 08; the repeater now owns the list). Remove the sprint-08 shim.
- Update `seed-builder/index.ts` if it exported either.
- Remove now-dead i18n keys only if nothing references them; otherwise keep (the meta-seed
  reuses most `seedBuilder.editor.*` / `seedBuilder.branchEditor.*` keys).

## 8. Tests

- `use-seed-editor-dialog.test.ts(x)`: `seedToFormData`/`formDataToSeed` round-trip
  (including `br_new_*` id stripping); submit in create mode calls `seedsApi.create` with
  the assembled `Seed`; edit mode calls `update` with the immutable slug; a 409 maps to a
  slug-duplicate toast; validation errors populate `fieldErrors`.
- Render `SchemaFormShell` with the Seed view-model: General/Fields/Dashboard tabs show;
  the Fields tab renders the `repeater` (add field appends a `br_new_*` branch); no delete
  button, no draft notice, no backrefs panel (capabilities false).
- `SeedBuilderPage`: clicking "New content type" opens the shared shell; submitting
  invalidates `["schema"]` + `["seeds"]` (via the sprint-05 hooks).
- Regression: content `EntryEditorDialog` still passes its full suite (shared shell
  unchanged behaviourally).

## 9. Acceptance criteria

- [ ] The Seed editor is rendered by `SchemaFormShell` (the same shell as the content
      editor) driven by `useSeedEditorDialog`.
- [ ] Creating/editing a content type works end-to-end against `/api/seeds`, with the
      `branches` list edited via the sprint-08 `repeater`.
- [ ] `slug` is immutable on edit; `displayNameAlias` selects from current branch aliases.
- [ ] Capability flags hide all entry-specific chrome for Seeds.
- [ ] `SeedEditorDialog` and `BranchEditor` are deleted; no dangling imports.
- [ ] Mutations still invalidate `["schema"]` so the sidebar/content views update live.
- [ ] `npm run lint`, `npm run build`, `npm run test` pass in `apps/dashboard`.

## 10. Do NOT

- Do **not** touch `@beechcms/core` (no `repeater` BranchType, no DDL) — sprint 10.
- Do **not** change the sprint-07 `SchemaFormViewModel` contract; satisfy it with inert
  defaults for capability-gated fields.
- Do **not** create a `content_\_seed` table or route Seed saves through `/api/content` —
  Seeds persist via `/api/seeds` (sprint 03/05) only.
- Do **not** reintroduce a parallel schema cache — reuse the sprint-05 invalidation.
