// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, X } from "lucide-react"

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

interface SingleRelationEditProps {
  /** Relation schema branch (target seed, cardinality, required flags). */
  branch: BranchLike & { alias?: string; label?: string }
  /** Id of the currently selected related entry, or null if none. */
  value: string | null
  /** Callback invoked with the newly selected id, or null when cleared. */
  onChange: (selectedValue: string | null) => void
  /** Disables all interaction when true. */
  disabled?: boolean
  /** Whether the parent form is in create mode (affects required check). */
  isCreate?: boolean
  /** Optional callback to trigger inline creation of a related entry. Currently unused. */
  onInlineCreate?: () => void
}

/**
 * Single-value relation field editor: shows the selected entry's label with a
 * clear button, and a searchable popover to pick a different entry.
 */
export function SingleRelationEdit({
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
