You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

The visual layer (badges, static banner) for pending drafts is already shipped.
This sprint adds the interactive layer: loading, saving, publishing, and discarding drafts
entirely from within the entry editor.

### Stack

- API: Hono on Cloudflare Workers, D1 (SQLite)
- Dashboard: React 19 + TanStack Query v5 + Axios (`src/lib/api.ts`, base `/api`)
- Shared: `@beechcms/core` (pure TS, no HTTP)
- Monorepo: Turborepo / npm workspaces

==========================================================================
SECTION 1 — WHAT IS ALREADY IN PRODUCTION (do not rewrite)
==========================================================================

### Backend — draft endpoints (apps/api/src/features/draft/draft.handler.ts)

All four endpoints are fully implemented and tested:

  GET    /content/:slug/:id/draft          → returns { data: {...} } or 404
  PUT    /content/:slug/:id/draft          → upserts draft, returns { success: true }
  POST   /content/:slug/:id/draft/publish  → atomically promotes draft → live, { success: true }
  DELETE /content/:slug/:id/draft          → discards draft, returns { success: true }

The PUT endpoint accepts a partial payload (only modified fields), enforces the same
validation rules as the live PUT, and rejects sensitive branches.

### Dashboard — visual layer (already committed)

1. `apps/dashboard/src/lib/dynamic-columns.tsx`
   - Column `status` shows an amber "Pending draft" badge when `has_pending_draft === true`
     and `status !== "archived"`. The helper lives in `src/lib/pending-draft.ts`.

2. `apps/dashboard/src/features/content-gallery/gallery-components/gallery-card.tsx`
   `apps/dashboard/src/features/content-gallery/gallery-components/gallery-peek-panel.tsx`
   - Same badge overlaid on gallery cards and peek panel.

3. `apps/dashboard/src/pages/entry-editor.tsx` — line 689 and 718–722
   - `hasPendingDraftNotice` is computed from `entryData?.has_pending_draft`.
   - A **static** amber banner is rendered when true:
     ```tsx
     {hasPendingDraftNotice && (
       <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3
                       text-sm text-amber-800 dark:border-amber-800/60
                       dark:bg-amber-500/10 dark:text-amber-200">
         {t("content.editor.pendingDraftNotice")}
       </div>
     )}
     ```
   - The form always loads `entryData.data` (live entry). There is no draft loading.

4. `apps/dashboard/src/locales/en.json` and `it.json`
   - Keys already present: `content.editor.pendingDraftNotice`, `content.table.pendingDraft`

### Existing API layer (apps/dashboard/src/features/content-management/)

  content.api.ts   — `fetchById`, `create`, `update`, `delete` (no draft methods)
  content.keys.ts  — `CONTENT_QUERY_KEYS.detail(slug, id)` (no draft keys)
  use-content-item.ts — `useContentEntry`, `useSaveContent` (no draft hooks)

==========================================================================
SECTION 2 — WHAT THIS SPRINT DELIVERS
==========================================================================

The editor must support two explicit modes:

  live  — default; edits the published (or archived/draft) live entry
  draft — edits the pending draft; save goes to PUT draft endpoint

The static amber banner becomes an interactive `DraftActionBanner`:

  When mode = "live" AND has_pending_draft:
    "This entry has a pending draft."
    [Resume draft]  [Discard draft]

  When mode = "draft":
    "Editing pending draft — changes will not go live until published."
    [Publish draft]  [Discard draft]

The main Save button changes label based on mode:
  live  → "Save"        (existing PUT /content/:slug/:id)
  draft → "Save draft"  (new    PUT /content/:slug/:id/draft)

Discard shows an AlertDialog before calling DELETE.
Publish calls POST publish, invalidates queries, navigates back to the list.

==========================================================================
SECTION 3 — IMPLEMENTATION STEPS
==========================================================================

Follow the steps in order. Each step is atomic and testable on its own.

--------------------------------------------------------------------------
STEP 1 — Extend the API layer
File: apps/dashboard/src/features/content-management/api/content.api.ts
--------------------------------------------------------------------------

Add four methods to the `contentApi` object after the existing `delete` method:

