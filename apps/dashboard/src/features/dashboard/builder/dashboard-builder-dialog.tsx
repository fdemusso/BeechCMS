// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { validateDashboardLayout, type DashboardLayout } from '@beechcms/core'
import { toast } from 'sonner'
import type { AxiosError } from 'axios'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSchema } from '@/features/schema'
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

export function DashboardBuilderDialog({ open, onOpenChange, initialLayout }: DashboardBuilderDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: seeds = [] } = useSchema()

  const ops = useDashboardBuilder({ initialLayout })
  const [isSaving, setIsSaving] = React.useState(false)

  async function handleSave() {
    const seedSlugs = new Set(seeds.map((s) => s.slug))
    const result = validateDashboardLayout(ops.draft, { seedSlugs, knownWidgetTypes: knownWidgetTypes() })
    if (!result.ok) {
      toast.error(result.errors[0] ?? t('dashboard.builder.saveError'))
      return
    }

    setIsSaving(true)
    try {
      await dashboardBuilderApi.saveLayout(result.cleaned)
      toast.success(t('dashboard.builder.saved'))
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      onOpenChange(false)
    } catch (err) {
      const ax = err as AxiosError<{ title?: string; detail?: string }>
      toast.error(ax.response?.data?.detail ?? ax.response?.data?.title ?? t('dashboard.builder.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleReset() {
    try {
      await dashboardBuilderApi.resetLayout()
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.layout() })
      toast.success(t('dashboard.builder.resetDone'))
      onOpenChange(false)
    } catch {
      toast.error(t('dashboard.builder.saveError'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col p-0 gap-0 sm:max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh]" showCloseButton={false}>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{t('dashboard.builder.title')}</DialogTitle>
        </DialogHeader>
        <BuilderPane
          ops={ops}
          isSaving={isSaving}
          onSave={handleSave}
          onReset={handleReset}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
