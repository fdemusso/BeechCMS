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
import type { AxiosError } from 'axios'
import type { Seed, FormLayout, Branch } from '@beechcms/core'
import { generateDefaultLayout, isFullWidthBranch } from '@beechcms/core'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import { ConfirmDialog } from './confirm-dialog'
import { LayoutRenderer } from '../renderer/layout-renderer'
import { SectionCard } from './section-card'
import { useLayoutBuilder } from './use-layout-builder'
import { saveLayout, resetLayout } from '../api/layout.api'

export interface LayoutBuilderDialogProps {
  readonly seed: Seed
  readonly open: boolean
  readonly onClose: () => void
  readonly onSaved: (layout: FormLayout) => void
}

export function LayoutBuilderDialog({ seed, open, onClose, onSaved }: Readonly<LayoutBuilderDialogProps>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const initialLayout = React.useMemo(
    () => (seed.layout as FormLayout | undefined) ?? generateDefaultLayout(seed),
    [seed]
  )

  const ops = useLayoutBuilder({ seed, initialLayout })
  const { draft, activeTabId, setActiveTabId, isDirty } = ops

  const [showPreview, setShowPreview] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [showResetConfirm, setShowResetConfirm] = React.useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = React.useState(false)

  // Tab rename state
  const [renamingTabId, setRenamingTabId] = React.useState<string | null>(null)
  const [renameTabValue, setRenameTabValue] = React.useState('')

  const branchById = React.useMemo<Record<string, Branch>>(
    () => Object.fromEntries(seed.branches.map((b) => [b.id, b])),
    [seed]
  )

  const previewFormData = React.useMemo<Record<string, unknown>>(
    () => ({}),
    []
  )

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const activeTab = draft.tabs.find((t) => t.id === activeTabId) ?? draft.tabs[0]

  function handleAttemptClose() {
    if (!isDirty) { onClose(); return }
    setShowDiscardConfirm(true)
  }

  async function onSaveClick() {
    setIsSaving(true)
    try {
      const saved = await saveLayout(seed.slug, draft)
      toast.success(t('layoutBuilder.saved'))
      queryClient.invalidateQueries({ queryKey: ['schema'] })
      onSaved(saved)
      onClose()
    } catch (err) {
      const ax = err as AxiosError<{ title?: string; detail?: string }>
      toast.error(ax.response?.data?.detail ?? ax.response?.data?.title ?? t('layoutBuilder.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  async function onResetConfirmed() {
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

  function handleTabDrag(activeId: string, overId: string) {
    const fromIndex = draft.tabs.findIndex((t) => `tab:${t.id}` === activeId)
    const toIndex = draft.tabs.findIndex((t) => `tab:${t.id}` === overId)
    if (fromIndex !== -1 && toIndex !== -1) {
      ops.reorderTabs(fromIndex, toIndex)
      // Keep active tab correct
      const newTabs = arrayMove(draft.tabs, fromIndex, toIndex)
      setActiveTabId(newTabs[0]?.id ?? '')
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
    const toIndex = tab.sections.findIndex((s) => `section:${aTabId}:${s.id}` === overId)
    if (fromIndex !== -1 && toIndex !== -1) {
      ops.reorderSections(aTabId, fromIndex, toIndex)
    }
  }

  function handleColumnToTabDrag(activeId: string, overId: string) {
    const [, fromTabId, fromSectionId, fromColId] = activeId.split(':')
    const [, toTabId] = overId.split(':')
    const toTabData = draft.tabs.find((t) => t.id === toTabId)
    if (!toTabData) return

    const fromTab = draft.tabs.find((t) => t.id === fromTabId)
    const fromSection = fromTab?.sections.find((s) => s.id === fromSectionId)
    const fromCol = fromSection?.columns.find((c) => c.id === fromColId)
    const fromBranchId = fromCol?.fields?.[0]?.branchId
    if (!fromBranchId) return

    let foundEmpty = false
    for (const section of toTabData.sections) {
      for (const col of section.columns) {
        if (col.fields.length === 0) {
          const ok = ops.moveField({
            from: { tabId: fromTabId, sectionId: fromSectionId, columnId: fromColId, branchId: fromBranchId },
            to: { tabId: toTabId, sectionId: section.id, columnId: col.id },
          })
          if (!ok) {
            toast.warning(t('layoutBuilder.warnFullWidth', { label: '' }))
          }
          foundEmpty = true
          break
        }
      }
      if (foundEmpty) break
    }
    if (!foundEmpty) {
      toast.warning(t('layoutBuilder.warnNoEmptyColumn'))
    }
  }

  function handleColumnDrag(activeId: string, overId: string) {
    const [, aTabId, aSectionId, aColId] = activeId.split(':')
    const [, oTabId, oSectionId, oColId] = overId.split(':')

    // Column reorder within same section
    if (aTabId === oTabId && aSectionId === oSectionId) {
      const tab = draft.tabs.find((t) => t.id === aTabId)
      const section = tab?.sections.find((s) => s.id === aSectionId)
      if (!section) return
      const fromIndex = section.columns.findIndex((c) => c.id === aColId)
      const toIndex = section.columns.findIndex((c) => c.id === oColId)
      if (fromIndex !== -1 && toIndex !== -1) {
        ops.reorderColumns(aTabId, aSectionId, fromIndex, toIndex)
      }
      return
    }

    // Field move across sections or tabs
    const aTab = draft.tabs.find((t) => t.id === aTabId)
    const aSection = aTab?.sections.find((s) => s.id === aSectionId)
    const aCol = aSection?.columns.find((c) => c.id === aColId)
    const aBranchId = aCol?.fields?.[0]?.branchId
    if (!aBranchId) return

    const ok = ops.moveField({
      from: { tabId: aTabId, sectionId: aSectionId, columnId: aColId, branchId: aBranchId },
      to: { tabId: oTabId, sectionId: oSectionId, columnId: oColId },
    })
    if (!ok) {
      const sourceTab = draft.tabs.find((t) => t.id === aTabId)
      const sourceSection = sourceTab?.sections.find((s) => s.id === aSectionId)
      const sourceCol = sourceSection?.columns.find((c) => c.id === aColId)
      const branchId = sourceCol?.fields?.[0]?.branchId
      const branch = branchId ? branchById[branchId] : undefined
      if (branch && isFullWidthBranch(branch)) {
        toast.warning(t('layoutBuilder.warnFullWidth', { label: branch.label }))
      } else {
        toast.warning(t('layoutBuilder.warnFullWidth', { label: '' }))
      }
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    const isTab = (id: string) => id.startsWith('tab:')
    const isSection = (id: string) => id.startsWith('section:')
    const isColumn = (id: string) => id.startsWith('column:')

    if (isTab(activeId) && isTab(overId)) {
      handleTabDrag(activeId, overId)
    } else if (isSection(activeId) && isSection(overId)) {
      handleSectionDrag(activeId, overId)
    } else if (isColumn(activeId) && isTab(overId)) {
      handleColumnToTabDrag(activeId, overId)
    } else if (isColumn(activeId) && isColumn(overId)) {
      handleColumnDrag(activeId, overId)
    }
  }

  const tabDragIds = draft.tabs.map((t) => `tab:${t.id}`)
  const sectionDragIds = (activeTab?.sections ?? []).map(
    (s) => `section:${activeTab?.id}:${s.id}`
  )

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleAttemptClose() }}>
        <DialogContent className="max-w-5xl w-[min(100vw-2rem,1100px)] max-h-[calc(100vh-2rem)] overflow-y-auto flex flex-col gap-0 p-0">
          {/* Header */}
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <DialogTitle>
                {t('layoutBuilder.title', { seed: seed.label })}
              </DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <Switch checked={showPreview} onCheckedChange={setShowPreview} />
                  {t('layoutBuilder.showPreview')}
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowResetConfirm(true)}
                >
                  {t('layoutBuilder.reset')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={onSaveClick}
                  disabled={!isDirty || isSaving}
                >
                  {isSaving && <Loader2 className="size-4 animate-spin mr-1" />}
                  {t('layoutBuilder.save')}
                </Button>
              </div>
            </div>
          </DialogHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {showPreview ? (
              <LayoutRenderer
                layout={draft}
                branchById={branchById}
                formData={previewFormData}
                fieldErrors={{}}
                onChange={() => {/* readonly preview */}}
              />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <BuilderBody
                  seed={seed}
                  draft={draft}
                  activeTabId={activeTab?.id ?? ''}
                  branchById={branchById}
                  ops={ops}
                  tabDragIds={tabDragIds}
                  sectionDragIds={sectionDragIds}
                  renamingTabId={renamingTabId}
                  renameTabValue={renameTabValue}
                  setRenamingTabId={setRenamingTabId}
                  setRenameTabValue={setRenameTabValue}
                />
              </DndContext>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset confirm */}
      <ConfirmDialog
        open={showResetConfirm}
        onOpenChange={setShowResetConfirm}
        title={t('layoutBuilder.resetConfirmTitle')}
        description={t('layoutBuilder.resetConfirmDesc')}
        onConfirm={onResetConfirmed}
      />

      {/* Discard changes confirm */}
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

// ============================================================================
// BuilderBody
// ============================================================================

interface BuilderBodyProps {
  readonly seed: Seed
  readonly draft: FormLayout
  readonly activeTabId: string
  readonly branchById: Record<string, Branch>
  readonly ops: ReturnType<typeof useLayoutBuilder>
  readonly tabDragIds: string[]
  readonly sectionDragIds: string[]
  readonly renamingTabId: string | null
  readonly renameTabValue: string
  readonly setRenamingTabId: (id: string | null) => void
  readonly setRenameTabValue: (v: string) => void
}

function BuilderBody({
  draft,
  activeTabId,
  branchById,
  ops,
  tabDragIds,
  sectionDragIds,
  renamingTabId,
  renameTabValue,
  setRenamingTabId,
  setRenameTabValue,
}: Readonly<BuilderBodyProps>) {
  const { t } = useTranslation()

  const activeTab = draft.tabs.find((t) => t.id === activeTabId) ?? draft.tabs[0]
  const availableBranches = ops.getAvailableBranches()

  function commitTabRename() {
    if (renamingTabId && renameTabValue.trim()) {
      ops.renameTab(renamingTabId, renameTabValue.trim())
    }
    setRenamingTabId(null)
  }

  return (
    <div className="space-y-4">
      {/* Tab strip */}
      <SortableContext items={tabDragIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-center gap-1 flex-wrap">
          {draft.tabs.map((tab, idx) => {
            const isActive = tab.id === activeTabId
            const isDefault = idx === 0
            const tabDragId = `tab:${tab.id}`

            return (
              <TabPill
                key={tab.id}
                tab={tab}
                isActive={isActive}
                isDefault={isDefault}
                dragId={tabDragId}
                isRenaming={renamingTabId === tab.id}
                renameValue={renameTabValue}
                onSetActive={() => ops.setActiveTabId(tab.id)}
                onStartRename={() => { setRenameTabValue(tab.label); setRenamingTabId(tab.id) }}
                onRenameChange={setRenameTabValue}
                onRenameCommit={commitTabRename}
                onRenameCancel={() => setRenamingTabId(null)}
                onDelete={() => {
                  if (draft.tabs.length <= 1) return
                  ops.removeTab(tab.id)
                  if (isActive && draft.tabs[0]) {
                    ops.setActiveTabId(draft.tabs.find((t) => t.id !== tab.id)?.id ?? '')
                  }
                }}
                canDelete={draft.tabs.length > 1}
              />
            )
          })}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground"
            onClick={() => { ops.addTab(); ops.setActiveTabId('') }}
          >
            <Plus className="size-4" />
            {t('layoutBuilder.addTab')}
          </Button>
        </div>
      </SortableContext>

      {/* Section list */}
      {activeTab && (
        <SortableContext items={sectionDragIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {activeTab.sections.map((section) => {
              const sectionDragId = `section:${activeTab.id}:${section.id}`
              return (
                <SectionCard
                  key={section.id}
                  tabId={activeTab.id}
                  section={section}
                  branchById={branchById}
                  availableBranches={availableBranches}
                  ops={ops}
                  dragId={sectionDragId}
                />
              )
            })}
          </div>
        </SortableContext>
      )}

      {/* Add section */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => activeTab && ops.addSection(activeTab.id, 2)}
      >
        <Plus className="size-4 mr-2" />
        {t('layoutBuilder.addSection')}
      </Button>
    </div>
  )
}

// ============================================================================
// TabPill
// ============================================================================

interface TabPillProps {
  readonly tab: { readonly id: string; readonly label: string }
  readonly isActive: boolean
  readonly isDefault: boolean
  readonly dragId: string
  readonly isRenaming: boolean
  readonly renameValue: string
  readonly onSetActive: () => void
  readonly onStartRename: () => void
  readonly onRenameChange: (v: string) => void
  readonly onRenameCommit: () => void
  readonly onRenameCancel: () => void
  readonly onDelete: () => void
  readonly canDelete: boolean
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
      className={`flex items-center gap-1 rounded px-3 py-1.5 text-sm cursor-pointer select-none border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isActive
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/50 hover:bg-muted border-transparent'
      }`}
      onClick={onSetActive}
      onKeyDown={handleKeyDown}
      {...restAttributes}
      {...listeners}
    >
      {isRenaming ? (
        <Input
          autoFocus
          className="h-6 text-sm w-24 px-1"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCommit}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') onRenameCommit()
            if (e.key === 'Escape') onRenameCancel()
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
          <button
            type="button"
            className="ml-1 opacity-60 hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onStartRename}>
            <Pencil className="size-3 mr-2" />
            {t('layoutBuilder.tabMenu.rename')}
          </DropdownMenuItem>
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={onDelete}
              >
                {t('layoutBuilder.tabMenu.delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
