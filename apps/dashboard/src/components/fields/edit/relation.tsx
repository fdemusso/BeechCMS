// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Field Renderer Edit component for type `relation`.
 *
 * - Single-value (default): searchable combobox with debounced server-side query.
 * - Multi-value (multiple: true): multi-select combobox + sortable chip row
 *   with up/down sorting controls and per-chip removal (×).
 */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, X, ChevronUp, ChevronDown } from "lucide-react"

import { useFieldsConfig } from "../context"
import { useDebounce } from "@/hooks/use-debounce"
import { Button } from "@/components/ui/button"
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
import type { FieldEditProps } from "../types"

/** Stale time for relation details query (5 minutes). */
const RELATION_STALE_MS = 5 * 60 * 1000
/** Debounce time for server-side autocomplete search (250ms). */
const SEARCH_DEBOUNCE_MS = 250
/** Maximum number of search results to fetch in one search query. */
const LIST_LIMIT = 20
/** Static reference for empty array to prevent unnecessary re-renders. */
const EMPTY_IDS: string[] = []

// ============================================================================
// Shared helpers
// ============================================================================

/** Shape representing schema branch definitions relevant to relations. */
type BranchLike = {
  /** The target schema slug for the relation. */
  targetSeed?: string
  /** Whether the field permits multiple values. */
  multiple?: boolean
  /** Validation flag requiring a value on entry creation. */
  requiredOnCreate?: boolean
  /** Validation flag requiring a value on entry update. */
  requiredOnUpdate?: boolean
}

// ============================================================================
// Multi-chip: resolved label for a single id
// ============================================================================

/** Properties for the {@link useChipLabel} hook. */
interface ChipLabelProps {
  /** Target schema slug. */
  targetSlug: string
  /** Entry ID whose label needs to be resolved. */
  targetId: string
  /** Field name used as display alias (e.g. "title"). */
  labelAlias: string
}

/**
 * React hook to fetch and resolve a human-readable display label for a specific relation entry ID.
 *
 * @param props - Hook parameters.
 * @returns The resolved label string or the targetId if loading/failed.
 */
function useChipLabel({ targetSlug, targetId, labelAlias }: ChipLabelProps): string {
  const { fetchById, queryKeys } = useFieldsConfig()
  const { data: entry } = useQuery({
    queryKey: queryKeys.detail(targetSlug, targetId),
    queryFn: () => fetchById(targetSlug, targetId),
    enabled: Boolean(targetSlug && targetId),
    staleTime: RELATION_STALE_MS,
  })
  return String(entry?.data?.[labelAlias] ?? targetId)
}

/** Properties for the {@link SortableChip} component. */
interface SortableChipProps {
  /** The unique ID of the relation entry. */
  id: string
  /** The index position of this chip in the list. */
  index: number
  /** The total number of items in the list. */
  total: number
  /** Target schema slug. */
  targetSlug: string
  /** Field name used as display alias. */
  labelAlias: string
  /** Callback to move the chip one slot up. */
  onMoveUp: () => void
  /** Callback to move the chip one slot down. */
  onMoveDown: () => void
  /** Callback to remove this chip from the selection. */
  onRemove: () => void
}

/**
 * SortableChip component displaying a single selected relationship ID as a styled chip
 * with sorting arrows and a removal button.
 *
 * @param props - Component properties conforming to {@link SortableChipProps}.
 */
