// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { resolveRelationAvatar, type Branch } from "@beechcms/core"
import { Check, Plus, X } from "@/components/icons"
import { GripDots } from "@/components/ui/grip-dots"

import { useFieldsConfig } from "../../context"
import { FieldLabelAside } from "../../field-label-row"
import { useRelationLabel } from "../../relation-label"
import { useRelationIdentity } from "../../display/relation-identity"
import { RelationAvatarMark } from "./relation-avatar-mark"
import { useDebounce } from "@/hooks/use-debounce"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** Debounce time for server-side autocomplete search (250ms). */
const SEARCH_DEBOUNCE_MS = 250
/** Results fetched per page of the picker; "load more" grows the window by this much. */
const LIST_LIMIT = 20
/** Static reference for empty array to prevent unnecessary re-renders. */
const EMPTY_IDS: string[] = []

/** Minimal shape of a relation-type schema branch consumed by this component. */
type BranchLike = {
  /** Slug of the target seed this relation points to. */
  targetSeed?: string
  /** Whether the field accepts multiple related entries. */
  multiple?: boolean
  /** Whether the field is required when creating an entry. */
  requiredOnCreate?: boolean
  /** Whether the field is required when updating an entry. */
  requiredOnUpdate?: boolean
}

interface SelectedRowProps {
  /** Id of the related entry; also the sortable id. */
  id: string
  /** Slug of the target seed the related entry belongs to. */
  targetSlug: string
  /** Field alias used to read the display label from the entry's data. */
  labelAlias: string
  /** Target branch supplying the avatar image; absent = no avatar on the row. */
  avatarAlias: string | undefined
  /** Freezes dragging and removal. */
  disabled: boolean | undefined
  /** Removes this entry from the selection. */
  onRemove: (id: string) => void
}