```ts
/** GET /content/:slug/:id/draft — returns draft data or throws 404 */
fetchDraft: async (slug: string, id: string): Promise<ContentEntry> => {
  const response = await api.get<{ data: ContentEntry }>(`/content/${slug}/${id}/draft`)
  return response.data.data
},

/** PUT /content/:slug/:id/draft — upserts the pending draft */
saveDraft: async (
  slug: string,
  id: string,
  data: Record<string, unknown>
): Promise<{ success: boolean }> => {
  const response = await api.put<{ success: boolean }>(`/content/${slug}/${id}/draft`, data)
  return response.data
},

/** POST /content/:slug/:id/draft/publish — atomically promotes draft → live */
publishDraft: async (slug: string, id: string): Promise<{ success: boolean }> => {
  const response = await api.post<{ success: boolean }>(`/content/${slug}/${id}/draft/publish`)
  return response.data
},

/** DELETE /content/:slug/:id/draft — discards the pending draft */
discardDraft: async (slug: string, id: string): Promise<{ success: boolean }> => {
  const response = await api.delete<{ success: boolean }>(`/content/${slug}/${id}/draft`)
  return response.data
},
```

Note: `fetchDraft` unwraps `response.data.data` because the GET draft endpoint returns
`{ data: { ...fields } }`, matching the same envelope as the live GET endpoint.

--------------------------------------------------------------------------
STEP 2 — Add draft query keys
File: apps/dashboard/src/features/content-management/consts/content.keys.ts
--------------------------------------------------------------------------

Add one new key factory after `detail`:

```ts
draft: (slug: string, id: string) =>
  [...CONTENT_QUERY_KEYS.all, "draft", slug, id] as const,
```

--------------------------------------------------------------------------
STEP 3 — Add draft hooks
File: apps/dashboard/src/features/content-management/hooks/use-content-item.ts
--------------------------------------------------------------------------

Add three new exports after `useSaveContent`. Import `contentApi` and
`CONTENT_QUERY_KEYS` are already imported in this file.

```ts
/**
 * Fetches the pending draft for an entry.
 * Only enabled when both slug and id are defined.
 */
export function useDraftEntry(slug: string | undefined, id: string | undefined) {
  return useQuery({
    queryKey: CONTENT_QUERY_KEYS.draft(slug || "", id || ""),
    queryFn: () => {
      if (!slug || !id) throw new Error("Slug and ID are required")
      return contentApi.fetchDraft(slug, id)
    },
    enabled: Boolean(slug && id),
    staleTime: 10 * 1000,
    retry: false,  // 404 is expected when no draft exists
  })
}

/**
 * Saves (upserts) the pending draft.
 * Invalidates the draft query and the live detail query on success.
 */
export function useSaveDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ slug, id, data }: { slug: string; id: string; data: Record<string, unknown> }) =>
      contentApi.saveDraft(slug, id, data),
    onSuccess: (_, { slug, id }) => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.draft(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.detail(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
    },
  })
}

/**
 * Publishes the pending draft (promotes it to live atomically).
 * Invalidates the full content tree and facets.
 */
export function usePublishDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ slug, id }: { slug: string; id: string }) =>
      contentApi.publishDraft(slug, id),
    onSuccess: (_, { slug, id }) => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: FACET_QUERY_KEYS.all })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.draft(slug, id) })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.activity() })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.stats() })
    },
  })
}

/**
 * Discards the pending draft.
 * Invalidates the draft query and the live detail so `has_pending_draft` refreshes.
 */
export function useDiscardDraft() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ slug, id }: { slug: string; id: string }) =>
      contentApi.discardDraft(slug, id),
    onSuccess: (_, { slug, id }) => {
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.draft(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.detail(slug, id) })
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all })
    },
  })
}
```

Also add `FACET_QUERY_KEYS` and `DASHBOARD_QUERY_KEYS` to the imports at the top of the file
(they are already imported in `useSaveContent`, just verify they are in scope).

--------------------------------------------------------------------------
STEP 4 — Re-export new hooks
File: apps/dashboard/src/features/content-management/index.ts
--------------------------------------------------------------------------

The file already re-exports `use-content-item.ts` via `export * from "./hooks/use-content-item"`.
No change needed — new exports are picked up automatically.

--------------------------------------------------------------------------
STEP 5 — Integrate draft mode into the editor
File: apps/dashboard/src/pages/entry-editor.tsx
--------------------------------------------------------------------------

### 5a — Imports

Add to the existing import from `@/features/content-management`:
```ts
import {
  useContentEntry,
  useSaveContent,
  useDraftEntry,
  useSaveDraft,
  usePublishDraft,
  useDiscardDraft,
} from "@/features/content-management"
```

### 5b — New state and hooks inside `EntryEditorPage`

After the existing `useContentEntry` and `useSaveContent` calls, add:

