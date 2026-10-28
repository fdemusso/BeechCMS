// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeft, Eye, EyeOff, Loader as Loader2, Plus } from '@/components/icons'
import { toast } from 'sonner'
import type { DashboardLayout } from '@beechcms/core'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DashboardLayoutRenderer } from '../renderer/dashboard-layout-renderer'
import { DragPreview } from './drag-preview'
import { PageTabsManager } from './page-tabs-manager'
import { SectionCard } from './section-card'
import { WidgetConfigSheet } from './widget-config-sheet'
import { MAX_PAGES, type UseDashboardBuilderResult } from './use-dashboard-builder'
import {
  DashboardDragContext,
  dashboardCollisionDetection,
  dragIds,
  useDashboardDnd,
} from './use-dashboard-dnd'
import { clearDashboardDraft, fingerprintDashboardLayout, saveDashboardDraft } from './dashboard-draft-storage'
import type { ConfigureTarget } from './widget-block'

/** How long after the last change the draft is written; changes in quick succession share one write. */
const DRAFT_SAVE_DELAY_MS = 400

/**
 * Corner radius of the footer buttons: the project-wide control radius (see "Radii" in the layout builder
 * docs). `rounded-lg` is 16px in this theme, which would turn a 32px button into a pill.
 */
const FOOTER_RADIUS = 'rounded-control'

export interface BuilderPaneProps {
  readonly scope: string
  /** The layout the server holds for this scope (null: nothing stored), to tell when a draft goes stale. */
  readonly serverLayout: DashboardLayout | null
  readonly ops: UseDashboardBuilderResult
  readonly isSaving: boolean
  readonly onSave: () => void
  readonly onReset: () => void
  readonly onClose: () => void
  /** Told when a drag starts and ends, so the host can keep `Esc` (which cancels a drag) from closing it. */
  readonly onDraggingChange?: (dragging: boolean) => void
}

