# Sprint 05: Automations Unified UI

## Objective
Build the unified, Notion-style UI for creating and managing Automations inside the Dashboard. The whole "When this happens → Do this" flow lives in a single editor dialog (no wizard), backed by the `/automations` REST API delivered in Sprint 04.

## Depends on (all done in this codebase)
* Sprint 00 — types from `@beechcms/core` (`AutomationAction`, `Automation`, `Seed`, `Branch`).
* Sprint 04 — `/automations` CRUD endpoints (`GET`, `POST`, `PUT`, `PATCH /:id/toggle`, `DELETE`). Already merged; **no MSW needed**.

> **Note on previous issue text**: the GitHub issue still describes a 3-step wizard with MSW mocks. Both ideas are dropped: the API ships before the UI (Sprint 04 already merged), and the UI is a single unified editor — not a wizard — per the latest design direction inspired by Notion's automation menu.

## Why this slice is independent
Dashboard imports types only from `@beechcms/core` and hits the backend through HTTP (`/automations`, axios `baseURL` is `/api`). Zero knowledge of runner, cron handler, D1 repository. No mocks — the real endpoints are live.

---

## Architectural Choices

### Unified editor (single view, no wizard)
Fragmented wizards fight the mental model. The user already thinks "When X happens, do Y" in one shot. Editor renders Trigger and Actions in one Dialog connected by a vertical visual line — flowchart feel without arrows. Validation is per-section, save button gates on the whole form.

### Form state: `react-hook-form` + `zod`
Triggers carry discriminated configuration (cron only when event=cron, conditions optional), actions are an array of mixed-shape items (webhook/send_mail/edit_field/create_entry). Hand-rolled `useState` would rot fast.

**New dependencies to add to `apps/dashboard/package.json`**:
```
react-hook-form
@hookform/resolvers
zod
```
This is the first slice to introduce RHF — call it out in the PR description. The auth feature can be migrated later; out of scope here.

**Schema source**: the dashboard duplicates the zod schema locally (`automation.schema.ts`), kept structurally identical to `apps/api/src/features/automations/automations.schema.ts`. We do not import API code; `@beechcms/core` is the only shared layer. Add a comment in both files cross-referencing the other.

### Server state: TanStack Query
Same pattern as `content-management` slice. Query key shape mirrors existing convention:
```ts
AUTOMATION_QUERY_KEYS.list(seedSlug) // ['automations', 'list', seedSlug]
AUTOMATION_QUERY_KEYS.item(id)       // ['automations', 'item', id]
```
Toggle/delete invalidate `['automations']` root; create/update invalidate `list(seedSlug)`.

### Combobox pattern
There is no shadcn `Combobox` in the repo. The existing project pattern for searchable dropdowns is `DropdownMenu` with a top `Input` (see `apps/dashboard/src/features/content-toolbar/toolbar-components/filter-column-menu.tsx`). Reuse the same structure for trigger and action pickers — do **not** introduce a new primitive.

### Toasts
Project uses `sonner` (`toast.success`, `toast.error`). All mutations report through it.

### i18n
All visible strings go through `t()` (project rule from `CLAUDE.md`). Add an `automations.*` section in `apps/dashboard/src/locales/it.json` and `en.json` covering: panel title, empty state, editor labels, trigger event names, action type names, helper text, validation messages, toast messages.

---

## File Structure (VSA — matches `content-management` slice)

```text
apps/dashboard/src/features/automations/
├── index.ts                              ← public API of the slice
├── api/
│   └── automations.api.ts                ← axios calls, typed
├── consts/
│   └── automation.keys.ts                ← AUTOMATION_QUERY_KEYS
├── schema/
│   └── automation.schema.ts              ← local zod mirror (commented)
├── hooks/
│   ├── use-automations.ts                ← list query
│   ├── use-automation.ts                 ← single item query (edit mode)
│   ├── use-create-automation.ts
│   ├── use-update-automation.ts
│   ├── use-toggle-automation.ts
│   └── use-delete-automation.ts
├── components/
│   ├── automation-panel/                 ← Sheet wrapper + list
│   │   ├── automation-panel.tsx
│   │   ├── use-automation-panel.ts
│   │   ├── automation-row.tsx
│   │   └── automation-empty-state.tsx
│   ├── automation-editor/                ← Unified Dialog editor
│   │   ├── automation-editor.tsx
│   │   ├── use-automation-editor.ts      ← useForm + zodResolver + submit handler
│   │   ├── trigger-section.tsx
│   │   ├── trigger-selector.tsx          ← DropdownMenu + Input (filter-column-menu pattern)
│   │   ├── trigger-conditions.tsx        ← reuses filter-condition-input.tsx
│   │   ├── visual-connector.tsx          ← vertical line between Trigger and Actions
│   │   ├── actions-section.tsx
│   │   ├── action-selector.tsx           ← same DropdownMenu+Input pattern
│   │   └── action-card.tsx               ← shadcn Card wrapper, colored border per action type
│   └── action-forms/
│       ├── webhook-form.tsx
│       ├── send-mail-form.tsx
│       ├── edit-field-form.tsx           ← Field picker bound to seed.branches (alias-based)
│       └── create-entry-form.tsx         ← Target seed picker + field map editor
```

