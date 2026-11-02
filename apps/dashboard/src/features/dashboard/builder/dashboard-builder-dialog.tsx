// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  validateDashboardLayout,
  generateDefaultDashboardLayout,
  GLOBAL_SCOPE,
  hasPermission,
  type DashboardLayout,
  type EffectivePermissions,
} from '@beechcms/core'
import { toast } from 'sonner'
import { isApiError, problemCode } from '@/lib/http/api-error'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useSchema } from '@/features/shared'
import { DASHBOARD_QUERY_KEYS } from '@/features/shared'
import { usePermissions } from '@/features/shared/hooks/use-permissions'
import { BuilderPane } from './builder-pane'
import { builderDialogWidth } from './builder-size'
import { useDashboardBuilder } from './use-dashboard-builder'
import { useLayoutRoles } from './use-layout-roles'
import { dashboardBuilderApi } from './api/dashboard-layout.api'
import {
  DASHBOARD_DRAFT_KEY,
  clearAllDashboardDrafts,
  clearDashboardDraft,
  loadDashboardDraft,
} from './dashboard-draft-storage'
import { knownWidgetTypes } from '../registry/widget-registry'

export interface DashboardBuilderDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly initialLayout: DashboardLayout
  /** Width of the dashboard's content area on screen, which the dialog is sized from (see `builderDialogWidth`). */
  readonly referenceWidth?: number
  /** Opened because a draft was found after a reload: if it turns out to be stale the dialog closes again. */
  readonly recovering?: boolean
}

/** The shape of a page while its layout loads, so the content fades in over a frame instead of popping in. */
function BuilderSkeleton() {
  return (
    <div className="flex-1 space-y-4 px-6 pt-1" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-24 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-12 gap-3">
            <Skeleton className="col-span-8 h-32 rounded-2xl" />
            <Skeleton className="col-span-4 h-32 rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function DashboardBuilderDialog({
  open,
  onOpenChange,
  initialLayout,
  referenceWidth,
  recovering = false,
}: Readonly<DashboardBuilderDialogProps>) {
  const { t } = useTranslation()
  const { data: seeds = [] } = useSchema()
  const [isDragging, setIsDragging] = React.useState(false)
  // Each opening checks once whether a reload left a draft behind (reset while closed).
  const recoveryChecked = React.useRef(false)

  const { effective, isLoading: permissionsLoading } = usePermissions()

  const generatedDefault = React.useMemo(() => generateDefaultDashboardLayout(seeds, effective), [seeds, effective])

  const queryClient = useQueryClient()
  const [conflictOpen, setConflictOpen] = React.useState(false)

  // Always fetch the current version: it is echoed as `If-Match`. Focus/reconnect refetches would drop the draft.
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['dashboard-builder-layout'],
    queryFn: dashboardBuilderApi.getLayout,
    enabled: open,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  function handleConflictReload() {
    setConflictOpen(false)
    queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
    refetch()
  }

  const draftSource: DashboardLayout = data?.layout ?? generatedDefault ?? initialLayout
  // Only while open: Save refetches the layout as the dialog closes, and a skeleton swapped in then would replace
  // the builder in the middle of its exit fade.
  const isLoadingDraft = open && (isFetching || permissionsLoading)

  // Reopened after a reload for a draft: if that draft no longer applies (the server moved on, or it was
  // already gone) there is nothing to resume, so the dialog steps aside instead of showing an unasked builder.
  React.useEffect(() => {
    if (!open) {
      recoveryChecked.current = false
      return
    }
    if (!recovering || recoveryChecked.current || isLoadingDraft) return
    recoveryChecked.current = true
    if (loadDashboardDraft(DASHBOARD_DRAFT_KEY, data?.layout ?? null).status !== 'ready') {
      clearAllDashboardDrafts()
      onOpenChange(false)
    }
  }, [open, recovering, isLoadingDraft, data, onOpenChange])

  // Leaving the builder (Back, Esc, Save, a click outside) is not an interruption: it drops the draft.
  // A reload never runs this, which is the whole point.
  function handleOpenChange(next: boolean) {
    if (!next) clearAllDashboardDrafts()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        // The overlay fades as long as the content (its default is 100ms against the content's 200ms), so the
        // blurred backdrop does not snap away while the dialog is still half visible.
        overlayClassName="duration-200"
        className="flex h-[90vh] max-h-[90vh] flex-col gap-0 p-0 duration-200 data-open:zoom-in-100 data-closed:zoom-out-100"
        // Inline, and with the max-width lifted: the width is measured, and the default `sm:max-w-*` would cap it.
        style={{ width: builderDialogWidth(referenceWidth), maxWidth: "96vw" }}
        // Esc belongs to a drag in flight (it cancels it); it must not also close the builder.
        onEscapeKeyDown={(event) => { if (isDragging) event.preventDefault() }}
        onInteractOutside={(event) => { if (isDragging) event.preventDefault() }}
      >
        <DialogHeader className="px-6 pb-2 pt-6">
          <DialogTitle className="text-xl font-semibold leading-tight">{t('dashboard.builder.title')}</DialogTitle>
        </DialogHeader>
        {isLoadingDraft ? (
          <BuilderSkeleton />
        ) : (
          <div className="flex min-h-0 flex-1 animate-in flex-col duration-200 fade-in-0">
            <BuilderPaneController
              serverLayout={data?.layout ?? null}
              initialLayout={draftSource}
              updatedAt={data?.updatedAt ?? null}
              permissions={effective}
              onDraggingChange={setIsDragging}
              onClose={() => handleOpenChange(false)}
              onMutated={() => { refetch() }}
              onConflict={() => setConflictOpen(true)}
            />
          </div>
        )}
      </DialogContent>
      <ConfirmDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        title={t('dashboard.builder.conflictTitle')}
        description={t('dashboard.builder.conflictDesc')}
        onConfirm={handleConflictReload}
      />
    </Dialog>
  )
}

