// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Field Renderer Edit per tipo `relation`: combobox ricercabile con debounce.
 * - Legge branch.targetSeed per sapere su quale seed cercare.
 * - Visualizza il label dell'entry correntemente selezionata.
 * - Permette di pulire la selezione (solo se il branch non è required per l'operazione).
 */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, X } from "lucide-react"

import { useSchema } from "@/features/schema"
import { contentApi } from "@/features/content-management/api/content.api"
import { CONTENT_QUERY_KEYS } from "@/features/content-management/consts/content.keys"
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

const RELATION_STALE_MS = 5 * 60 * 1000
const SEARCH_DEBOUNCE_MS = 250
const LIST_LIMIT = 20

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
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)

  const targetSlug = (branch as { targetSeed?: string }).targetSeed
  const selectedId = typeof value === "string" && value.length > 0 ? value : null

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((s) => s.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  // Determine if "Clear" should be shown
  const branchDef = branch as {
    requiredOnCreate?: boolean
    requiredOnUpdate?: boolean
  }
  const isRequired = isCreate
    ? branchDef.requiredOnCreate === true
    : branchDef.requiredOnUpdate === true
  const showClear = !isRequired && selectedId !== null

  // Fetch the currently selected entry label (editor load resolution)
  const { data: selectedEntry } = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(targetSlug ?? "", selectedId ?? ""),
    queryFn: () => contentApi.fetchById(targetSlug!, selectedId!),
    enabled: Boolean(targetSlug && selectedId),
    staleTime: RELATION_STALE_MS,
  })

  const selectedLabel = selectedEntry
    ? String((selectedEntry.data as Record<string, unknown>)?.[labelAlias] ?? selectedId)
    : selectedId ?? ""

  // Fetch the list for the combobox (debounced search)
  const { data: listData, isFetching: isListFetching } = useQuery({
    queryKey: [...CONTENT_QUERY_KEYS.lists(), targetSlug, "relation-search", debouncedSearch],
    queryFn: () =>
      contentApi.fetchList(targetSlug!, {
        search: debouncedSearch || undefined,
        limit: LIST_LIMIT,
        page: 1,
      }),
    enabled: Boolean(targetSlug && open),
    staleTime: 10 * 1000,
    placeholderData: (prev) => prev,
  })

  const entries = listData?.items ?? []

  const resolveLabel = (item: (typeof entries)[0]): string => {
    const raw = (item.data as Record<string, unknown>)?.[labelAlias]
    if (raw != null && raw !== "") return String(raw)
    return item.slug ?? item.id
  }

  const handleSelect = React.useCallback(
    (id: string) => {
      onChange(id)
      setOpen(false)
    },
    [onChange]
  )

  const handleClear = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onChange(null)
    },
    [onChange]
  )

  // Void unused prop to satisfy the linter without breaking the Sprint 7 hook
  void onInlineCreate

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t("content.editor.relation.placeholder")}
          disabled={disabled || !targetSlug}
          className={cn(
            "w-full justify-between font-normal",
            !selectedId && "text-muted-foreground"
          )}
        >
          <span className="truncate">
            {selectedId ? selectedLabel : t("content.editor.relation.placeholder")}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {showClear && (
              <span
                role="button"
                tabIndex={0}
                aria-label={t("content.editor.relation.clear")}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleClear(e as unknown as React.MouseEvent)
                }}
                className="rounded-sm opacity-60 hover:opacity-100 hover:bg-muted p-0.5"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronsUpDown className="size-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("content.editor.relation.search")}
            value={search}
            onValueChange={setSearch}
            aria-label={t("content.editor.relation.search")}
          />
          <CommandList>
            {isListFetching && entries.length === 0 ? (
              <CommandEmpty>{t("content.editor.relation.loading")}</CommandEmpty>
            ) : entries.length === 0 ? (
              <CommandEmpty>{t("content.editor.relation.empty")}</CommandEmpty>
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