`index.ts` re-exports only `AutomationPanel` and the hooks consumed outside the slice. No deep imports allowed.

---

## Wiring into the toolbar

The ⚡ button already exists in `content-toolbar.tsx:180` and calls `onOpenAutomation?.()`. The handler is **not wired yet** in `pages/content-list.tsx` — this sprint must add it:

```tsx
// pages/content-list.tsx
const [automationPanelOpen, setAutomationPanelOpen] = React.useState(false)

<ContentToolbar
  ...
  onOpenAutomation={() => setAutomationPanelOpen(true)}
  ...
/>

<AutomationPanel
  open={automationPanelOpen}
  onOpenChange={setAutomationPanelOpen}
  seedSlug={seed.slug}
  seedBranches={seed.branches}
/>
```

`isAutomationActiveEffective` in the toolbar should reflect "automations exist for this seed". Drive it via `useAutomations(seed.slug).data?.length > 0` exposed through the page.

---

## UI Layout & Interactions

### 1. `AutomationPanel` (Sheet)
* Right-side `Sheet` (existing primitive: `components/ui/sheet.tsx`).
* Header: title `t('automations.panel.title')`, "+ New automation" button.
* Body:
  * Loading: skeleton rows.
  * Empty: `AutomationEmptyState` with illustration + CTA.
  * Populated: rows showing name, enabled `Switch`, edit icon, delete icon. Toggle hits `PATCH /:id/toggle` without opening the editor.
* Clicking "+ New" or a row's edit icon opens `AutomationEditor` over the Sheet.

### 2. `AutomationEditor` (Dialog)
Single unified view, structured top-to-bottom:

**Header**
* Shadcn `Input` for the automation name.
* Default value: `t('automations.editor.defaultName', { name: user.name ?? user.email })` — e.g. `"Flavio De Musso's automation"` for IT/EN. Pulled from `useAuth().user`, **not** by decoding the JWT manually.
* Subtitle: `t('automations.editor.subtitle', { seed: seed.displayName })` — e.g. "For all entries in Appunti".

**"When" section (Trigger)**
* Card-like block showing the current selection.
* `TriggerSelector` opens a `DropdownMenu` whose first item is an `Input` (same component shape as `filter-column-menu.tsx`). Options: Created / Updated / Deleted / Scheduled (cron).
* If `Scheduled`: inline cron `Input` appears below with placeholder `0 9 * * 1` and helper text `t('automations.editor.cronHint')`.
* Optional conditions list (only enabled for create/update/delete events). Each row reuses `filter-condition-input.tsx` to pick branch + op + value. "+ Add condition" / trash icon per row. Maps directly to API `trigger_conditions: [{field, op, value}]`.

**Visual connector**
* `visual-connector.tsx`: a 1px vertical line, no arrow, purely aesthetic. Reused between Trigger card and each Action card to convey flow.

**"Do" section (Actions)**
* Array of `ActionCard`s, render order = execution order. Drag-to-reorder is **out of scope** for this sprint; reorder buttons (↑/↓) on each card are sufficient.
* Each card has a colored left border per action type (palette aligned with `conditional-formats-editor.tsx`):
  * `webhook` → blue
  * `send_mail` → green
  * `edit_field` → amber
  * `create_entry` → purple
* Card header: icon + action type label + remove icon.
* Card body: the matching form from `action-forms/`.
* "+ Add action" button below the list opens `ActionSelector` (same DropdownMenu+Input pattern).

**Footer**
* `Cancel` (closes Dialog, no save).
* `Enable` (primary). Disabled while the form is invalid OR a mutation is pending. Label is `Enable` for create, `Save` for edit.

---

## Action form fields

Helper text under every template-capable input: `t('automations.actions.templateHint')` →
*Use `{{fieldAlias}}` to insert field values* / *Usa `{{fieldAlias}}` per inserire valori dei campi*.

