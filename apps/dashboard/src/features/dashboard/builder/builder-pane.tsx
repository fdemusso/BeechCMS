// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ArrowLeft, Eye, EyeOff, Loader as Loader2, Plus } from '@/components/icons'
import { toast } from 'sonner'
import {
  GLOBAL_SCOPE,
  filterDashboardLayoutByWidgetRequirements,
  hasPermission,
  type DashboardLayout,
  type DashboardPageLayout,
  type EffectivePermissions,
} from '@beechcms/core'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ButtonGroup } from '@/components/ui/button-group'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { DashboardLayoutRenderer } from '../renderer/dashboard-layout-renderer'
import { widgetRequirementOf } from '../registry/widget-registry'
import { DragPreview } from './drag-preview'
import { PageAudiencePicker } from './page-audience-picker'
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
import { useDashboardDraftPersistence } from './use-dashboard-draft-persistence'
import type { ConfigureTarget } from './widget-block'

/**
 * Corner radius of the footer buttons: the project-wide control radius (see "Radii" in the layout builder
 * docs). `rounded-lg` is 16px in this theme, which would turn a 32px button into a pill.
 */
const FOOTER_RADIUS = 'rounded-control'

export interface BuilderPaneProps {
  /** The layout the server holds (null: nothing stored), to tell when a draft goes stale. */
  readonly serverLayout: DashboardLayout | null
  readonly ops: UseDashboardBuilderResult
  readonly isSaving: boolean
  readonly onSave: () => void
  readonly onReset: () => void
  readonly onClose: () => void
  /** Told when a drag starts and ends, so the host can keep `Esc` (which cancels a drag) from closing it. */
  readonly onDraggingChange?: (dragging: boolean) => void
  /** The author's authority: it decides which controls show and how the preview is projected. */
  readonly permissions: EffectivePermissions
  /** False when nothing is stored yet: the first save is structural (server 403 for non-`manage_roles@*`). */
  readonly hasStoredLayout: boolean
}

interface BuilderFooterProps {
  readonly isDragging: boolean
  readonly isDirty: boolean
  readonly isSaving: boolean
  readonly showPreview: boolean
  readonly canReset: boolean
  readonly firstSaveBlocked: boolean
  readonly onClose: () => void
  readonly onTogglePreview: () => void
  readonly onRequestReset: () => void
  readonly onSave: () => void
}

