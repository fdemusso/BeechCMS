// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  validateDashboardLayout,
  generateDefaultDashboardLayout,
  DEFAULT_DASHBOARD_SCOPE,
  roleScope,
  KNOWN_DASHBOARD_ROLES,
  type DashboardLayout,
} from '@beechcms/core'
import { toast } from 'sonner'
import { isApiError } from '@/lib/http/api-error'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useSchema } from '@/features/shared'
import { DASHBOARD_QUERY_KEYS } from '@/features/shared'
import { BuilderPane } from './builder-pane'
import { useDashboardBuilder } from './use-dashboard-builder'
import { dashboardBuilderApi } from './api/dashboard-layout.api'
import { clearAllDashboardDrafts, clearDashboardDraft, loadDashboardDraft } from './dashboard-draft-storage'
import { knownWidgetTypes } from '../registry/widget-registry'

export interface DashboardBuilderDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly initialLayout: DashboardLayout
  /** Open on this scope instead of the default one (a draft left by a reload is waiting there). */
  readonly initialScope?: string
  /** Opened because a draft was found after a reload: if it turns out to be stale the dialog closes again. */
  readonly recovering?: boolean
}

const SCOPE_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: DEFAULT_DASHBOARD_SCOPE, labelKey: 'dashboard.builder.scope.default' },
  ...KNOWN_DASHBOARD_ROLES.map((role) => ({
    value: roleScope(role),
    labelKey: `dashboard.builder.scope.${role}`,
  })),
]

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
  initialScope,
  recovering = false,
}: Readonly<DashboardBuilderDialogProps>) {
  const { t } = useTranslation()
  const { data: seeds = [] } = useSchema()

  const [scope, setScope] = React.useState<string>(initialScope ?? DEFAULT_DASHBOARD_SCOPE)
  const [dirtyScopes, setDirtyScopes] = React.useState<ReadonlySet<string>>(new Set())
  const [isDragging, setIsDragging] = React.useState(false)
  const [recoveryChecked, setRecoveryChecked] = React.useState(false)

  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setScope(initialScope ?? DEFAULT_DASHBOARD_SCOPE)
      setDirtyScopes(new Set())
      setRecoveryChecked(false)
    }
  }

  const generatedDefault = React.useMemo(() => generateDefaultDashboardLayout(seeds), [seeds])

  const { data: scopeLayoutData, isLoading: isScopeLayoutLoading, refetch: refetchScopeLayout } = useQuery({
    queryKey: ['dashboard-builder-layout', scope],
    queryFn: () => dashboardBuilderApi.getLayout(scope),
    enabled: open,
  })
  const { data: defaultLayoutData, isLoading: isDefaultLayoutLoading, refetch: refetchDefaultLayout } = useQuery({
    queryKey: ['dashboard-builder-layout', DEFAULT_DASHBOARD_SCOPE],
    queryFn: () => dashboardBuilderApi.getLayout(DEFAULT_DASHBOARD_SCOPE),
    enabled: open && scope !== DEFAULT_DASHBOARD_SCOPE,
  })
  const { refetch: refetchScopes } = useQuery({
    queryKey: ['dashboard-builder-scopes'],
    queryFn: dashboardBuilderApi.getScopes,
    enabled: open,
  })

  const isLoadingDraft =
    isScopeLayoutLoading || (scope !== DEFAULT_DASHBOARD_SCOPE && isDefaultLayoutLoading)
  const draftSource: DashboardLayout =
    scopeLayoutData?.layout ?? defaultLayoutData?.layout ?? generatedDefault ?? initialLayout

  // Reopened after a reload for a draft: if that draft no longer applies (the server moved on, or it was
  // already gone) there is nothing to resume, so the dialog steps aside instead of showing an unasked builder.
  React.useEffect(() => {
    if (!open || !recovering || recoveryChecked || isLoadingDraft) return
    setRecoveryChecked(true)
    if (loadDashboardDraft(scope, scopeLayoutData?.layout ?? null).status !== 'ready') {
      clearAllDashboardDrafts()
      onOpenChange(false)
    }
  }, [open, recovering, recoveryChecked, isLoadingDraft, scope, scopeLayoutData, onOpenChange])

  // Leaving the builder (Back, Esc, Save, a click outside) is not an interruption: it drops every draft.
  // A reload never runs this, which is the whole point.
  function handleOpenChange(next: boolean) {
    if (!next) clearAllDashboardDrafts()
    onOpenChange(next)
  }

  const setScopeDirty = React.useCallback((forScope: string, dirty: boolean) => {
    setDirtyScopes((prev) => {
      if (prev.has(forScope) === dirty) return prev
      const next = new Set(prev)
      if (dirty) next.add(forScope)
      else next.delete(forScope)
      return next
    })
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[90vh] max-h-[90vh] w-[80vw] flex-col gap-0 p-0 duration-200 data-open:zoom-in-100 data-closed:zoom-out-100 sm:max-w-[80vw]"
        showCloseButton={false}
        // Esc belongs to a drag in flight (it cancels it); it must not also close the builder.
        onEscapeKeyDown={(event) => { if (isDragging) event.preventDefault() }}
        onInteractOutside={(event) => { if (isDragging) event.preventDefault() }}
      >
        <DialogHeader className="px-6 pb-2 pt-6">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{t('dashboard.builder.title')}</DialogTitle>
            <div className="flex items-center gap-2">
              {!isLoadingDraft && (
                <span className="text-xs text-muted-foreground">
                  {scopeLayoutData?.layout != null
                    ? t('dashboard.builder.scope.stored')
                    : t('dashboard.builder.scope.inheritsDefault')}
                </span>
              )}
              <Select value={scope} onValueChange={setScope} disabled={isDragging}>
                <SelectTrigger className="w-48" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                      {dirtyScopes.has(opt.value) && (
                        <span aria-hidden className="ml-1.5 inline-block size-1.5 rounded-full bg-foreground/50 align-middle" />
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </DialogHeader>
        {isLoadingDraft ? (
          <BuilderSkeleton />
        ) : (
          <div className="flex min-h-0 flex-1 animate-in flex-col duration-200 fade-in-0" key={scope}>
            <BuilderPaneController
              scope={scope}
              serverLayout={scopeLayoutData?.layout ?? null}
              initialLayout={draftSource}
              onDirtyChange={setScopeDirty}
              onDraggingChange={setIsDragging}
              onClose={() => handleOpenChange(false)}
              onScopeMutated={() => {
                refetchScopeLayout()
                refetchDefaultLayout()
                refetchScopes()
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface BuilderPaneControllerProps {
  readonly scope: string
  readonly serverLayout: DashboardLayout | null
  readonly initialLayout: DashboardLayout
  readonly onDirtyChange: (scope: string, dirty: boolean) => void
  readonly onDraggingChange: (dragging: boolean) => void
  readonly onClose: () => void
  readonly onScopeMutated: () => void
}

function BuilderPaneController({
  scope,
  serverLayout,
  initialLayout,
  onDirtyChange,
  onDraggingChange,
  onClose,
  onScopeMutated,
}: Readonly<BuilderPaneControllerProps>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: seeds = [] } = useSchema()

  // Unsaved work from a previous visit (or from before a reload), if the server layout has not moved on since.
  const recovered = React.useMemo(() => {
    const lookup = loadDashboardDraft(scope, serverLayout)
    return lookup.status === 'ready' ? lookup.draft : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  const ops = useDashboardBuilder({
    initialLayout: recovered?.saved ?? initialLayout,
    restoredDraft: recovered?.layout,
  })
  const [isSaving, setIsSaving] = React.useState(false)

  React.useEffect(() => {
    onDirtyChange(scope, ops.isDirty)
  }, [scope, ops.isDirty, onDirtyChange])

  async function handleSave() {
    const seedSlugs = new Set(seeds.map((s) => s.slug))
    const result = validateDashboardLayout(ops.draft, { seedSlugs, knownWidgetTypes: knownWidgetTypes() })
    if (!result.ok) {
      toast.error(result.errors[0] ?? t('dashboard.builder.saveError'))
      return
    }

    setIsSaving(true)
    try {
      await dashboardBuilderApi.saveLayout(scope, result.cleaned)
      clearDashboardDraft(scope)
      toast.success(t('dashboard.builder.saved'))
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onScopeMutated()
      onClose()
    } catch (err) {
      const body = isApiError(err) ? err.data : null
      toast.error(body?.detail ?? body?.title ?? t('dashboard.builder.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReset() {
    try {
      await dashboardBuilderApi.resetLayout(scope)
      clearDashboardDraft(scope)
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onScopeMutated()
      toast.success(t('dashboard.builder.resetDone'))
      onClose()
    } catch {
      toast.error(t('dashboard.builder.saveError'))
    }
  }

  return (
    <BuilderPane
      scope={scope}
      serverLayout={serverLayout}
      ops={ops}
      isSaving={isSaving}
      onSave={handleSave}
      onReset={handleReset}
      onClose={onClose}
      onDraggingChange={onDraggingChange}
    />
  )
}
