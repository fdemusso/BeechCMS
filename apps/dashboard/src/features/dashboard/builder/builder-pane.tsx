// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { Plus, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DashboardLayoutRenderer } from '../renderer/dashboard-layout-renderer'
import { PageTabsManager } from './page-tabs-manager'
import { SectionCard } from './section-card'
import { WidgetPickerDialog } from './widget-picker-dialog'
import { WidgetConfigSheet } from './widget-config-sheet'
import { useDashboardBuilder } from './use-dashboard-builder'

export interface BuilderPaneProps {
  readonly ops: ReturnType<typeof useDashboardBuilder>
  readonly isSaving: boolean
  readonly onSave: () => void
  readonly onReset: () => void
  readonly onClose: () => void
}

export function BuilderPane({ ops, isSaving, onSave, onReset, onClose }: BuilderPaneProps) {
  const { t } = useTranslation()
  const { draft, activePageId, isDirty } = ops

  const [showResetConfirm, setShowResetConfirm] = React.useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false)
  const [showPreview, setShowPreview] = React.useState(false)

  const [pickerTarget, setPickerTarget] = React.useState<{ sectionId: string; columnId: string } | null>(null)
  const [configTarget, setConfigTarget] = React.useState<{ sectionId: string; columnId: string; widgetId: string } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const activePage = draft.pages.find((p) => p.id === activePageId) ?? draft.pages[0]
  const otherPages = draft.pages.filter((p) => p.id !== activePage?.id)

  const pageDragIds = draft.pages.map((p) => `page:${p.id}`)
  const sectionDragIds = (activePage?.sections ?? []).map((s) => `section:${activePage?.id}:${s.id}`)

  const configWidget = React.useMemo(() => {
    if (!configTarget || !activePage) return null
    const section = activePage.sections.find((s) => s.id === configTarget.sectionId)
    const column = section?.columns.find((c) => c.id === configTarget.columnId)
    return column?.widgets.find((w) => w.id === configTarget.widgetId) ?? null
  }, [configTarget, activePage])

  function handleAttemptClose() {
    if (!isDirty) { onClose(); return }
    setShowDiscardConfirm(true)
  }

  function handlePageDrag(activeId: string, overId: string) {
    const fromIndex = draft.pages.findIndex((p) => `page:${p.id}` === activeId)
    const toIndex = draft.pages.findIndex((p) => `page:${p.id}` === overId)
    if (fromIndex !== -1 && toIndex !== -1) {
      ops.movePage(fromIndex, toIndex)
    }
  }

  function handleSectionDrag(activeId: string, overId: string) {
    if (!activePage) return
    const [, aPageId, aSectionId] = activeId.split(':')
    const [, oPageId] = overId.split(':')
    if (aPageId !== oPageId) {
      toast.warning(t('dashboard.builder.warnNoCrossPageSection'))
      return
    }
    const fromIndex = activePage.sections.findIndex((s) => s.id === aSectionId)
    const toIndex = activePage.sections.findIndex((s) => `section:${aPageId}:${s.id}` === overId)
    if (fromIndex !== -1 && toIndex !== -1) {
      ops.moveSection(activePage.id, fromIndex, toIndex)
    }
  }

  function handleWidgetDrag(activeId: string, overId: string) {
    const [, aPageId, aSectionId, aColumnId, aWidgetId] = activeId.split(':')
    const [, oPageId, oSectionId, oColumnId, oWidgetId] = overId.split(':')

    if (aPageId === oPageId && aSectionId === oSectionId && aColumnId === oColumnId) {
      const section = draft.pages.find((p) => p.id === aPageId)?.sections.find((s) => s.id === aSectionId)
      const column = section?.columns.find((c) => c.id === aColumnId)
      if (!column) return
      const fromIndex = column.widgets.findIndex((w) => w.id === aWidgetId)
      const toIndex = column.widgets.findIndex((w) => w.id === oWidgetId)
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        const reordered = arrayMove(column.widgets, fromIndex, toIndex)
        const toIdx = reordered.findIndex((w) => w.id === aWidgetId)
        ops.moveWidget({
          from: { pageId: aPageId, sectionId: aSectionId, columnId: aColumnId, widgetId: aWidgetId },
          to: { pageId: aPageId, sectionId: aSectionId, columnId: aColumnId, index: toIdx },
        })
      }
    } else {
      ops.moveWidget({
        from: { pageId: aPageId, sectionId: aSectionId, columnId: aColumnId, widgetId: aWidgetId },
        to: { pageId: oPageId, sectionId: oSectionId, columnId: oColumnId },
      })
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId.startsWith('page:') && overId.startsWith('page:')) {
      handlePageDrag(activeId, overId)
    } else if (activeId.startsWith('section:') && overId.startsWith('section:')) {
      handleSectionDrag(activeId, overId)
    } else if (activeId.startsWith('widget:') && overId.startsWith('widget:')) {
      handleWidgetDrag(activeId, overId)
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-4 space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={pageDragIds}>
            <PageTabsManager
              pages={draft.pages}
              activePageId={activePage?.id ?? ''}
              onSetActive={ops.setActivePageId}
              onAddPage={ops.addPage}
              onRenamePage={ops.renamePage}
              onRemovePage={ops.removePage}
            />
          </SortableContext>

          {showPreview && activePage ? (
            <DashboardLayoutRenderer layout={{ version: 1, pages: [activePage] }} />
          ) : (
            activePage && (
              <SortableContext items={sectionDragIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {activePage.sections.map((section) => (
                    <SectionCard
                      key={section.id}
                      pageId={activePage.id}
                      section={section}
                      dragId={`section:${activePage.id}:${section.id}`}
                      otherPages={otherPages}
                      canRemove={activePage.sections.length > 1}
                      onUpdate={(updates) => ops.updateSection(activePage.id, section.id, updates)}
                      onSetColumnPreset={(spans) => ops.setColumnPreset(activePage.id, section.id, spans)}
                      onDuplicate={() => ops.duplicateSection(activePage.id, section.id)}
                      onRemove={() => ops.removeSection(activePage.id, section.id)}
                      onAddWidget={(columnId) => setPickerTarget({ sectionId: section.id, columnId })}
                      onConfigureWidget={(columnId, widgetId) => setConfigTarget({ sectionId: section.id, columnId, widgetId })}
                      onRemoveWidget={(columnId, widgetId) => ops.removeWidget(activePage.id, section.id, columnId, widgetId)}
                      onMoveWidgetToPage={(columnId, widgetId, toPageId) => {
                        const ok = ops.moveWidgetToPage({ pageId: activePage.id, sectionId: section.id, columnId, widgetId }, toPageId)
                        if (!ok) toast.error(t('dashboard.builder.errorMoveWidget'))
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            )
          )}

          {!showPreview && activePage && (
            <Button type="button" variant="outline" className="w-full" onClick={() => ops.addSection(activePage.id, 1)}>
              <Plus className="size-4 mr-2" />
              {t('dashboard.builder.section.add')}
            </Button>
          )}
        </DndContext>
      </div>

      <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 pt-4 pb-6 border-t">
        <Button type="button" variant="ghost" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? <EyeOff className="size-4 mr-1" /> : <Eye className="size-4 mr-1" />}
          {showPreview ? t('dashboard.builder.hidePreview') : t('dashboard.builder.showPreview')}
        </Button>
        <Button type="button" variant="ghost" onClick={handleAttemptClose}>
          {t('common.cancel')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowResetConfirm(true)}>
          {t('dashboard.builder.reset')}
        </Button>
        <Button type="button" onClick={onSave} disabled={!isDirty || isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin mr-1" />}
          {t('dashboard.builder.save')}
        </Button>
      </div>

      <WidgetPickerDialog
        open={pickerTarget !== null}
        onOpenChange={(open) => { if (!open) setPickerTarget(null) }}
        onSelect={(type) => {
          if (activePage && pickerTarget) {
            ops.addWidget(activePage.id, pickerTarget.sectionId, pickerTarget.columnId, type)
          }
          setPickerTarget(null)
        }}
      />

      <WidgetConfigSheet
        widget={configWidget}
        onOpenChange={(open) => { if (!open) setConfigTarget(null) }}
        onTitleChange={(title) => {
          if (activePage && configTarget) {
            ops.updateWidgetTitle(activePage.id, configTarget.sectionId, configTarget.columnId, configTarget.widgetId, title)
          }
        }}
        onConfigChange={(config) => {
          if (activePage && configTarget) {
            ops.updateWidgetConfig(activePage.id, configTarget.sectionId, configTarget.columnId, configTarget.widgetId, config)
          }
        }}
        onRemove={() => {
          if (activePage && configTarget) {
            ops.removeWidget(activePage.id, configTarget.sectionId, configTarget.columnId, configTarget.widgetId)
          }
          setConfigTarget(null)
        }}
      />

      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={t('dashboard.builder.resetConfirmTitle')}
        description={t('dashboard.builder.resetConfirmDesc')}
        confirmVariant="destructive"
        onConfirm={() => { setShowResetConfirm(false); onReset() }}
      />

      <ConfirmDialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
        title={t('dashboard.builder.discardTitle')}
        description={t('dashboard.builder.discardDesc')}
        confirmVariant="destructive"
        onConfirm={() => { setShowDiscardConfirm(false); onClose() }}
      />
    </>
  )
}