export function BuilderPane({
  scope,
  serverLayout,
  ops,
  isSaving,
  onSave,
  onReset,
  onClose,
  onDraggingChange,
}: Readonly<BuilderPaneProps>) {
  const { t } = useTranslation()
  const { draft, activePageId, isDirty } = ops

  const [showResetConfirm, setShowResetConfirm] = React.useState(false)
  const [showPreview, setShowPreview] = React.useState(false)
  const [configTarget, setConfigTarget] = React.useState<ConfigureTarget | null>(null)

  const dnd = useDashboardDnd({ ops })
  // Any drag (widget, column, section or page) freezes the footer: a click mid-drag would save, reset or
  // close a layout that is half-moved. At the drop the buttons go back to their own rules.
  const isDragging = dnd.preview !== null

  React.useEffect(() => {
    onDraggingChange?.(isDragging)
    return () => onDraggingChange?.(false)
  }, [isDragging, onDraggingChange])

  // ── Draft persistence ────────────────────────────────────────────────────
  // Unsaved work is kept in the tab's session storage so a reload resumes it (the dashboard page reopens the
  // builder when a draft is waiting). It is written shortly after each change, but never mid-drag (a widget
  // half-way between columns is not a state worth coming back to), and straight away when the page goes
  // away, which a pending timer would not survive.
  const base = React.useMemo(() => fingerprintDashboardLayout(serverLayout), [serverLayout])
  const latestRef = React.useRef({ draft, saved: ops.saved, isDirty, isDragging })
  React.useEffect(() => {
    latestRef.current = { draft, saved: ops.saved, isDirty, isDragging }
  })

  const writeDraftNow = React.useCallback(() => {
    const latest = latestRef.current
    if (!latest.isDirty || latest.isDragging) return
    saveDashboardDraft(scope, { base, saved: latest.saved, layout: latest.draft })
  }, [scope, base])

  React.useEffect(() => {
    if (isDragging) return
    if (!isDirty) {
      clearDashboardDraft(scope)
      return
    }
    const timer = window.setTimeout(writeDraftNow, DRAFT_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draft, isDirty, isDragging, scope, writeDraftNow])

  React.useEffect(() => {
    window.addEventListener('pagehide', writeDraftNow)
    return () => window.removeEventListener('pagehide', writeDraftNow)
  }, [writeDraftNow])

  const activePage = draft.pages.find((p) => p.id === activePageId) ?? draft.pages[0]
  const otherPages = React.useMemo(
    () => draft.pages.filter((p) => p.id !== activePage?.id),
    [draft.pages, activePage?.id],
  )
  const sectionDragIds = (activePage?.sections ?? []).map((s) => dragIds.section(activePage?.id ?? '', s.id))

  const configWidget = React.useMemo(() => {
    if (!configTarget || !activePage) return null
    return (
      activePage.sections
        .find((s) => s.id === configTarget.sectionId)
        ?.columns.find((c) => c.id === configTarget.columnId)
        ?.widgets.find((w) => w.id === configTarget.widgetId) ?? null
    )
  }, [configTarget, activePage])

  return (
    <>
      <div className="min-w-0 max-w-full flex-1 overflow-y-auto overflow-x-hidden px-6 pb-4 pt-1">
        <DndContext
          sensors={dnd.sensors}
          collisionDetection={dashboardCollisionDetection}
          onDragStart={dnd.onDragStart}
          onDragOver={dnd.onDragOver}
          onDragEnd={dnd.onDragEnd}
          onDragCancel={dnd.onDragCancel}
        >
          <DashboardDragContext.Provider value={dnd.dragState}>
            {/* The spacing lives on this wrapper, not on the scroll container: DndContext appends its own
                elements (screen reader text, live region) after the content, and with `space-y` on the
                container they took part in the spacing and the box grew by 16px a moment after mounting. */}
            <div className="space-y-4">
              <PageTabsManager
                pages={draft.pages}
                activePageId={activePage?.id ?? ''}
                canAdd={draft.pages.length < MAX_PAGES}
                onSetActive={ops.setActivePageId}
                onAddPage={() => { if (!ops.addPage(t('dashboard.builder.page.newPage'))) toast.warning(t('dashboard.builder.warnPageLimit')) }}
                onRenamePage={ops.renamePage}
                onRemovePage={ops.removePage}
                onSetDefault={(id) => ops.movePage(draft.pages.findIndex((p) => p.id === id), 0)}
              />

              {showPreview && activePage ? (
                <div className="animate-in fade-in-0 duration-200">
                  <DashboardLayoutRenderer layout={{ version: 1, pages: [activePage] }} />
                </div>
              ) : (
                activePage && (
                  <>
                    <SortableContext items={sectionDragIds} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {activePage.sections.map((section) => (
                          <SectionCard
                            key={section.id}
                            pageId={activePage.id}
                            section={section}
                            otherPages={otherPages}
                            ops={ops}
                            canRemove={activePage.sections.length > 1}
                            onConfigureWidget={setConfigTarget}
                          />
                        ))}
                      </div>
                    </SortableContext>
                    <Button
                      type="button"
                      variant="outline"
                      className={`w-full ${FOOTER_RADIUS}`}
                      onClick={() => { if (!ops.addSection(activePage.id, 1)) toast.warning(t('dashboard.builder.warnSectionLimit')) }}
                    >
                      <Plus className="mr-2 size-4" />
                      {t('dashboard.builder.section.add')}
                    </Button>
                  </>
                )
              )}
            </div>
          </DashboardDragContext.Provider>

          {/* In a portal on <body>: the builder sits inside a dialog positioned with a CSS transform, which
              becomes the reference of the overlay's `position: fixed` and shifts it away from the pointer. */}
          {createPortal(
            <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
              {dnd.preview ? <DragPreview info={dnd.preview} /> : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      </div>

      {/* ── Footer: Back set apart, then Preview, Reset and Save together ── */}
      <div className="flex shrink-0 items-center justify-end border-t px-6 py-4">
        <ButtonGroup className="[--button-group-radius:min(var(--radius-md),10px)]">
          <ButtonGroup>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={FOOTER_RADIUS}
              aria-label={t('common.back')}
              onClick={onClose}
              disabled={isDragging}
            >
              <ArrowLeft />
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            <Button
              type="button"
              variant="outline"
              className={`${FOOTER_RADIUS} font-normal`}
              aria-pressed={showPreview}
              onClick={() => setShowPreview((v) => !v)}
              disabled={isDragging}
            >
              {showPreview ? <EyeOff /> : <Eye />}
              {showPreview ? t('dashboard.builder.hidePreview') : t('dashboard.builder.showPreview')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`${FOOTER_RADIUS} font-normal`}
              onClick={() => setShowResetConfirm(true)}
              disabled={isDragging}
            >
              {t('dashboard.builder.reset')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`${FOOTER_RADIUS} font-normal`}
              onClick={onSave}
              disabled={!isDirty || isSaving || isDragging}
            >
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {t('dashboard.builder.save')}
            </Button>
          </ButtonGroup>
        </ButtonGroup>
      </div>

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
    </>
  )
}
