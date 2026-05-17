import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useTheme } from "next-themes"
import { ChevronRight } from "lucide-react"
import { useCommandState } from "cmdk" // only useCommandState is imported directly from cmdk

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { SEED_REGISTRY } from "@beechcms/core"
import { cn } from "@/lib/utils"
import { useCommandPalette } from "./use-command-palette"
import type { CommandPage } from "./types"
import { RootView } from "./_parts/root-view"
import { SeedsView } from "./_parts/seeds-view"
import { SearchResultsView } from "./_parts/search-results-view"

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

export function CommandPalette() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const { open, setOpen, pages, currentPage, pushPage, popPage, search, setSearch } =
    useCommandPalette()

  const seeds = Object.values(SEED_REGISTRY)

  const PLACEHOLDER: Record<CommandPage, string> = {
    root: t("commandPalette.placeholderRoot"),
    seeds: t("commandPalette.placeholderSeeds"),
    create: t("commandPalette.placeholderCreate"),
    "search-results": t("commandPalette.placeholderSearch"),
  }

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
    setOpen(false)
  }, [resolvedTheme, setTheme, setOpen])

  return (
    <>
      {/* Animate cmdk list height */}
      <style>{`[cmdk-list]{height:var(--cmdk-list-height);transition:height 100ms ease}`}</style>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        aria-label={t("commandPalette.ariaLabel")}
      >
        <div className="flex flex-col">
          <BreadcrumbChips pages={pages} popPage={popPage} />
          <CommandInput
            placeholder={PLACEHOLDER[currentPage]}
            value={search}
            onValueChange={setSearch}
          />
        </div>

        <CommandList className="max-h-[400px]">
          <EmptyMessage />

          {currentPage === "root" && (
            <RootView
              seeds={seeds}
              pushPage={pushPage}
              navigate={navigate}
              setOpen={setOpen}
              theme={resolvedTheme}
              toggleTheme={toggleTheme}
            />
          )}
          {currentPage === "seeds" && (
            <SeedsView seeds={seeds} navigate={navigate} setOpen={setOpen} mode="navigate" />
          )}
          {currentPage === "create" && (
            <SeedsView seeds={seeds} navigate={navigate} setOpen={setOpen} mode="create" />
          )}
          {currentPage === "search-results" && (
            <SearchResultsView search={search} seeds={seeds} navigate={navigate} setOpen={setOpen} />
          )}
        </CommandList>

        {currentPage !== "root" && (
          <div className="p-3 border-t text-[10px] text-muted-foreground bg-muted/20">
            {t("commandPalette.backHint")}
          </div>
        )}
      </CommandDialog>
    </>
  )
}