function BuilderFooter({
  isDragging,
  isDirty,
  isSaving,
  showPreview,
  canReset,
  firstSaveBlocked,
  onClose,
  onTogglePreview,
  onRequestReset,
  onSave,
}: Readonly<BuilderFooterProps>) {
  const { t } = useTranslation()
  // Back set apart, then Preview, Reset and Save together.
  return (
  <div className="flex shrink-0 items-center justify-end gap-4 border-t px-6 py-4">
    {firstSaveBlocked && (
      <p className="mr-auto text-sm text-muted-foreground">{t('dashboard.builder.firstSaveNeedsRoles')}</p>
    )}
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
          onClick={onTogglePreview}
          disabled={isDragging}
        >
          {showPreview ? <EyeOff /> : <Eye />}
          {showPreview ? t('dashboard.builder.hidePreview') : t('dashboard.builder.showPreview')}
        </Button>
        {canReset && (
          <Button
            type="button"
            variant="outline"
            className={`${FOOTER_RADIUS} font-normal`}
            onClick={onRequestReset}
            disabled={isDragging}
          >
            {t('dashboard.builder.reset')}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className={`${FOOTER_RADIUS} font-normal`}
          onClick={onSave}
          disabled={!isDirty || isSaving || isDragging || firstSaveBlocked}
        >
          {isSaving && <Loader2 className="size-4 animate-spin" />}
          {t('dashboard.builder.save')}
        </Button>
      </ButtonGroup>
    </ButtonGroup>
  </div>
  )
}

export function BuilderPane({
  serverLayout,
  ops,
  isSaving,
  onSave,
  onReset,
  onClose,
  onDraggingChange,
  permissions,
  hasStoredLayout,
}: Readonly<BuilderPaneProps>) {
  const { t } = useTranslation()
  const { draft, activePageId, isDirty } = ops
  // Tabs, their audience and Reset are structural (`manage_roles@*`); `manage_layout` edits tab content only.
  const canEditStructure = hasPermission(permissions, 'manage_roles', GLOBAL_SCOPE)
  const firstSaveBlocked = !canEditStructure && !hasStoredLayout

  const [showResetConfirm, setShowResetConfirm] = React.useState(false)
  const [showPreview, setShowPreview] = React.useState(false)
  const [configTarget, setConfigTarget] = React.useState<ConfigureTarget | null>(null)

  const dnd = useDashboardDnd({ ops, onDraggingChange })
  // Any drag (widget, column, section or page) freezes the footer: a click mid-drag would save, reset or
  // close a layout that is half-moved. At the drop the buttons go back to their own rules.
  const isDragging = dnd.preview !== null

  useDashboardDraftPersistence({ serverLayout, draft, saved: ops.saved, isDirty, isDragging })

  const activePage = draft.pages.find((p) => p.id === activePageId) ?? draft.pages[0]
  // The blocks only use the other pages' ids and names (the "Move to page" menu), so the list keeps its identity
  // until one of those changes; otherwise every move would redraw every widget.
  const otherPagesRef = React.useRef<readonly DashboardPageLayout[]>([])
  const otherPagesNow = draft.pages.filter((p) => p.id !== activePage?.id)
  const previousOtherPages = otherPagesRef.current
  if (
    previousOtherPages.length !== otherPagesNow.length ||
    otherPagesNow.some((p, i) => p.id !== previousOtherPages[i].id || p.label !== previousOtherPages[i].label)
  ) {
    otherPagesRef.current = otherPagesNow
  }
  const otherPages = otherPagesRef.current
  const sectionDragIds = (activePage?.sections ?? []).map((s) => dragIds.section(activePage?.id ?? '', s.id))

  // The preview shows the tab as a reader with this authority would see it, without the widgets they cannot use.
  const previewLayout = React.useMemo(
    () => activePage
      ? filterDashboardLayoutByWidgetRequirements({ version: 1, pages: [activePage] }, permissions, widgetRequirementOf)
      : null,
    [activePage, permissions],
  )

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
      {/* The viewport's inner box is `display: table` in Radix, which lets wide content push past the dialog; forcing
          it to block keeps the columns' `min-w-0` and `truncate` working (same override as relation-multi). */}
      <ScrollArea className="min-h-0 min-w-0 max-w-full flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="min-w-0 max-w-full px-6 pb-4 pt-1">
          <DndContext
            sensors={dnd.sensors}
            collisionDetection={dashboardCollisionDetection}
            onDragStart={dnd.onDragStart}
            onDragMove={dnd.onDragMove}
            onDragEnd={dnd.onDragEnd}
            onDragCancel={dnd.onDragCancel}
          >
            <DashboardDragContext.Provider value={dnd.dragState}>
              {/* The spacing lives on this wrapper, not on the scroll container: DndContext appends its own
                  elements (screen reader text, live region) after the content, and with `space-y` on the
                  container they took part in the spacing and the box grew by 16px a moment after mounting. */}
              <div className="space-y-4">
                {/* Tabs on the left, the audience of the active tab on the right, on the same row. */}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <PageTabsManager
                    pages={draft.pages}
                    activePageId={activePage?.id ?? ''}
                    canAdd={draft.pages.length < MAX_PAGES}
                    onSetActive={ops.setActivePageId}
                    onAddPage={() => { if (!ops.addPage(t('dashboard.builder.page.newPage'))) toast.warning(t('dashboard.builder.warnPageLimit')) }}
                    onRenamePage={ops.renamePage}
                    onRemovePage={ops.removePage}
                    onSetDefault={(id) => ops.movePage(draft.pages.findIndex((p) => p.id === id), 0)}
                    canEditStructure={canEditStructure}
                  />
                  {!showPreview && activePage && canEditStructure && (
                    <div className="ml-auto">
                      <PageAudiencePicker roleIds={activePage.roles ?? []} onChange={(ids) => ops.setPageRoles(activePage.id, ids)} />
                    </div>
                  )}
                </div>

                {showPreview && previewLayout ? (
                  <div className="animate-in fade-in-0 duration-200">
                    <DashboardLayoutRenderer layout={previewLayout} />
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
                              ops={ops.actions}
                              permissions={permissions}
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
      </ScrollArea>

      <BuilderFooter
        isDragging={isDragging}
        isDirty={isDirty}
        isSaving={isSaving}
        showPreview={showPreview}
        canReset={canEditStructure}
        firstSaveBlocked={firstSaveBlocked}
        onClose={onClose}
        onTogglePreview={() => setShowPreview((v) => !v)}
        onRequestReset={() => setShowResetConfirm(true)}
        onSave={onSave}
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
    </>
  )
}
