// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { Plus } from 'reicon-react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Branch } from '@beechcms/core'
import { useAutomations } from '../../hooks/use-automations'
import { useToggleAutomation } from '../../hooks/use-toggle-automation'
import { useDeleteAutomation } from '../../hooks/use-delete-automation'
import { AutomationRow } from './automation-row'
import { AutomationEmptyState } from './automation-empty-state'
import { useAutomationPanel } from './use-automation-panel'
import { AutomationEditor } from '../automation-editor/automation-editor'

interface AutomationPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seedSlug: string
  seedDisplayName: string
  seedBranches: Branch[]
}

export function AutomationPanel({
  open,
  onOpenChange,
  seedSlug,
  seedDisplayName,
  seedBranches,
}: AutomationPanelProps) {
  const { t } = useTranslation()
  const { data: automations = [], isLoading } = useAutomations(open ? seedSlug : undefined)
  const toggleMutation = useToggleAutomation(seedSlug)
  const deleteMutation = useDeleteAutomation(seedSlug)
  const { editorOpen, editingAutomation, openNew, openEdit, closeEditor } = useAutomationPanel()

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-96 p-0 flex flex-col">
          <SheetHeader className="pl-6 pr-12 py-4 border-b flex flex-row items-center justify-between">
            <SheetTitle>{t('automations.panel.title')}</SheetTitle>
            <Button size="sm" onClick={openNew}>
              <Plus className="size-4 mr-1" />
              {t('automations.panel.newButton')}
            </Button>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-2">
              {isLoading && (
                <div className="flex flex-col gap-3 py-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              )}

              {!isLoading && automations.length === 0 && (
                <AutomationEmptyState onNew={openNew} />
              )}

              {!isLoading && automations.length > 0 && (
                <div>
                  {automations.map((automation) => (
                    <AutomationRow
                      key={automation.id}
                      automation={automation}
                      onEdit={() => openEdit(automation)}
                      onDelete={() => deleteMutation.mutate(automation.id)}
                      onToggle={(enabled) =>
                        toggleMutation.mutate({ id: automation.id, enabled })
                      }
                      isToggling={
                        toggleMutation.isPending &&
                        (toggleMutation.variables as any)?.id === automation.id
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AutomationEditor
        open={editorOpen}
        onOpenChange={(o) => { if (!o) closeEditor() }}
        seedSlug={seedSlug}
        seedDisplayName={seedDisplayName}
        seedBranches={seedBranches}
        automation={editingAutomation}
      />
    </>
  )
}
