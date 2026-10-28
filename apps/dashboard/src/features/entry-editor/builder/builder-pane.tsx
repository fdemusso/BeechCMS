// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, Plus, Loader as Loader2, Edit as Pencil, Home, Trash2, X } from '@/components/icons'
import { toast } from 'sonner'
import type { Seed, FormLayout, Branch } from '@beechcms/core'
import { generateDefaultLayout, reconcileLayoutWithSeed } from '@beechcms/core'
import { isApiError } from '@/lib/http/api-error'

import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionCard } from './section-card'
import { DragPreview } from './drag-preview'
import { BuilderDragContext, builderCollisionDetection, dragIds, useBuilderDnd } from './use-builder-dnd'
import { clearLayoutDraft, fingerprintLayout, loadLayoutDraft, saveLayoutDraft } from './layout-draft-storage'
import { useLayoutBuilder } from './use-layout-builder'
import { saveLayout, resetLayout } from '../api/layout.api'

/**
 * Corner radius of the footer buttons. `rounded-lg` is 16px in this theme, which turns a 32px-high button
 * into a pill; the footer caps it at 10px, the radius of the smallest buttons. The same value is given to
 * the group (`--button-group-radius`), whose last button would otherwise be forced back to `rounded-lg`.
 */
const FOOTER_RADIUS = 'rounded-[min(var(--radius-md),10px)]'

/** How long after the last change the draft is written; changes in quick succession share one write. */
const DRAFT_SAVE_DELAY_MS = 400

export interface BuilderPaneProps {
  seed: Seed
  branchById: Record<string, Branch>
  onClose: () => void
  /** Told when a drag starts and ends, so the host can keep `Esc` (which cancels a drag) from closing it. */
  onDraggingChange?: (dragging: boolean) => void
}

