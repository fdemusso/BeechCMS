// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  validateDashboardLayout,
  generateDefaultDashboardLayout,
  type DashboardLayout,
  type EffectivePermissions,
} from '@beechcms/core'
import { toast } from 'sonner'
import { Loader as Loader2 } from '@/components/icons'
import { isApiError } from '@/lib/http/api-error'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSchema } from '@/features/shared'
import { DASHBOARD_QUERY_KEYS } from '@/features/shared'
import { usePermissions } from '@/features/shared/hooks/use-permissions'
import { BuilderPane } from './builder-pane'
import { useDashboardBuilder } from './use-dashboard-builder'
import { useLayoutRoles } from './use-layout-roles'
import { dashboardBuilderApi } from './api/dashboard-layout.api'
import { knownWidgetTypes } from '../registry/widget-registry'

export interface DashboardBuilderDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly initialLayout: DashboardLayout
}

export function DashboardBuilderDialog({ open, onOpenChange, initialLayout }: DashboardBuilderDialogProps) {
  const { t } = useTranslation()
  const { data: seeds = [] } = useSchema()

  const { effective, isLoading: permissionsLoading } = usePermissions()

  const generatedDefault = React.useMemo(() => generateDefaultDashboardLayout(seeds, effective), [seeds, effective])

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-builder-layout'],
    queryFn: dashboardBuilderApi.getLayout,
    enabled: open,
  })

  const draftSource: DashboardLayout = data?.layout ?? generatedDefault ?? initialLayout

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 gap-0 sm:max-w-[80vw] w-[80vw] h-[90vh] max-h-[90vh]" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{t('dashboard.builder.title')}</DialogTitle>
        </DialogHeader>
        {isLoading || permissionsLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <BuilderPaneController
            initialLayout={draftSource}
            permissions={effective}
            onClose={() => onOpenChange(false)}
            onMutated={() => { refetch() }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface BuilderPaneControllerProps {
  readonly initialLayout: DashboardLayout
  readonly permissions: EffectivePermissions
  readonly onClose: () => void
  readonly onMutated: () => void
}

function BuilderPaneController({ initialLayout, permissions, onClose, onMutated }: BuilderPaneControllerProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: seeds = [] } = useSchema()

  const { data: roles } = useLayoutRoles()

  const ops = useDashboardBuilder({ initialLayout })
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
      await dashboardBuilderApi.saveLayout(result.cleaned)
      toast.success(t('dashboard.builder.saved'))
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onMutated()
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
      await dashboardBuilderApi.resetLayout()
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onMutated()
      toast.success(t('dashboard.builder.resetDone'))
      onClose()
    } catch {
      toast.error(t('dashboard.builder.saveError'))
    }
  }

  return (
    <BuilderPane
      ops={ops}
      isSaving={isSaving}
      onSave={handleSave}
      onReset={handleReset}
      onClose={onClose}
      permissions={permissions}
    />
  )
}