/** One selected entry: drag handle, optional avatar, display name, remove button. */
function SelectedRow({ id, targetSlug, labelAlias, avatarAlias, disabled, onRemove }: SelectedRowProps) {
  const { t: translate } = useTranslation()
  const identity = useRelationIdentity(targetSlug, id, labelAlias, avatarAlias)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex h-9 items-center gap-2 bg-card px-1.5 text-sm",
        isDragging && "relative z-10 shadow-md opacity-90",
      )}
    >
      <button
        type="button"
        aria-label={translate("content.editor.relationMulti.dragHandle")}
        disabled={disabled}
        className="flex shrink-0 cursor-grab touch-none items-center rounded p-0.5 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
        {...attributes}
        {...listeners}
      >
        <GripDots className="size-4" />
      </button>
      {avatarAlias ? <RelationAvatarMark identity={identity} /> : null}
      <span className="min-w-0 flex-1 truncate">{identity.label}</span>
      {/* Red but hidden until the row is hovered or the button focused; touch screens have no hover, so it stays visible there.
          The 5px right margin keeps it clear of the ScrollArea scrollbar overlaying the row's edge. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={translate("content.editor.relationMulti.remove")}
        disabled={disabled}
        onClick={() => onRemove(id)}
        className="mr-[5px] text-destructive opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-0 [@media(hover:none)]:opacity-100"
      >
        <X />
      </Button>
    </li>
  )
}

/** Rows the selected list shows before it scrolls; the `max-h` class on the list below encodes the same number. */
const VISIBLE_ROWS = 3

/**
 * Inert stand-in for a full multi-relation field, for previews that have no data (the layout builder):
 * same structure and measurements as {@link MultiRelationEdit} with a full list — count on the label's
 * line, bordered list of {@link VISIBLE_ROWS} rows, add button — so a column laid out here matches the
 * real editor.
 */
export function MultiRelationSkeleton({ avatar = false }: { readonly avatar?: boolean }) {
  const { t: translate } = useTranslation()
  return (
    <div className="space-y-2" aria-hidden>
      <div className="space-y-1">
        <FieldLabelAside>
          {translate("content.editor.relationMulti.selectedCount", { count: VISIBLE_ROWS })}
        </FieldLabelAside>
        <div className="overflow-hidden rounded-lg border">
          <ul className="divide-y">
            {Array.from({ length: VISIBLE_ROWS }, (_, row) => (
              <li key={row} className="flex h-9 items-center gap-2 bg-card px-1.5">
                <Skeleton className="bg-foreground/10 size-4 shrink-0" />
                {avatar ? <Skeleton className="bg-foreground/10 size-6 shrink-0 rounded-full" /> : null}
                <Skeleton className="bg-foreground/10 h-3 w-2/5" />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Button type="button" variant="outline" disabled className="w-full font-normal">
        <Plus className="size-4 shrink-0" />
        <span className="truncate">{translate("content.editor.relationMulti.add")}</span>
      </Button>
    </div>
  )
}

interface MultiRelationEditProps {
  /** Relation schema branch (target seed, cardinality, required flags). */
  branch: BranchLike & { alias?: string; label?: string }
  /** Ids of the currently selected related entries, in display order. */
  value: string[]
  /** Callback invoked with the updated list of selected ids. */
  onChange: (ids: string[]) => void
  /** Disables all interaction when true. */
  disabled?: boolean
  /** Whether the parent form is in create mode (affects required check). */
  isCreate?: boolean
}

/**
 * Multi-value relation field editor.
 *
 * - Selected entries are a vertical list, reorderable by drag and drop (pointer or keyboard) and
 *   scrollable past a few rows; the order is persisted by the junction table.
 * - The picker toggles entries and stays open, so several can be added in one visit; selected
 *   entries stay in the results with a check. "Load more" widens the result window.
 * - Avatars appear only when the relation configures an `avatarSource`, and only on the selected rows,
 *   never in the picker.
 */
export function MultiRelationEdit({
  branch,
  value,
  onChange,
  disabled,
  isCreate,
}: MultiRelationEditProps) {
  const { t: translate } = useTranslation()
  const { useSchema, searchRelations, queryKeys } = useFieldsConfig()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [limit, setLimit] = React.useState(LIST_LIMIT)
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)

  const targetSlug = branch.targetSeed
  const selectedIds = Array.isArray(value) ? value : EMPTY_IDS

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((schemaSeed) => schemaSeed.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"
  const avatarAlias = resolveRelationAvatar(
    branch as Branch,
    (slug) => seeds?.find((schemaSeed) => schemaSeed.slug === slug),
  )?.alias
  const labelOf = useRelationLabel(targetSlug)

  const { data: entriesData, isFetching } = useQuery({
    queryKey: [...queryKeys.lists(), targetSlug, "relation-multi-search", debouncedSearch, limit],
    queryFn: () =>
      searchRelations(targetSlug!, {
        search: debouncedSearch || undefined,
        limit,
      }),
    enabled: Boolean(targetSlug && open),
    staleTime: 10 * 1000,
    placeholderData: (prev) => prev,
  })

  const entries = entriesData ?? []
  const hasMore = entries.length >= limit

  const resolveLabel = (item: (typeof entries)[0]): string => {
    const raw = labelOf(item.data, labelAlias)
    if (raw != null && raw !== "") return String(raw)
    const slug = (item as { slug?: unknown }).slug
    return typeof slug === "string" ? slug : item.id
  }

  // Two entries with the same name are told apart by the tail of their id; unique names stay clean.
  const labels = entries.map(resolveLabel)
  const duplicateLabels = new Set(labels.filter((label, index) => labels.indexOf(label) !== index))

  const selectedSet = new Set(selectedIds)

  const handleToggle = React.useCallback(
    (entryId: string) => {
      onChange(
        selectedIds.includes(entryId)
          ? selectedIds.filter((id) => id !== entryId)
          : [...selectedIds, entryId],
      )
    },
    [selectedIds, onChange],
  )

  const handleRemove = React.useCallback(
    (entryId: string) => onChange(selectedIds.filter((id) => id !== entryId)),
    [selectedIds, onChange],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = React.useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return
      const from = selectedIds.indexOf(String(active.id))
      const to = selectedIds.indexOf(String(over.id))
      if (from === -1 || to === -1) return
      onChange(arrayMove(selectedIds, from, to))
    },
    [selectedIds, onChange],
  )

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setSearch("")
      setLimit(LIST_LIMIT)
    }
  }

  const isRequired = isCreate ? branch.requiredOnCreate === true : branch.requiredOnUpdate === true

  return (
    <div className="space-y-2">
      {selectedIds.length > 0 && (
        <div className="space-y-1">
          <FieldLabelAside>
            {translate("content.editor.relationMulti.selectedCount", { count: selectedIds.length })}
          </FieldLabelAside>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={selectedIds} strategy={verticalListSortingStrategy}>
              {/* The border and radius live on a clipping wrapper, not on the ScrollArea: its viewport inherits the
                  root's max-height (`max-h-[inherit]`), so a border on the root would let the viewport overflow it
                  and paint over the bottom edge. Height: three 2.25rem rows plus their two 1px dividers.
                  Radix also wraps the content in a `display: table` div, which would stop `truncate` from working. */}
              <div className="overflow-hidden rounded-lg border">
                <ScrollArea className="max-h-[calc(3*2.25rem+2px)] [&_[data-slot=scroll-area-viewport]>div]:!block">
                  <ul className="divide-y" aria-label={translate("content.editor.relationMulti.selectedItems")}>
                    {selectedIds.map((id) => (
                      <SelectedRow
                        key={id}
                        id={id}
                        targetSlug={targetSlug ?? ""}
                        labelAlias={labelAlias}
                        avatarAlias={avatarAlias}
                        disabled={disabled}
                        onRemove={handleRemove}
                      />
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={translate("content.editor.relationMulti.add")}
            disabled={disabled || !targetSlug}
            className="w-full font-normal"
          >
            <Plus className="size-4 shrink-0" />
            <span className="truncate">
              {isRequired && selectedIds.length === 0
                ? translate("content.editor.relation.placeholder")
                : translate("content.editor.relationMulti.add")}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={translate("content.editor.relation.search")}
              value={search}
              onValueChange={(next) => {
                setSearch(next)
                setLimit(LIST_LIMIT)
              }}
              aria-label={translate("content.editor.relation.search")}
            />
            <CommandList>
              {isFetching && entries.length === 0 ? (
                <CommandEmpty>{translate("content.editor.relation.loading")}</CommandEmpty>
              ) : entries.length === 0 ? (
                <CommandEmpty>{translate("content.editor.relation.empty")}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {entries.map((item, index) => {
                    const label = labels[index]!
                    const isSelected = selectedSet.has(item.id)
                    return (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        onSelect={() => handleToggle(item.id)}
                        aria-selected={isSelected}
                        className="flex items-center gap-2"
                      >
                        <Check className={cn("size-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1 truncate">{label}</span>
                        {duplicateLabels.has(label) && (
                          <span className="max-w-[6rem] shrink-0 truncate font-mono text-xs text-muted-foreground">
                            …{item.id.slice(-4)}
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
              {hasMore && (
                <div className="p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    disabled={isFetching}
                    onClick={() => setLimit((current) => current + LIST_LIMIT)}
                  >
                    {translate("content.editor.relationMulti.loadMore")}
                  </Button>
                </div>
              )}
            </CommandList>
            <div className="flex items-center justify-between border-t p-1.5">
              <span className="px-1 text-xs text-muted-foreground">
                {translate("content.editor.relationMulti.selectedCount", { count: selectedIds.length })}
              </span>
              <Button type="button" size="sm" onClick={() => handleOpenChange(false)}>
                {translate("content.editor.relationMulti.done")}
              </Button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
