// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Field Renderer Edit per tipo `relation`.
 *
 * - Single-value (default): combobox ricercabile con debounce.
 * - Multi-value (multiple: true): multi-select combobox + sortable chip row
 *   with up/down buttons and per-chip remove (×).
 */
import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Check, ChevronsUpDown, X, ChevronUp, ChevronDown } from "lucide-react"

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

// ── Shared helpers ────────────────────────────────────────────────────────────

type BranchLike = {
  targetSeed?: string
  multiple?: boolean
  requiredOnCreate?: boolean
  requiredOnUpdate?: boolean
}

// ── Multi-chip: resolved label for a single id ────────────────────────────────

interface ChipLabelProps {
  targetSlug: string
  targetId: string
  labelAlias: string
}

function useChipLabel({ targetSlug, targetId, labelAlias }: ChipLabelProps): string {
  const { data: entry } = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(targetSlug, targetId),
    queryFn: () => contentApi.fetchById(targetSlug, targetId),
    enabled: Boolean(targetSlug && targetId),
    staleTime: RELATION_STALE_MS,
  })
  return String((entry?.data as Record<string, unknown> | undefined)?.[labelAlias] ?? targetId)
}

interface SortableChipProps {
  id: string
  index: number
  total: number
  targetSlug: string
  labelAlias: string
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

function SortableChip({ id, index, total, targetSlug, labelAlias, onMoveUp, onMoveDown, onRemove }: SortableChipProps) {
  const { t } = useTranslation()
  const label = useChipLabel({ targetSlug, targetId: id, labelAlias })

  return (
    <div className="flex items-center gap-0.5 rounded-md border bg-secondary/50 px-1.5 py-0.5 text-sm">
      <span className="max-w-[160px] truncate">{label}</span>
      <div className="flex items-center ml-1 gap-0.5 shrink-0">
        <button
          type="button"
          aria-label={t("content.editor.relationMulti.moveUp")}
          disabled={index === 0}
          onClick={onMoveUp}
          className="rounded p-0.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronUp className="size-3" />
        </button>
        <button
          type="button"
          aria-label={t("content.editor.relationMulti.moveDown")}
          disabled={index === total - 1}
          onClick={onMoveDown}
          className="rounded p-0.5 hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronDown className="size-3" />
        </button>
        <button
          type="button"
          aria-label={t("content.editor.relationMulti.remove")}
          onClick={onRemove}
          className="rounded p-0.5 hover:bg-destructive/20 hover:text-destructive"
        >
          <X className="size-3" />
        </button>
      </div>
    </div>
  )
}

// ── Multi-value RelationEdit ───────────────────────────────────────────────────

interface MultiRelationEditProps {
  branch: BranchLike & { alias?: string; label?: string }
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  isCreate?: boolean
}

function MultiRelationEdit({ branch, value, onChange, disabled, isCreate }: MultiRelationEditProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)

