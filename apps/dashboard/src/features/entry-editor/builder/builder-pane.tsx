// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Loader2, MoreHorizontal, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { Seed, FormLayout, Branch } from '@beechcms/core'
import { generateDefaultLayout, validateLayoutAgainstSeed } from '@beechcms/core'
import type { AxiosError } from 'axios'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

import { SectionCard } from './section-card'
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
        return validateLayoutAgainstSeed(stored, seed).cleaned
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const activeTab = draft.tabs.find((t) => t.id === activeTabId) ?? draft.tabs[0]
  const availableBranches = ops.getAvailableBranches()

  const tabDragIds = draft.tabs.map((t) => `tab:${t.id}`)
  const sectionDragIds = (activeTab?.sections ?? []).map(
    (s) => `section:${activeTab?.id}:${s.id}`
  )

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
      const ax = err as AxiosError<{ title?: string; detail?: string }>
      toast.error(ax.response?.data?.detail ?? ax.response?.data?.title ?? t('layoutBuilder.saveError'))
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

  function handleFieldDrag(activeId: string, overId: string) {
    // field:<tabId>:<sectionId>:<columnId>:<branchId>
    const [, aTabId, aSectionId, aColId, aBranchId] = activeId.split(':')
    const [, oTabId, oSectionId, oColId, oBranchId] = overId.split(':')

    if (aColId === oColId && aSectionId === oSectionId && aTabId === oTabId) {
      // Same column — reorder
      const col = draft.tabs.find((t) => t.id === aTabId)
        ?.sections.find((s) => s.id === aSectionId)
        ?.columns.find((c) => c.id === aColId)
      if (!col) return
      const fromIndex = col.fields.findIndex((f) => f.branchId === aBranchId)
      const toIndex   = col.fields.findIndex((f) => f.branchId === oBranchId)
      if (fromIndex !== -1 && toIndex !== -1) {
        ops.reorderFieldsInColumn(aTabId, aSectionId, aColId, fromIndex, toIndex)
      }
    } else {
      // Different column — move
      const ok = ops.moveField({
        from: { tabId: aTabId, sectionId: aSectionId, columnId: aColId, branchId: aBranchId },
        to:   { tabId: oTabId, sectionId: oSectionId, columnId: oColId },
      })
      if (!ok) {
        const branch = branchById[aBranchId]
        toast.warning(t('layoutBuilder.warnFullWidth', { label: branch?.label ?? '' }))
      }
    }
  }

  function handleTabDrag(activeId: string, overId: string) {
    const fromIndex = draft.tabs.findIndex((t) => `tab:${t.id}` === activeId)
    const toIndex   = draft.tabs.findIndex((t) => `tab:${t.id}` === overId)
    if (fromIndex !== -1 && toIndex !== -1) {
      ops.reorderTabs(fromIndex, toIndex)
      const newTabs = arrayMove(draft.tabs, fromIndex, toIndex)
      ops.setActiveTabId(newTabs[0]?.id ?? '')
    }
  }

  function handleSectionDrag(activeId: string, overId: string) {
    const [, aTabId, aSectionId] = activeId.split(':')
    const [, oTabId] = overId.split(':')
    if (aTabId !== oTabId) {
      toast.warning(t('layoutBuilder.warnNoCrossTabSection'))
      return
    }
    const tab = draft.tabs.find((t) => t.id === aTabId)
    if (!tab) return
    const fromIndex = tab.sections.findIndex((s) => s.id === aSectionId)
    const toIndex   = tab.sections.findIndex((s) => `section:${aTabId}:${s.id}` === overId)
    if (fromIndex !== -1 && toIndex !== -1) {
      ops.reorderSections(aTabId, fromIndex, toIndex)
    }
  }

  function handleColumnDrag(activeId: string, overId: string) {
    const [, aTabId, aSectionId, aColId] = activeId.split(':')
    const [, oTabId, oSectionId, oColId] = overId.split(':')
    if (aTabId === oTabId && aSectionId === oSectionId) {
      const section = draft.tabs.find((t) => t.id === aTabId)?.sections.find((s) => s.id === aSectionId)
      if (!section) return
      const fromIndex = section.columns.findIndex((c) => c.id === aColId)
      const toIndex   = section.columns.findIndex((c) => c.id === oColId)
      if (fromIndex !== -1 && toIndex !== -1) {
        ops.reorderColumns(aTabId, aSectionId, fromIndex, toIndex)
      }
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const isTab     = (id: string) => id.startsWith('tab:')
    const isSection = (id: string) => id.startsWith('section:')
    const isColumn  = (id: string) => id.startsWith('column:')
    const isField   = (id: string) => id.startsWith('field:')

    if (isField(activeId) && isField(overId)) {
      handleFieldDrag(activeId, overId)
    } else if (isTab(activeId) && isTab(overId)) {
      handleTabDrag(activeId, overId)
    } else if (isSection(activeId) && isSection(overId)) {
      handleSectionDrag(activeId, overId)
    } else if (isColumn(activeId) && isColumn(overId)) {
      handleColumnDrag(activeId, overId)
    }
  }

  return (
    <>
      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-4 space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>

          {/* Tab strip */}
          <SortableContext items={tabDragIds} strategy={horizontalListSortingStrategy}>
            <div className="flex items-center gap-1 flex-wrap">
              {draft.tabs.map((tab, idx) => (
                <TabPill
                  key={tab.id}
                  tab={tab}
                  isActive={tab.id === activeTabId}
                  isDefault={idx === 0}
                  dragId={`tab:${tab.id}`}
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
                    dragId={`section:${activeTab.id}:${section.id}`}
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
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('layoutBuilder.resetConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('layoutBuilder.resetConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetConfirmed}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard confirm */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('layoutBuilder.discardTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('layoutBuilder.discardDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { setShowDiscardConfirm(false); onClose() }}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dragId })
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
            if (e.key === 'Enter') {
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