```ts
const [isDraftMode, setIsDraftMode] = React.useState(false)
const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false)

const { data: draftData } = useDraftEntry(
  hasPendingDraftNotice ? schemaSlug : undefined,
  hasPendingDraftNotice ? entryId : undefined
)

const { mutateAsync: saveDraft, isPending: isSavingDraft } = useSaveDraft()
const { mutateAsync: publishDraft, isPending: isPublishing } = usePublishDraft()
const { mutateAsync: discardDraft, isPending: isDiscarding } = useDiscardDraft()
```

`hasPendingDraftNotice` is already computed on line 689 — move its declaration above these
hooks so it is in scope. Current definition:
```ts
const hasPendingDraftNotice = !isCreate && entryData?.has_pending_draft === true
```

### 5c — "Resume draft" handler

```ts
const handleResumeDraft = React.useCallback(() => {
  if (!draftData) return
  setFormData(draftData.data ?? draftData as Record<string, unknown>)
  setIsDraftMode(true)
  setIsDirty(false)
}, [draftData])
```

Note: `fetchDraft` already unwraps `response.data.data`, so `draftData` is the flat field
object returned by the hook. Populate `formData` directly from it.

### 5d — "Publish draft" handler

```ts
const handlePublishDraft = async () => {
  if (!schemaSlug || !entryId) return
  try {
    await publishDraft({ slug: schemaSlug, id: entryId })
    toast.success(t("content.editor.draftPublishSuccess"))
    hasJustSavedRef.current = true
    navigate(`/content/${schemaSlug}`)
  } catch {
    toast.error(t("content.editor.saveError"))
  }
}
```

### 5e — "Discard draft" handler

```ts
const handleDiscardDraft = async () => {
  if (!schemaSlug || !entryId) return
  try {
    await discardDraft({ slug: schemaSlug, id: entryId })
    toast.success(t("content.editor.draftDiscardSuccess"))
    setIsDraftMode(false)
    setIsDirty(false)
    // Reload live data into the form
    if (entryData) {
      setFormData(entryData.data ?? {})
      setStatus(entryData.status ?? "draft")
      setSlug(entryData.slug ?? "")
    }
  } catch {
    toast.error(t("content.editor.saveError"))
  } finally {
    setShowDiscardConfirm(false)
  }
}
```

### 5f — Update `handleSubmit`

Replace the `persistEntry` call with a mode-aware save:

```ts
if (isDraftMode && entryId) {
  // Save to draft endpoint
  const payload = prepareSubmissionPayload({ branches, formData, slug, status })
  await saveDraft({ slug: schemaSlug, id: entryId, data: payload })
  toast.success(t("content.editor.draftSaveSuccess"))
  setIsDirty(false)
  hasJustSavedRef.current = true
  navigate(`/content/${schemaSlug}`)
} else {
  // Existing live save path
  const payload = prepareSubmissionPayload({ branches, formData, slug, status })
  const entryIdForUpdate = isCreate ? null : entryId
  await persistEntry(schemaSlug, payload, entryIdForUpdate)
  setIsDirty(false)
  hasJustSavedRef.current = true
  navigate(`/content/${schemaSlug}`)
}
```

### 5g — Update the Save button label

Replace the `submitButtonLabel` computation:

```ts
const submitButtonLabel = isSaving || isSavingDraft ? (
  <>
    <Loader2 className="mr-2 size-4 animate-spin" />
    {t("content.editor.saving")}
  </>
) : isDraftMode ? (
  t("content.editor.saveDraft")
) : (
  t("content.editor.save")
)
```

### 5h — Replace the static amber banner with `DraftActionBanner`

Remove the existing static banner (lines 718–722):
```tsx
{hasPendingDraftNotice && (
  <div className="mb-4 ...">
    {t("content.editor.pendingDraftNotice")}
  </div>
)}
```

Replace it with:

```tsx
{(hasPendingDraftNotice || isDraftMode) && (
  <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border
                  border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800
                  dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
    <span className="flex-1">
      {isDraftMode
        ? t("content.editor.draftModeNotice")
        : t("content.editor.pendingDraftNotice")}
    </span>
    <div className="flex gap-2">
      {!isDraftMode && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-amber-400 text-amber-800 hover:bg-amber-100
                     dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
          onClick={handleResumeDraft}
          disabled={!draftData}
        >
          {t("content.editor.resumeDraft")}
        </Button>
      )}
      {isDraftMode && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-amber-400 text-amber-800 hover:bg-amber-100
                     dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
          onClick={handlePublishDraft}
          disabled={isPublishing}
        >
          {isPublishing ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
          {t("content.editor.publishDraft")}
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-amber-400 text-amber-800 hover:bg-amber-100
                   dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
        onClick={() => setShowDiscardConfirm(true)}
        disabled={isDiscarding}
      >
        {t("content.editor.discardDraft")}
      </Button>
    </div>
  </div>
)}
```