interface BuilderPaneControllerProps {
  /** The layout the server holds (null: nothing stored), to tell whether a kept draft still applies. */
  readonly serverLayout: DashboardLayout | null
  readonly initialLayout: DashboardLayout
  readonly updatedAt: number | null
  readonly permissions: EffectivePermissions
  readonly onDraggingChange: (dragging: boolean) => void
  readonly onClose: () => void
  readonly onMutated: () => void
  readonly onConflict: () => void
}

function BuilderPaneController({
  serverLayout,
  initialLayout,
  updatedAt,
  permissions,
  onDraggingChange,
  onClose,
  onMutated,
  onConflict,
}: Readonly<BuilderPaneControllerProps>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: seeds = [] } = useSchema()

  const { data: roles } = useLayoutRoles(hasPermission(permissions, 'manage_roles', GLOBAL_SCOPE))

  // Unsaved work from before a reload, if the server layout has not moved on since.
  const recovered = React.useMemo(() => {
    const lookup = loadDashboardDraft(DASHBOARD_DRAFT_KEY, serverLayout)
    return lookup.status === 'ready' ? lookup.draft : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ops = useDashboardBuilder({
    initialLayout: recovered?.saved ?? initialLayout,
    restoredDraft: recovered?.layout,
  })
  const [isSaving, setIsSaving] = React.useState(false)

  async function handleSave() {
    const seedSlugs = new Set(seeds.map((s) => s.slug))
    // Without a loaded list the server decides (422 on an unknown role id).
    const roleIds = roles ? new Set(roles.map((r) => r.id)) : undefined
    const result = validateDashboardLayout(ops.draft, {
      seedSlugs,
      knownWidgetTypes: knownWidgetTypes(),
      ...(roleIds ? { roleIds } : {}),
    })
    if (!result.ok) {
      toast.error(result.errors[0] ?? t('dashboard.builder.saveError'))
      return
    }

    setIsSaving(true)
    try {
      await dashboardBuilderApi.saveLayout(result.cleaned, updatedAt)
      clearDashboardDraft(DASHBOARD_DRAFT_KEY)
      toast.success(t('dashboard.builder.saved'))
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onMutated()
      onClose()
    } catch (err) {
      if (problemCode(err) === 'layout-conflict') {
        onConflict()
        return
      }
      const body = isApiError(err) ? err.data : null
      toast.error(body?.detail ?? body?.title ?? t('dashboard.builder.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReset() {
    try {
      await dashboardBuilderApi.resetLayout(updatedAt)
      clearDashboardDraft(DASHBOARD_DRAFT_KEY)
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onMutated()
      toast.success(t('dashboard.builder.resetDone'))
      onClose()
    } catch (err) {
      if (problemCode(err) === 'layout-conflict') {
        onConflict()
        return
      }
      toast.error(t('dashboard.builder.saveError'))
    }
  }

  return (
    <BuilderPane
      serverLayout={serverLayout}
      ops={ops}
      isSaving={isSaving}
      onSave={handleSave}
      onReset={handleReset}
      onClose={onClose}
      onDraggingChange={onDraggingChange}
      permissions={permissions}
      hasStoredLayout={updatedAt !== null}
    />
  )
}