function SortableChip({ id, index, total, targetSlug, labelAlias, onMoveUp, onMoveDown, onRemove }: SortableChipProps) {
  const { t: translate } = useTranslation()
  const label = useChipLabel({ targetSlug, targetId: id, labelAlias })

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-secondary/50 px-1.5 py-0.5 text-sm">
      <span className="max-w-[160px] truncate">{label}</span>
      <div className="flex items-center ml-1 gap-0.5 shrink-0">
        <button
          type="button"
          aria-label={translate("content.editor.relationMulti.moveUp")}
          disabled={index === 0}
          onClick={onMoveUp}
          className="rounded p-0.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronUp className="size-3" />
        </button>
        <button
          type="button"
          aria-label={translate("content.editor.relationMulti.moveDown")}
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="rounded p-0.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronDown className="size-3" />
        </button>
        <button
          type="button"
          aria-label={translate("content.editor.relationMulti.remove")}
          onClick={onRemove}
          className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Multi-value RelationEdit
// ============================================================================

/** Properties for the {@link MultiRelationEdit} component. */
interface MultiRelationEditProps {
  /** The branch metadata definition. */
  branch: BranchLike & { alias?: string; label?: string }
  /** Currently selected entry IDs. */
  value: string[]
  /** Callback fired when the selection changes. */
  onChange: (ids: string[]) => void
  /** Controls disabled state. */
  disabled?: boolean
  /** True if the record is currently being created. */
  isCreate?: boolean
}

/**
 * MultiRelationEdit component renders a multi-select relationship field editor.
 * Displays selected relations as sortable chips and provides a combobox popover
 * to query and add new relations.
 *
 * @param props - Component properties conforming to {@link MultiRelationEditProps}.
 */
function MultiRelationEdit({ branch, value, onChange, disabled, isCreate }: MultiRelationEditProps) {
  const { t: translate } = useTranslation()
  const { useSchema, searchRelations, queryKeys } = useFieldsConfig()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)
  const addPopoverId = React.useId()

  const targetSlug = branch.targetSeed
  const selectedIds = Array.isArray(value) ? value : EMPTY_IDS

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((schemaSeed) => schemaSeed.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  const { data: entriesData, isFetching } = useQuery({
    queryKey: [...queryKeys.lists(), targetSlug, "relation-multi-search", debouncedSearch],
    queryFn: () =>
      searchRelations(targetSlug!, {
        search: debouncedSearch || undefined,
        limit: LIST_LIMIT,
      }),
    enabled: Boolean(targetSlug && open),
    staleTime: 10 * 1000,
    placeholderData: (prev) => prev,
  })

  const entries = (entriesData ?? []).filter((item) => !selectedIds.includes(item.id))

  const resolveLabel = (item: (typeof entries)[0]): string => {
    const raw = item.data?.[labelAlias]
    if (raw != null && raw !== "") return String(raw)
    const slug = (item as { slug?: unknown }).slug
    return typeof slug === "string" ? slug : item.id
  }

  const handleAdd = React.useCallback((entryId: string) => {
    if (!selectedIds.includes(entryId)) {
      onChange([...selectedIds, entryId])
    }
    setOpen(false)
    setSearch("")
  }, [selectedIds, onChange])

  const handleRemove = React.useCallback((indexToRemove: number) => {
    onChange(selectedIds.filter((_, currentIndex) => currentIndex !== indexToRemove))
  }, [selectedIds, onChange])

  const handleMoveUp = React.useCallback((index: number) => {
    if (index === 0) return
    const nextSelectedIds = [...selectedIds]
    ;[nextSelectedIds[index - 1], nextSelectedIds[index]] = [nextSelectedIds[index], nextSelectedIds[index - 1]]
    onChange(nextSelectedIds)
  }, [selectedIds, onChange])

  const handleMoveDown = React.useCallback((index: number) => {
    if (index === selectedIds.length - 1) return
    const nextSelectedIds = [...selectedIds]
    ;[nextSelectedIds[index], nextSelectedIds[index + 1]] = [nextSelectedIds[index + 1], nextSelectedIds[index]]
    onChange(nextSelectedIds)
  }, [selectedIds, onChange])

  const isRequired = isCreate ? branch.requiredOnCreate === true : branch.requiredOnUpdate === true

  return (
    <div className="space-y-2">
      {/* Chip row */}
      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5"
          aria-label={translate("content.editor.relationMulti.selectedItems")}
        >
          {selectedIds.map((id, index) => (
            <SortableChip
              key={id}
              id={id}
              index={index}
              total={selectedIds.length}
              targetSlug={targetSlug ?? ""}
              labelAlias={labelAlias}
              onMoveUp={() => handleMoveUp(index)}
              onMoveDown={() => handleMoveDown(index)}
              onRemove={() => handleRemove(index)}
            />
          ))}
        </div>
      )}

      {/* Add button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={addPopoverId}
            aria-label={translate("content.editor.relationMulti.add")}
            disabled={disabled || !targetSlug}
            className={cn(
              "w-full justify-between font-normal",
              "text-muted-foreground"
            )}
          >
            <span className="truncate">
              {isRequired && selectedIds.length === 0
                ? translate("content.editor.relation.placeholder")
                : translate("content.editor.relationMulti.add")}
            </span>
            <ChevronsUpDown className="size-4 opacity-50 ml-2 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent id={addPopoverId} className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={translate("content.editor.relation.search")}
              value={search}
              onValueChange={setSearch}
              aria-label={translate("content.editor.relation.search")}
            />
            <CommandList>
              {isFetching && entries.length === 0 ? (
                <CommandEmpty>{translate("content.editor.relation.loading")}</CommandEmpty>
              ) : entries.length === 0 ? (
                <CommandEmpty>{translate("content.editor.relation.empty")}</CommandEmpty>
              ) : (
                <CommandGroup>
                  {entries.map((item) => {
                    const label = resolveLabel(item)
                    return (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        onSelect={() => handleAdd(item.id)}
                        className="flex items-center gap-2"
                      >
                        <Check className="size-4 shrink-0 opacity-0" />
                        <span className="flex-1 truncate">{label}</span>
                        <span className="text-xs text-muted-foreground font-mono shrink-0 max-w-[6rem] truncate">
                          {item.id}
                        </span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ============================================================================
// Single-value RelationEdit
// ============================================================================

/** Properties for the {@link SingleRelationEdit} component. */
interface SingleRelationEditProps {
  /** The branch metadata definition. */
  branch: BranchLike & { alias?: string; label?: string }
  /** The currently selected ID, or null if unassigned. */
  value: string | null
  /** Callback fired when the selection changes. */
  onChange: (selectedValue: string | null) => void
  /** Controls disabled state. */
  disabled?: boolean
  /** True if the record is currently being created. */
  isCreate?: boolean
  /** Callback to trigger inline item creation dialog. */
  onInlineCreate?: () => void
}

/**
 * SingleRelationEdit component renders a searchable dropdown autocomplete list
 * for single-select relationship fields.
 *
 * @param props - Component properties conforming to {@link SingleRelationEditProps}.
 */
function SingleRelationEdit({
  branch,
  value,
  onChange,
  disabled,
  isCreate,
  onInlineCreate,
}: SingleRelationEditProps) {
  const { t: translate } = useTranslation()
  const { useSchema, fetchById, searchRelations, queryKeys } = useFieldsConfig()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)
  const singlePopoverId = React.useId()

  const targetSlug = branch.targetSeed
  const selectedId = typeof value === "string" && value.length > 0 ? value : null

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((schemaSeed) => schemaSeed.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  const isRequired = isCreate
    ? branch.requiredOnCreate === true
    : branch.requiredOnUpdate === true
  const showClear = !isRequired && selectedId !== null

  const { data: selectedEntry } = useQuery({
    queryKey: queryKeys.detail(targetSlug ?? "", selectedId ?? ""),
    queryFn: () => fetchById(targetSlug!, selectedId!),
    enabled: Boolean(targetSlug && selectedId),
    staleTime: RELATION_STALE_MS,
  })

  const selectedLabel = selectedEntry
    ? String(selectedEntry?.data?.[labelAlias] ?? selectedId)
    : selectedId ?? ""

  const { data: entriesData, isFetching: isListFetching } = useQuery({
    queryKey: [...queryKeys.lists(), targetSlug, "relation-search", debouncedSearch],
    queryFn: () =>
      searchRelations(targetSlug!, {
        search: debouncedSearch || undefined,
        limit: LIST_LIMIT,
      }),
    enabled: Boolean(targetSlug && open),
    staleTime: 10 * 1000,
    placeholderData: (prev) => prev,
  })

  const entries = entriesData ?? []

  const resolveLabel = (item: (typeof entries)[0]): string => {
    const raw = item.data?.[labelAlias]
    if (raw != null && raw !== "") return String(raw)
    const slug = (item as { slug?: unknown }).slug
    return typeof slug === "string" ? slug : item.id
  }

  const handleSelect = React.useCallback(
    (entryId: string) => {
      onChange(entryId)
      setOpen(false)
    },
    [onChange]
  )

  const handleClear = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      onChange(null)
    },
    [onChange]
  )

  void onInlineCreate

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-controls={singlePopoverId}
          aria-label={translate("content.editor.relation.placeholder")}
          disabled={disabled || !targetSlug}
          className={cn(
            "w-full justify-between font-normal",
            !selectedId && "text-muted-foreground",
          )}
        >
          <span className="truncate">
            {selectedId ? selectedLabel : translate("content.editor.relation.placeholder")}
          </span>
          <span className="flex items-center gap-1 shrink-0 ml-1">
            {showClear && (
              <button
                type="button"
                aria-label={translate("content.editor.relation.clear")}
                onClick={handleClear}
                className="flex items-center rounded-sm opacity-60 hover:opacity-100 hover:bg-muted px-0.5"
              >
                <X className="size-3.5" />
              </button>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent id={singlePopoverId} className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={translate("content.editor.relation.search")}
            value={search}
            onValueChange={setSearch}
            aria-label={translate("content.editor.relation.search")}
          />
          <CommandList>
            {isListFetching && entries.length === 0 ? (
              <CommandEmpty>{translate("content.editor.relation.loading")}</CommandEmpty>
            ) : entries.length === 0 ? (
              <CommandEmpty>{translate("content.editor.relation.empty")}</CommandEmpty>
            ) : (
              <CommandGroup>
                {entries.map((item) => {
                  const label = resolveLabel(item)
                  const isSelected = item.id === selectedId
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onSelect={() => handleSelect(item.id)}
                      className="flex items-center gap-2"
                    >
                      <Check
                        className={cn(
                          "size-4 shrink-0",
                          isSelected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate">{label}</span>
                      <span className="text-xs text-muted-foreground font-mono shrink-0 max-w-[6rem] truncate">
                        {item.id}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Public export: dispatches on branch.multiple
// ============================================================================

/**
 * Field Renderer: Relation Edit Component.
 * Dispatches to either {@link MultiRelationEdit} or {@link SingleRelationEdit}
 * based on whether the schema branch configures this relation as multi-value.
 *
 * @param props - Component properties conforming to {@link FieldEditProps}.
 */
export function RelationEdit({
  branch,
  value,
  onChange,
  disabled,
  isCreate,
  onInlineCreate,
}: FieldEditProps & {
  disabled?: boolean
  isCreate?: boolean
  onInlineCreate?: () => void
}) {
  const isMultiple = (branch as BranchLike).multiple === true

  if (isMultiple) {
    const selectedIds = Array.isArray(value) ? (value as string[]) : []
    return (
      <MultiRelationEdit
        branch={branch as BranchLike}
        value={selectedIds}
        onChange={(nextSelectedIds) => onChange(nextSelectedIds)}
        disabled={disabled}
        isCreate={isCreate}
      />
    )
  }

  return (
    <SingleRelationEdit
      branch={branch as BranchLike}
      value={typeof value === "string" ? value : null}
      onChange={onChange as (selectedValue: string | null) => void}
      disabled={disabled}
      isCreate={isCreate}
      onInlineCreate={onInlineCreate}
    />
  )
}
