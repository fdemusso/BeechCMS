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
import { Plus, Loader as Loader2, More as MoreHorizontal, Edit as Pencil } from '@/components/icons'
import { toast } from 'sonner'
import type { Seed, FormLayout, Branch } from '@beechcms/core'
import { generateDefaultLayout, reconcileLayoutWithSeed } from '@beechcms/core'
import { isApiError } from '@/lib/http/api-error'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionCard } from './section-card'
import { DragPreview } from './drag-preview'
import { BuilderDragContext, builderCollisionDetection, dragIds, useBuilderDnd } from './use-builder-dnd'
import { useLayoutBuilder } from './use-layout-builder'
import { saveLayout, resetLayout } from '../api/layout.api'

export interface BuilderPaneProps {
  seed: Seed
  branchById: Record<string, Branch>
  onClose: () => void
}

export function BuilderPane({ seed, branchById, onClose }: Readonly<BuilderPaneProps>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const initialLayout = React.useMemo(
    () => {
      const stored = seed.layout as FormLayout | undefined
      if (stored) {
        return reconcileLayoutWithSeed(stored, seed)
      }
      return generateDefaultLayout(seed)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed.slug]
  )

  const ops = useLayoutBuilder({ seed, initialLayout })
  const { draft, activeTabId, isDirty } = ops

  const [isSaving, setIsSaving] = React.useState(false)
  const [showResetConfirm, setShowResetConfirm] = React.useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false)

  const [renamingTabId, setRenamingTabId] = React.useState<string | null>(null)
  const [renameTabValue, setRenameTabValue] = React.useState('')

  const dnd = useBuilderDnd({ ops, branchById })

  const activeTab = draft.tabs.find((t) => t.id === activeTabId) ?? draft.tabs[0]
  const availableBranches = ops.getAvailableBranches()

  const tabDragIds = draft.tabs.map((t) => dragIds.tab(t.id))
  const sectionDragIds = (activeTab?.sections ?? []).map((s) => dragIds.section(activeTab?.id ?? '', s.id))

  function handleAttemptClose() {
    if (!isDirty) { onClose(); return }
    setShowDiscardConfirm(true)
  }

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
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pt-4 pb-4 space-y-4 min-w-0 max-w-full">
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
            <div className="flex items-center gap-1 flex-wrap">
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

          <Button type="button" variant="outline" className="w-full"
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
      <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 pt-4 pb-6 border-t">
        <Button type="button" variant="ghost" onClick={handleAttemptClose}>
          {t('common.cancel')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowResetConfirm(true)}>
          {t('layoutBuilder.reset')}
        </Button>
        <Button type="button" onClick={handleSave} disabled={!isDirty || isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin mr-1" />}
          {t('layoutBuilder.save')}
        </Button>
      </div>

      {/* Reset confirm */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={t('layoutBuilder.resetConfirmTitle')}
        description={t('layoutBuilder.resetConfirmDesc')}
        onConfirm={handleResetConfirmed}
      />

      {/* Discard confirm */}
      <ConfirmDialog
        open={showDiscardConfirm}
        onOpenChange={setShowDiscardConfirm}
        title={t('layoutBuilder.discardTitle')}
        description={t('layoutBuilder.discardDesc')}
        confirmVariant="destructive"
        onConfirm={() => { setShowDiscardConfirm(false); onClose() }}
      />
    </>
  )
}

// ── TabPill ──────────────────────────────────────────────────────────────────

interface TabPillProps {
  tab: { id: string; label: string }
  isActive: boolean
  isDefault: boolean
  dragId: string
  isRenaming: boolean
  renameValue: string
  onSetActive: () => void
  onStartRename: () => void
  onRenameChange: (v: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
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
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm cursor-pointer select-none border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted/50 border-transparent'}`}
      onClick={onSetActive}
      onKeyDown={handleKeyDown}
      {...restAttributes}
      {...listeners}
    >
      {isRenaming ? (
        <Input autoFocus className="h-6 text-sm w-24 px-1" value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onClick={(e) => e.stopPropagation()}
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
        <span>{tab.label}</span>
      )}
      {isDefault && !isRenaming && (
        <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">
          {t('layoutBuilder.defaultTabBadge')}
        </Badge>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ml-1 opacity-60 hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onStartRename}>
            <Pencil className="size-3 mr-2" />{t('layoutBuilder.tabMenu.rename')}
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={onDelete}>
                {t('layoutBuilder.tabMenu.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
