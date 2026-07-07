// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.

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
import { Loader2 } from 'lucide-react'
import type { AxiosError } from 'axios'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useSchema } from '@/features/shared'
import { DASHBOARD_QUERY_KEYS } from '@/features/shared'
import { BuilderPane } from './builder-pane'
import { useDashboardBuilder } from './use-dashboard-builder'
import { dashboardBuilderApi } from './api/dashboard-layout.api'
import { knownWidgetTypes } from '../registry/widget-registry'

export interface DashboardBuilderDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly initialLayout: DashboardLayout
}

const SCOPE_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: DEFAULT_DASHBOARD_SCOPE, labelKey: 'dashboard.builder.scope.default' },
  ...KNOWN_DASHBOARD_ROLES.map((role) => ({
    value: roleScope(role),
    labelKey: `dashboard.builder.scope.${role}`,
  })),
]

export function DashboardBuilderDialog({ open, onOpenChange, initialLayout }: DashboardBuilderDialogProps) {
  const { t } = useTranslation()
  const { data: seeds = [] } = useSchema()

  const [scope, setScope] = React.useState<string>(DEFAULT_DASHBOARD_SCOPE)
  const [pendingScope, setPendingScope] = React.useState<string | null>(null)
  const [isDirty, setIsDirty] = React.useState(false)

  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setScope(DEFAULT_DASHBOARD_SCOPE)
      setIsDirty(false)
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

  const isStored = scopeLayoutData?.layout != null
  const isLoadingDraft =
    isScopeLayoutLoading || (scope !== DEFAULT_DASHBOARD_SCOPE && isDefaultLayoutLoading)
  const draftSource: DashboardLayout =
    scopeLayoutData?.layout ?? defaultLayoutData?.layout ?? generatedDefault ?? initialLayout

  function applyScopeChange(next: string) {
    setScope(next)
    setIsDirty(false)
  }

  function handleScopeChange(next: string) {
    if (next === scope) return
    if (isDirty) {
      setPendingScope(next)
      return
    }
    applyScopeChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 gap-0 sm:max-w-[80vw] w-[80vw] h-[90vh] max-h-[90vh]" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-2">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{t('dashboard.builder.title')}</DialogTitle>
            <div className="flex items-center gap-2">
              <Select value={scope} onValueChange={handleScopeChange}>
                <SelectTrigger className="w-48" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isLoadingDraft && (
                <Badge variant={isStored ? 'default' : 'secondary'}>
                  {isStored ? t('dashboard.builder.scope.stored') : t('dashboard.builder.scope.inheritsDefault')}
                </Badge>
              )}
            </div>
          </div>
        </DialogHeader>
        {isLoadingDraft ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <BuilderPaneController
            key={scope}
            scope={scope}
            initialLayout={draftSource}
            onDirtyChange={setIsDirty}
            onClose={() => onOpenChange(false)}
            onScopeMutated={() => {
              refetchScopeLayout()
              refetchDefaultLayout()
              refetchScopes()
            }}
          />
        )}

        <ConfirmDialog
          open={pendingScope !== null}
          onOpenChange={(o) => { if (!o) setPendingScope(null) }}
          title={t('dashboard.builder.discardTitle')}
          description={t('dashboard.builder.discardDesc')}
          confirmVariant="destructive"
          onConfirm={() => {
            const next = pendingScope
            setPendingScope(null)
            if (next) applyScopeChange(next)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

interface BuilderPaneControllerProps {
  readonly scope: string
  readonly initialLayout: DashboardLayout
  readonly onDirtyChange: (dirty: boolean) => void
  readonly onClose: () => void
  readonly onScopeMutated: () => void
}

function BuilderPaneController({ scope, initialLayout, onDirtyChange, onClose, onScopeMutated }: BuilderPaneControllerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: seeds = [] } = useSchema()

  const ops = useDashboardBuilder({ initialLayout })
  const [isSaving, setIsSaving] = React.useState(false)

  React.useEffect(() => {
    onDirtyChange(ops.isDirty)
  }, [ops.isDirty, onDirtyChange])

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
      toast.success(t('dashboard.builder.saved'))
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onScopeMutated()
      onClose()
    } catch (err) {
      const ax = err as AxiosError<{ title?: string; detail?: string }>
      toast.error(ax.response?.data?.detail ?? ax.response?.data?.title ?? t('dashboard.builder.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReset() {
    try {
      await dashboardBuilderApi.resetLayout(scope)
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onScopeMutated()
      toast.success(t('dashboard.builder.resetDone'))
      onClose()
    } catch {
      toast.error(t('dashboard.builder.saveError'))
    }
  }

  return <BuilderPane ops={ops} isSaving={isSaving} onSave={handleSave} onReset={handleReset} onClose={onClose} />
}