| Form | Fields | API mapping |
|---|---|---|
| `WebhookForm` | URL (required, url), Method (POST/GET/PUT, default POST), Headers (key/value rows), Body template (textarea) | `{type:'webhook', url, method?, headers?, body_template?}` |
| `SendMailForm` | To (required, email), Subject template (required), Body template (required) | `{type:'send_mail', to, subject_template, body_template}` |
| `EditFieldForm` | Field selector populated from `seedBranches` props — **no API call**, displays `branch.label`, submits `branch.alias`. Value (text + template) | `{type:'edit_field', field: alias, value}` |
| `CreateEntryForm` | Target seed selector (from `SEED_REGISTRY` via `useSeeds()` or equivalent), field-map editor: rows of `target alias → source alias` (selects on both sides) | `{type:'create_entry', seed_slug, field_map}` |

`edit-field.executor.ts` confirms the API expects the alias (string), then translates internally — UI sends the alias.

---

## React Query Hooks

`automations.api.ts`:
```ts
const BASE = '/automations' // axios baseURL is '/api'

export const automationsApi = {
  list:   (seedSlug: string)                           => api.get<Automation[]>(BASE, { params: { seed: seedSlug } }).then(r => r.data),
  get:    (id: string)                                 => api.get<Automation>(`${BASE}/${id}`).then(r => r.data),
  create: (body: CreateAutomationBody)                 => api.post<{ id: string }>(BASE, body).then(r => r.data),
  update: (id: string, body: UpdateAutomationBody)     => api.put<Automation>(`${BASE}/${id}`, body).then(r => r.data),
  toggle: (id: string, enabled: boolean)               => api.patch<void>(`${BASE}/${id}/toggle`, { enabled }),
  remove: (id: string)                                 => api.delete<void>(`${BASE}/${id}`),
}
```

`use-automations.ts`:
```ts
export function useAutomations(seedSlug: string | undefined) {
  return useQuery({
    queryKey: AUTOMATION_QUERY_KEYS.list(seedSlug ?? ''),
    queryFn: () => automationsApi.list(seedSlug!),
    enabled: Boolean(seedSlug),
    staleTime: 10_000,
  })
}
```

Mutations follow `content-management` style: typed inputs, invalidate the relevant key, surface success/error via `sonner`.

---

## Validation (zod, mirrored from API)

`schema/automation.schema.ts`:
* `triggerCondition`: `{ field: string.min(1), op: enum, value: unknown }`.
* Discriminated union for actions (same four members).
* `automationFormSchema`:
  * `name: string.min(1).max(100)`
  * `trigger_event: 'create' | 'update' | 'delete' | 'cron'`
  * `trigger_cron`: required when `trigger_event === 'cron'` (use `.superRefine`).
  * `trigger_conditions`: array (optional, only meaningful for non-cron events).
  * `actions: array(actionSchema).min(1)`.

A comment block at the top of the file points to `apps/api/src/features/automations/automations.schema.ts` and vice versa.

---

## Acceptance Criteria

* [ ] ⚡ button in the content toolbar opens `AutomationPanel` Sheet for the active seed; handler wired in `pages/content-list.tsx`.
* [ ] `AutomationPanel` lists existing automations with name, enabled `Switch`, edit + delete icons. Toggling fires `PATCH /:id/toggle` without opening the editor.
* [ ] Empty state with i18n copy + CTA when no automations exist for the seed.
* [ ] `AutomationEditor` opens as a Dialog and pre-fills the name with `{{user.name | user.email}}'s automation` via `useAuth()`.
* [ ] Trigger and Action pickers are searchable dropdowns built with `DropdownMenu` + `Input`, matching `filter-column-menu.tsx`.
* [ ] Cron `Input` is revealed inline only when the event is `Scheduled`.
* [ ] Trigger conditions reuse `filter-condition-input.tsx`; add/remove works; disabled for cron event.
* [ ] Actions render as Shadcn `Card`s with a colored left border per type (blue/green/amber/purple), header with icon + label + remove icon.
* [ ] Each action form validates required fields inline (URL is a valid URL, To is an email, templates non-empty where required).
* [ ] Vertical visual connector renders between Trigger and Actions (and between consecutive Action cards).
* [ ] Edit mode hydrates the form from the existing `Automation`, including conditions and all action configurations.
* [ ] Save/Enable button is disabled while the form is invalid or a mutation is pending; label switches between `Enable` and `Save`.
* [ ] Form state managed with `react-hook-form` + `zodResolver`; no `useState` for field values. Dependencies added to `apps/dashboard/package.json` and called out in the PR.
* [ ] All visible strings come from `automations.*` keys in `it.json` and `en.json`. No hardcoded copy.
* [ ] `sonner` toasts fire on successful create / update / delete / toggle, and on errors with the API message.
* [ ] Slice respects VSA: only `index.ts` is imported from outside the slice; no deep imports.
* [ ] `isAutomationActiveEffective` reflects "automations exist for this seed" using the list query.