export function BuilderPane({ seed, branchById, onClose, onDraggingChange }: Readonly<BuilderPaneProps>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Unsaved work from a previous visit (or before a reload), if the server layout has not moved on since.
  const draftLookup = React.useMemo(
    () => loadLayoutDraft(seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed.slug]
  )
  const restored = draftLookup.status === 'ready' ? draftLookup.draft : null

  const initialLayout = React.useMemo(
    () => {
      // A restored draft keeps the saved layout it was measured against, so "unsaved" stays accurate.
      if (restored) return reconcileLayoutWithSeed(restored.saved, seed)
      const stored = seed.layout as FormLayout | undefined
      if (stored) {
        return reconcileLayoutWithSeed(stored, seed)
      }
      return generateDefaultLayout(seed)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed.slug]
  )
  const restoredLayout = React.useMemo(
    () => (restored ? reconcileLayoutWithSeed(restored.layout, seed) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed.slug]
  )

  const ops = useLayoutBuilder({ seed, initialLayout, restoredDraft: restoredLayout })
  const { draft, activeTabId, isDirty } = ops

  const [isSaving, setIsSaving] = React.useState(false)
  const [showResetConfirm, setShowResetConfirm] = React.useState(false)

  const [renamingTabId, setRenamingTabId] = React.useState<string | null>(null)
  const [renameTabValue, setRenameTabValue] = React.useState('')

  const dnd = useBuilderDnd({ ops, branchById })
  // Any drag — field, column, section or tab — freezes the footer: a click mid-drag would save, reset or
  // close a layout that is half-moved. At the drop the buttons go back to their own rules.
  const isDragging = dnd.preview !== null

  React.useEffect(() => {
    onDraggingChange?.(isDragging)
    return () => onDraggingChange?.(false)
  }, [isDragging, onDraggingChange])

  // ── Draft persistence ────────────────────────────────────────────────────
  // Unsaved work is kept in the tab's session storage so a reload resumes it (the entry editor shell reopens
  // the builder when a draft is waiting). It is written shortly after each change, but never mid-drag (a
  // field half-way between columns is not a state worth coming back to), and straight away when the page
  // goes away, which a pending timer would not survive.
  const base = React.useMemo(() => fingerprintLayout(seed.layout as FormLayout | undefined), [seed.layout])
  const latestRef = React.useRef({ draft, saved: ops.saved, isDirty, isDragging })
  React.useEffect(() => {
    latestRef.current = { draft, saved: ops.saved, isDirty, isDragging }
  })

  const writeDraftNow = React.useCallback(() => {
    const latest = latestRef.current
    if (!latest.isDirty || latest.isDragging) return
    saveLayoutDraft(seed.slug, { base, saved: latest.saved, layout: latest.draft })
  }, [seed.slug, base])

  React.useEffect(() => {
    if (isDragging) return
    if (!isDirty) {
      clearLayoutDraft(seed.slug)
      return
    }
    const timer = window.setTimeout(writeDraftNow, DRAFT_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [draft, isDirty, isDragging, seed.slug, writeDraftNow])

  React.useEffect(() => {
    window.addEventListener('pagehide', writeDraftNow)
    return () => window.removeEventListener('pagehide', writeDraftNow)
  }, [writeDraftNow])

  // Leaving the builder — cancel, closing the dialog, save — is not an interruption: it drops the draft.
  // A reload never runs this (the page is torn down without unmounting), which is the whole point.
  React.useEffect(() => () => clearLayoutDraft(seed.slug), [seed.slug])

  const activeTab = draft.tabs.find((t) => t.id === activeTabId) ?? draft.tabs[0]
  const { getAvailableBranches } = ops
  const availableBranches = React.useMemo(() => getAvailableBranches(), [getAvailableBranches])

  const tabDragIds = draft.tabs.map((t) => dragIds.tab(t.id))
  const sectionDragIds = (activeTab?.sections ?? []).map((s) => dragIds.section(activeTab?.id ?? '', s.id))

  async function handleSave() {
    setIsSaving(true)
    try {
      await saveLayout(seed.slug, draft)
      toast.success(t('layoutBuilder.saved'))
      queryClient.invalidateQueries({ queryKey: ['schema'] })
      onClose()
    } catch (err) {
      const body = isApiError(err) ? err.data : null
      toast.error(body?.detail ?? body?.title ?? t('layoutBuilder.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleResetConfirmed() {
    try {
      await resetLayout(seed.slug)
      ops.reset()
      queryClient.invalidateQueries({ queryKey: ['schema'] })
      toast.success(t('layoutBuilder.resetDone'))
    } catch {
      toast.error(t('layoutBuilder.saveError'))
    } finally {
      setShowResetConfirm(false)
    }
  }

  function commitTabRename() {
    if (renamingTabId && renameTabValue.trim()) {
      ops.renameTab(renamingTabId, renameTabValue.trim())
    }
    setRenamingTabId(null)
  }

  return (
    <>
      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pt-1 pb-4 space-y-4 min-w-0 max-w-full">
        <DndContext
          sensors={dnd.sensors}
          collisionDetection={builderCollisionDetection}
          onDragStart={dnd.onDragStart}
          onDragOver={dnd.onDragOver}
          onDragEnd={dnd.onDragEnd}
          onDragCancel={dnd.onDragCancel}
        >
          <BuilderDragContext.Provider value={dnd.dragState}>

          {/* Tab strip */}
          <SortableContext items={tabDragIds} strategy={horizontalListSortingStrategy}>
            <div className="flex items-center gap-0.5 flex-wrap">
              {draft.tabs.map((tab, idx) => (
                <TabPill
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isDefault={idx === 0}
                  dragId={dragIds.tab(tab.id)}
                  isRenaming={renamingTabId === tab.id}
                  renameValue={renameTabValue}
                  onSetActive={() => ops.setActiveTabId(tab.id)}
                  onStartRename={() => { setRenameTabValue(tab.label); setRenamingTabId(tab.id) }}
                  onRenameChange={setRenameTabValue}
                  onRenameCommit={commitTabRename}
                  onRenameCancel={() => setRenamingTabId(null)}
                  onSetDefault={() => ops.reorderTabs(idx, 0)}
                  onDelete={() => {
                    if (draft.tabs.length <= 1) return
                    const nextTab = draft.tabs.find((t) => t.id !== tab.id)
                    ops.removeTab(tab.id)
                    if (nextTab) ops.setActiveTabId(nextTab.id)
                  }}
                  canDelete={draft.tabs.length > 1}
                />
              ))}
              <Button type="button" variant="ghost" size="sm" className="gap-1 text-muted-foreground"
                onClick={() => { ops.addTab() }}>
                <Plus className="size-4" />
                {t('layoutBuilder.addTab')}
              </Button>
            </div>
          </SortableContext>

          {/* Section list */}
          {activeTab && (
            <SortableContext items={sectionDragIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {activeTab.sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    tabId={activeTab.id}
                    section={section}
                    branchById={branchById}
                    availableBranches={availableBranches}
                    ops={ops}
                    dragId={dragIds.section(activeTab.id, section.id)}
                  />
                ))}
              </div>
            </SortableContext>
          )}

          <Button type="button" variant="outline" className={`w-full ${FOOTER_RADIUS}`}
            onClick={() => activeTab && ops.addSection(activeTab.id, 2)}>
            <Plus className="size-4 mr-2" />
            {t('layoutBuilder.addSection')}
          </Button>
          </BuilderDragContext.Provider>

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

      {/* ── Footer — same layout as the form footer ── */}
      <div className="flex-shrink-0 flex items-center justify-end px-6 pt-4 pb-6 border-t">
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
            <Button type="button" variant="outline" className={FOOTER_RADIUS} onClick={() => setShowResetConfirm(true)} disabled={isDragging}>
              {t('layoutBuilder.reset')}
            </Button>
            <Button type="button" variant="outline" className={FOOTER_RADIUS} onClick={handleSave} disabled={!isDirty || isSaving || isDragging}>
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              {t('layoutBuilder.save')}
            </Button>
          </ButtonGroup>
        </ButtonGroup>
      </div>

      {/* Reset confirm */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={t('layoutBuilder.resetConfirmTitle')}
        description={t('layoutBuilder.resetConfirmDesc')}
        onConfirm={handleResetConfirmed}
      />

    </>
  )
}

// ── TabPill ──────────────────────────────────────────────────────────────────

interface TabPillProps {
  tab: { id: string; label: string }
  isActive: boolean
  /** The first tab is the one the entry opens on. */
  isDefault: boolean
  dragId: string
  isRenaming: boolean
  renameValue: string
  onSetActive: () => void
  onStartRename: () => void
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onSetDefault: () => void
  onDelete: () => void
  canDelete: boolean
}

function TabPill({
  tab,
  isActive,
  isDefault,
  dragId,
  isRenaming,
  renameValue,
  onSetActive,
  onStartRename,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onSetDefault,
  onDelete,
  canDelete,
}: Readonly<TabPillProps>) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId, data: { type: 'tab' } })
  const { role: _role, tabIndex: _tabIndex, ...restAttributes } = attributes

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSetActive()
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          role="button"
          tabIndex={0}
          className={`group/tab flex h-8 shrink-0 items-center rounded-full px-3 text-sm cursor-pointer select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={onSetActive}
          onDoubleClick={onStartRename}
          onKeyDown={handleKeyDown}
          {...restAttributes}
          {...listeners}
        >
          {isDefault && !isRenaming && (
            <Home className="mr-1.5 size-3.5 shrink-0" aria-label={t('layoutBuilder.defaultTabBadge')} />
          )}
          {isRenaming ? (
            <Input autoFocus maxLength={15} className="h-6 w-24 rounded-md px-1 text-sm focus-visible:ring-1 focus-visible:ring-ring/30" value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onBlur={onRenameCommit}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  onRenameCommit()
                }
                if (e.key === 'Escape') {
                  onRenameCancel()
                }
              }}
            />
          ) : (
            <span className="truncate max-w-32">{tab.label}</span>
          )}
          {canDelete && !isRenaming && (
            // The slot is 0 wide until the pill is hovered, then opens to the button's width, so the label
            // does not sit off-centre while the X is hidden.
            <span className="grid grid-cols-[0fr] transition-[grid-template-columns,margin] duration-150 group-hover/tab:ml-1.5 group-hover/tab:grid-cols-[1fr] group-focus-within/tab:ml-1.5 group-focus-within/tab:grid-cols-[1fr]">
              <span className="overflow-hidden">
                <button
                  type="button"
                  aria-label={t('layoutBuilder.tabMenu.delete')}
                  className="flex size-4 items-center justify-center rounded-full text-destructive opacity-0 transition-opacity hover:bg-destructive/15 group-hover/tab:opacity-100 focus-visible:opacity-100 group-focus-within/tab:opacity-100"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onDelete() }}
                >
                  <X className="size-3" />
                </button>
              </span>
            </span>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onStartRename}>
          <Pencil className="size-4" />
          {t('layoutBuilder.tabMenu.rename')}
        </ContextMenuItem>
        <ContextMenuItem disabled={isDefault} onSelect={onSetDefault}>
          <Home className="size-4" />
          {t('layoutBuilder.tabMenu.setDefault')}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" disabled={!canDelete} onSelect={onDelete}>
          <Trash2 className="size-4" />
          {t('layoutBuilder.tabMenu.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
