// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, SortV as ChevronsUpDown, X, ChevronUp, ChevronDown } from 'reicon-react'

import { useFieldsConfig } from "../../context"
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

/** Stale time for relation details query (5 minutes). */
const RELATION_STALE_MS = 5 * 60 * 1000
/** Debounce time for server-side autocomplete search (250ms). */
const SEARCH_DEBOUNCE_MS = 250
/** Maximum number of search results to fetch in one search query. */
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

interface ChipLabelProps {
  /** Slug of the target seed the related entry belongs to. */
  targetSlug: string
  /** Id of the related entry to resolve a label for. */
  targetId: string
  /** Field alias used to read the display label from the entry's data. */
  labelAlias: string
}

/**
 * Fetches the related entry by id and resolves its display label, falling back
 * to the raw id while the entry is loading or has no value for `labelAlias`.
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

interface SortableChipProps {
  /** Id of the related entry represented by this chip. */
  id: string
  /** Position of this chip within the selected list (0-based). */
  index: number
  /** Total number of selected chips, used to disable move-down at the end. */
  total: number
  /** Slug of the target seed the related entry belongs to. */
  targetSlug: string
  /** Field alias used to read the display label from the entry's data. */
  labelAlias: string
  /** Swaps this chip with the previous one. */
  onMoveUp: () => void
  /** Swaps this chip with the next one. */
  onMoveDown: () => void
  /** Removes this chip from the selection. */
  onRemove: () => void
}

/** A single reorderable, removable chip representing one selected relation entry. */
function SortableChip({
  id,
  index,
  total,
  targetSlug,
  labelAlias,
  onMoveUp,
  onMoveDown,
  onRemove,
}: SortableChipProps) {
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
 * Multi-value relation field editor: renders selected entries as reorderable,
 * removable chips plus a searchable popover to add more entries.
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

  const handleAdd = React.useCallback(
    (entryId: string) => {
      if (!selectedIds.includes(entryId)) {
        onChange([...selectedIds, entryId])
      }
      setOpen(false)
      setSearch("")
    },
    [selectedIds, onChange]
  )

  const handleRemove = React.useCallback(
    (indexToRemove: number) => {
      onChange(selectedIds.filter((_, currentIndex) => currentIndex !== indexToRemove))
    },
    [selectedIds, onChange]
  )

  const handleMoveUp = React.useCallback(
    (index: number) => {
      if (index === 0) return
      const nextSelectedIds = [...selectedIds]
      ;[nextSelectedIds[index - 1], nextSelectedIds[index]] = [
        nextSelectedIds[index],
        nextSelectedIds[index - 1],
      ]
      onChange(nextSelectedIds)
    },
    [selectedIds, onChange]
  )

  const handleMoveDown = React.useCallback(
    (index: number) => {
      if (index === selectedIds.length - 1) return
      const nextSelectedIds = [...selectedIds]
      ;[nextSelectedIds[index], nextSelectedIds[index + 1]] = [
        nextSelectedIds[index + 1],
        nextSelectedIds[index],
      ]
      onChange(nextSelectedIds)
    },
    [selectedIds, onChange]
  )

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
            className={cn("w-full justify-between font-normal", "text-muted-foreground")}
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