  const targetSlug = branch.targetSeed
  const selectedIds = Array.isArray(value) ? value : []

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((s) => s.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  const { data: listData, isFetching } = useQuery({
    queryKey: [...CONTENT_QUERY_KEYS.lists(), targetSlug, "relation-multi-search", debouncedSearch],
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

  const entries = (listData?.items ?? []).filter(item => !selectedIds.includes(item.id))

  const resolveLabel = (item: (typeof entries)[0]): string => {
    const raw = (item.data as Record<string, unknown>)?.[labelAlias]
    if (raw != null && raw !== "") return String(raw)
    return item.slug ?? item.id
  }

  const handleAdd = React.useCallback((id: string) => {
    if (!selectedIds.includes(id)) {
      onChange([...selectedIds, id])
    }
    setOpen(false)
    setSearch("")
  }, [selectedIds, onChange])

  const handleRemove = React.useCallback((idx: number) => {
    onChange(selectedIds.filter((_, i) => i !== idx))
  }, [selectedIds, onChange])

  const handleMoveUp = React.useCallback((idx: number) => {
    if (idx === 0) return
    const next = [...selectedIds]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    onChange(next)
  }, [selectedIds, onChange])

  const handleMoveDown = React.useCallback((idx: number) => {
    if (idx === selectedIds.length - 1) return
    const next = [...selectedIds]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    onChange(next)
  }, [selectedIds, onChange])

  const isRequired = isCreate ? branch.requiredOnCreate === true : branch.requiredOnUpdate === true

  return (
    <div className="space-y-2">
      {/* Chip row */}
      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5"
          aria-label={t("content.editor.relationMulti.selectedItems")}
        >
          {selectedIds.map((id, idx) => (
            <SortableChip
              key={id}
              id={id}
              index={idx}
              total={selectedIds.length}
              targetSlug={targetSlug ?? ""}
              labelAlias={labelAlias}
              onMoveUp={() => handleMoveUp(idx)}
              onMoveDown={() => handleMoveDown(idx)}
              onRemove={() => handleRemove(idx)}
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
            aria-label={t("content.editor.relationMulti.add")}
            disabled={disabled || !targetSlug}
            className={cn(
              "w-full justify-between font-normal",
              "text-muted-foreground"
            )}
          >
            <span className="truncate">
              {isRequired && selectedIds.length === 0
                ? t("content.editor.relation.placeholder")
                : t("content.editor.relationMulti.add")}
            </span>
            <ChevronsUpDown className="size-4 opacity-50 ml-2 shrink-0" />
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
              {isFetching && entries.length === 0 ? (
                <CommandEmpty>{t("content.editor.relation.loading")}</CommandEmpty>
              ) : entries.length === 0 ? (
                <CommandEmpty>{t("content.editor.relation.empty")}</CommandEmpty>
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

// ── Single-value RelationEdit (unchanged) ─────────────────────────────────────

interface SingleRelationEditProps {
  branch: BranchLike & { alias?: string; label?: string }
  value: string | null
  onChange: (v: string | null) => void
  disabled?: boolean
  isCreate?: boolean
  onInlineCreate?: () => void
}

function SingleRelationEdit({
  branch,
  value,
  onChange,
  disabled,
  isCreate,
  onInlineCreate,
}: SingleRelationEditProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounce(search, SEARCH_DEBOUNCE_MS)

  const targetSlug = branch.targetSeed
  const selectedId = typeof value === "string" && value.length > 0 ? value : null

  const { data: seeds } = useSchema()
  const targetSeed = seeds?.find((s) => s.slug === targetSlug)
  const labelAlias = targetSeed?.displayNameAlias ?? "title"

  const isRequired = isCreate
    ? branch.requiredOnCreate === true
    : branch.requiredOnUpdate === true
  const showClear = !isRequired && selectedId !== null

  const { data: selectedEntry } = useQuery({
    queryKey: CONTENT_QUERY_KEYS.detail(targetSlug ?? "", selectedId ?? ""),
    queryFn: () => contentApi.fetchById(targetSlug!, selectedId!),
    enabled: Boolean(targetSlug && selectedId),
    staleTime: RELATION_STALE_MS,
  })

  const selectedLabel = selectedEntry
    ? String((selectedEntry.data as Record<string, unknown>)?.[labelAlias] ?? selectedId)
    : selectedId ?? ""

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

// ── Public export: dispatches on branch.multiple ──────────────────────────────

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
    const ids = Array.isArray(value) ? (value as string[]) : []
    return (
      <MultiRelationEdit
        branch={branch as BranchLike}
        value={ids}
        onChange={(next) => onChange(next)}
        disabled={disabled}
        isCreate={isCreate}
      />
    )
  }

  return (
    <SingleRelationEdit
      branch={branch as BranchLike}
      value={typeof value === "string" ? value : null}
      onChange={onChange as (v: string | null) => void}
      disabled={disabled}
      isCreate={isCreate}
      onInlineCreate={onInlineCreate}
    />
  )
}