### 5i — Add the discard confirmation AlertDialog

After the existing unsaved-changes AlertDialog (which ends around line 775), add:

```tsx
<AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("content.editor.discardDraftTitle")}</AlertDialogTitle>
      <AlertDialogDescription>{t("content.editor.discardDraftDesc")}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)}>
        {t("content.editor.stay")}
      </AlertDialogCancel>
      <AlertDialogAction variant="destructive" onClick={handleDiscardDraft} disabled={isDiscarding}>
        {isDiscarding ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
        {t("content.editor.discardDraft")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

--------------------------------------------------------------------------
STEP 6 — Add i18n keys
Files: apps/dashboard/src/locales/en.json
       apps/dashboard/src/locales/it.json
--------------------------------------------------------------------------

In both files, add the following keys inside `content.editor` (after `pendingDraftNotice`):

```json
"draftModeNotice": "Editing pending draft — changes will not go live until published.",
"resumeDraft": "Resume draft",
"saveDraft": "Save draft",
"publishDraft": "Publish draft",
"discardDraft": "Discard draft",
"discardDraftTitle": "Discard pending draft",
"discardDraftDesc": "This will permanently delete the pending draft. The published entry remains unchanged. This action cannot be undone.",
"draftPublishSuccess": "Draft published successfully",
"draftSaveSuccess": "Draft saved",
"draftDiscardSuccess": "Pending draft discarded"
```

Italian translations for `it.json`:
```json
"draftModeNotice": "Stai modificando la bozza in sospeso — le modifiche non saranno live finché non viene pubblicata.",
"resumeDraft": "Riprendi bozza",
"saveDraft": "Salva bozza",
"publishDraft": "Pubblica bozza",
"discardDraft": "Scarta bozza",
"discardDraftTitle": "Scarta bozza in sospeso",
"discardDraftDesc": "La bozza in sospeso verrà eliminata definitivamente. L'entry pubblicata rimane invariata. Questa azione non può essere annullata.",
"draftPublishSuccess": "Bozza pubblicata con successo",
"draftSaveSuccess": "Bozza salvata",
"draftDiscardSuccess": "Bozza in sospeso scartata"
```

--------------------------------------------------------------------------
STEP 7 — Tests
File: apps/dashboard/src/test/pages/entry-editor.test.tsx
--------------------------------------------------------------------------

The existing test file already mocks `useContentEntry` and `useSaveContent`.
Extend the mock of `@/features/content-management` to include the new hooks,
then add the following test suites.

### Mock additions

```ts
const mockFetchDraft = vi.fn()
const mockSaveDraft = vi.fn()
const mockPublishDraft = vi.fn()
const mockDiscardDraft = vi.fn()
```

Inside the `vi.mock("@/features/content-management", ...)` block, add:

```ts
useDraftEntry: (slug: string, id: string) => ({
  data: id ? mockFetchDraft(slug, id) : undefined,
  isLoading: false,
}),
useSaveDraft: () => ({
  mutateAsync: mockSaveDraft,
  isPending: false,
}),
usePublishDraft: () => ({
  mutateAsync: mockPublishDraft,
  isPending: false,
}),
useDiscardDraft: () => ({
  mutateAsync: mockDiscardDraft,
  isPending: false,
}),
```

### Test suite: "DraftActionBanner"

```ts
describe("DraftActionBanner", () => {
  it("renders Resume draft and Discard draft when has_pending_draft is true", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockResolvedValue({
      id: "entry-1", status: "published", slug: "my-post",
      has_pending_draft: true, data: { title: "Live title" },
    })
    mockFetchDraft.mockReturnValue({ title: "Draft title" })

    render(<EntryEditorPage />, { wrapper: TestProviders })

    await waitFor(() => {
      expect(screen.getByText(/resume draft/i)).toBeInTheDocument()
      expect(screen.getByText(/discard draft/i)).toBeInTheDocument()
    })
  })

  it("loads draft data into form when Resume draft is clicked", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockResolvedValue({
      id: "entry-1", status: "published", slug: "my-post",
      has_pending_draft: true, data: { title: "Live title" },
    })
    mockFetchDraft.mockReturnValue({ title: "Draft title" })

    render(<EntryEditorPage />, { wrapper: TestProviders })

    await waitFor(() => screen.getByText(/resume draft/i))
    fireEvent.click(screen.getByText(/resume draft/i))

    await waitFor(() => {
      // Banner should switch to draft mode message
      expect(screen.getByText(/editing pending draft/i)).toBeInTheDocument()
      // Save button should say "Save draft"
      expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument()
    })
  })

  it("calls publishDraft and navigates on Publish draft click", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockResolvedValue({
      id: "entry-1", status: "published", slug: "my-post",
      has_pending_draft: true, data: { title: "Live title" },
    })
    mockFetchDraft.mockReturnValue({ title: "Draft title" })
    mockPublishDraft.mockResolvedValue({ success: true })

    render(<EntryEditorPage />, { wrapper: TestProviders })

    await waitFor(() => screen.getByText(/resume draft/i))
    fireEvent.click(screen.getByText(/resume draft/i))
    await waitFor(() => screen.getByText(/publish draft/i))
    fireEvent.click(screen.getByRole("button", { name: /publish draft/i }))

    await waitFor(() => {
      expect(mockPublishDraft).toHaveBeenCalledWith({ slug: "posts", id: "entry-1" })
      expect(mockNavigate).toHaveBeenCalledWith("/content/posts")
    })
  })

  it("shows confirmation dialog before discarding", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockResolvedValue({
      id: "entry-1", status: "published", slug: "my-post",
      has_pending_draft: true, data: { title: "Live title" },
    })
    mockFetchDraft.mockReturnValue({ title: "Draft title" })

    render(<EntryEditorPage />, { wrapper: TestProviders })

    await waitFor(() => screen.getByText(/discard draft/i))
    fireEvent.click(screen.getByRole("button", { name: /discard draft/i }))

    await waitFor(() => {
      expect(screen.getByText(/discard pending draft/i)).toBeInTheDocument()
    })
  })

  it("calls discardDraft and resets to live mode on confirm", async () => {
    mockUseParams.mockReturnValue({ slug: "posts", id: "entry-1" })
    mockFetchContentById.mockResolvedValue({
      id: "entry-1", status: "published", slug: "my-post",
      has_pending_draft: true, data: { title: "Live title" },
    })
    mockFetchDraft.mockReturnValue({ title: "Draft title" })
    mockDiscardDraft.mockResolvedValue({ success: true })

    render(<EntryEditorPage />, { wrapper: TestProviders })

    await waitFor(() => screen.getByText(/discard draft/i))
    fireEvent.click(screen.getByRole("button", { name: /discard draft/i }))
    await waitFor(() => screen.getByText(/discard pending draft/i))

    // Click confirm button in dialog
    const confirmBtn = screen.getAllByRole("button", { name: /discard draft/i })
      .find(btn => btn.closest('[role="alertdialog"]'))
    fireEvent.click(confirmBtn!)

    await waitFor(() => {
      expect(mockDiscardDraft).toHaveBeenCalledWith({ slug: "posts", id: "entry-1" })
    })
  })
})
```

==========================================================================
SECTION 4 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] When `has_pending_draft: true`, the banner shows "Resume draft" and "Discard draft"
- [ ] Clicking "Resume draft" populates the form with draft field values and switches
      the editor to draft mode (banner updates, Save button label changes to "Save draft")
- [ ] In draft mode, clicking "Save draft" calls `PUT /content/:slug/:id/draft`
- [ ] In draft mode, clicking "Publish draft" calls `POST /content/:slug/:id/draft/publish`,
      shows a success toast, and navigates back to the content list
- [ ] Clicking "Discard draft" (from either mode) opens a confirmation dialog
- [ ] Confirming discard calls `DELETE /content/:slug/:id/draft`, resets the form to live
      entry data, and exits draft mode
- [ ] No regression when `has_pending_draft: false` — banner is hidden, Save behaves as before
- [ ] "Resume draft" button is disabled when draft data has not yet loaded (network latency)
- [ ] All new i18n keys are present in both `en.json` and `it.json`
- [ ] All new tests pass (`npm run test` in `apps/dashboard`)

==========================================================================
SECTION 5 — CONSTRAINTS
==========================================================================

- Do NOT change any backend code. All endpoints are already correct.
- Do NOT change `dynamic-columns.tsx`, `gallery-card.tsx`, or `gallery-peek-panel.tsx`.
  The badge layer is already correct.
- Do NOT move the `DraftActionBanner` to a separate component file — keep it inline
  in `entry-editor.tsx` to avoid over-engineering a single-use pattern.
- The `useDraftEntry` hook must use `retry: false`. A 404 (no draft exists) is not
  an error state — it is expected for entries that have never had a draft.
- Only invalidate `CONTENT_QUERY_KEYS.all` (broad) when publishing or discarding, because
  `has_pending_draft` on list items needs to refresh. For save-only, invalidate both the
  draft key and the detail key (narrow).
