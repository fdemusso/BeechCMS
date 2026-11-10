// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useTheme } from "@/lib/theme"
import { ChevronRight } from '@/components/icons'
import { useCommandState } from "cmdk" // only useCommandState is imported directly from cmdk

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import type { Seed } from "@beechcms/core"
import { usePermissions, useSchema } from "@/features/shared"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useCommandPalette } from "./use-command-palette"
import type {
  CommandPage,
  PaletteProvider,
  PaletteRequirement,
  ResolvedPaletteItem,
} from "./types"
import { collectPaletteItems } from "./lib/collect-palette-items"
import { rankPaletteItems } from "./lib/rank-palette-items"
import { parsePaletteQuery } from "./lib/parse-palette-query"
import { createCalculatorProvider } from "./providers/calculator-provider"
import { createConversionsProvider } from "./providers/conversions-provider"
import { createNavigationProvider } from "./providers/navigation-provider"
import { createContentProvider } from "./providers/content-provider"
import { createToolsProvider } from "./providers/tools-provider"
import { PaletteList } from "./_parts/palette-list"
import { SearchResultsView } from "./_parts/search-results-view"

const NO_SEEDS: Seed[] = []

export interface CommandPaletteProps {
  /** Providers assembled outside the slice (composition root); rendered after the built-ins. */
  readonly hostProviders: readonly PaletteProvider[]
}

function EmptyMessage() {
  const { t } = useTranslation()
  const search = useCommandState((s) => s.search)
  return (
    <CommandEmpty>
      {search.length === 0
        ? t("commandPalette.noResults")
        : <>{t("commandPalette.noResults")} <span className="font-medium">"{search}"</span></>}
    </CommandEmpty>
  )
}

interface BreadcrumbChipsProps {
  pages: CommandPage[]
  popPage: () => void
}

function BreadcrumbChips({ pages, popPage }: BreadcrumbChipsProps) {
  if (pages.length <= 1) return null
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-0 overflow-x-auto">
      {pages.map((page, i) => (
        <React.Fragment key={page + i}>
          <Badge
            variant="secondary"
            className={cn(
              "cursor-pointer hover:bg-secondary/80 capitalize shrink-0",
              i === pages.length - 1 && "opacity-60 pointer-events-none"
            )}
            onClick={() => {
              const diff = pages.length - 1 - i
              for (let j = 0; j < diff; j++) popPage()
            }}
          >
            {page}
          </Badge>
          {i < pages.length - 1 && (
            <ChevronRight className="size-3 text-muted-foreground shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

/** Global command palette: aggregates every provider's rows, ranks them and renders the result. */
export function CommandPalette({ hostProviders }: CommandPaletteProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const { open, setOpen, pages, currentPage, pushPage, popPage, search, setSearch } =
    useCommandPalette()
  const { data: seedsData } = useSchema()
  const seeds = seedsData ?? NO_SEEDS
  const { can, canAnywhere, canGlobally } = usePermissions()

  const PLACEHOLDER: Record<CommandPage, string> = {
    root: t("commandPalette.placeholderRoot"),
    seeds: t("commandPalette.placeholderSeeds"),
    create: t("commandPalette.placeholderCreate"),
    settings: t("commandPalette.placeholderSettings"),
    "edit-schema": t("commandPalette.placeholderEditSchema"),
    "search-results": t("commandPalette.placeholderSearch"),
  }

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  // Computed providers come first so equal scores go to the computed row; idle order: navigation, content, host, tools.
  const providers = React.useMemo<readonly PaletteProvider[]>(
    () => [
      createCalculatorProvider({ t }),
      createConversionsProvider({ t }),
      createNavigationProvider({ t }),
      createContentProvider({ t, seeds }),
      ...hostProviders,
      createToolsProvider({ t, theme: resolvedTheme, toggleTheme }),
    ],
    [t, seeds, hostProviders, resolvedTheme, toggleTheme],
  )

  const parsed = React.useMemo(() => parsePaletteQuery(search, currentPage), [search, currentPage])
  const items = React.useMemo(() => {
    const describeMissing = ({ permission }: PaletteRequirement) =>
      t("commandPalette.requiresPermission", { permission })
    const collected = collectPaletteItems(
      providers,
      { page: currentPage, query: parsed.text, prefix: parsed.prefix, permissions: { can, canAnywhere, canGlobally } },
      describeMissing,
    )
    return rankPaletteItems(collected, parsed.text)
  }, [providers, currentPage, parsed, can, canAnywhere, canGlobally, t])

  const copyToClipboard = (value: string) => {
    if (!navigator.clipboard) {
      toast.error(t("common.copyFailed"))
      return
    }
    navigator.clipboard.writeText(value).then(
      () => toast.success(t("commandPalette.copied", { value })),
      () => toast.error(t("common.copyFailed")),
    )
  }

  const perform = (item: ResolvedPaletteItem) => {
    const { perform: action } = item
    switch (action.kind) {
      case "navigate":
        navigate(action.to)
        setOpen(false)
        break
      case "page":
        pushPage(action.page)
        break
      case "run":
        action.run()
        setOpen(false)
        break
      case "copy":
        copyToClipboard(action.value)
        setOpen(false)
        break
    }
  }

  return (
    <>
      {/* Animate cmdk list height */}
      <style>{`[data-slot="command-list"]{height:var(--cmdk-list-height);transition:height 100ms ease}`}</style>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        aria-label={t("commandPalette.ariaLabel")}
        className="sm:max-w-2xl"
        onEscapeKeyDown={(e) => {
          // Radix closes the dialog on Escape before our document listener runs:
          // on a sub-page, step back instead of closing.
          if (pages.length > 1) {
            e.preventDefault()
            popPage()
          }
        }}
      >
        <Command loop shouldFilter={false} className="border-none bg-transparent shadow-none">
          <div className="flex flex-col">
            <BreadcrumbChips pages={pages} popPage={popPage} />
            <CommandInput
              placeholder={PLACEHOLDER[currentPage]}
              value={search}
              onValueChange={setSearch}
            />
          </div>

          <CommandList className="max-h-[min(550px,calc(100dvh-12rem))]">
            <EmptyMessage />

            {currentPage === "search-results" ? (
              <SearchResultsView search={search} seeds={seeds} navigate={navigate} setOpen={setOpen} />
            ) : (
              <PaletteList items={items} ranked={search.trim().length > 0} onPerform={perform} />
            )}
          </CommandList>

          {currentPage !== "root" && (
            <div className="p-3 border-t text-xs text-muted-foreground bg-muted/20">
              {t("commandPalette.backHint")}
            </div>
          )}
        </Command>
      </CommandDialog>
    </>
  )
}
