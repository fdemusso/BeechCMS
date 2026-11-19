// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { formatDistanceToNow } from "date-fns"
import { it as itLocale, enUS, type Locale } from "date-fns/locale"
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { Seed } from "@beechcms/core"
import { useMe, usePermissions, useSchema } from "@/features/shared"
// Module path, not the barrel: suites mock the barrel with a fixed object.
import { getPageActionDeclarations, usePageActionDeclarations } from "@/features/shared/hooks/use-page-actions"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useCommandPalette } from "./use-command-palette"
import type {
  CommandPage,
  PalettePerform,
  PaletteProvider,
  PaletteQueryContext,
  PaletteRequirement,
  PendingPageAction,
  ResolvedPaletteItem,
} from "./types"
import { useAsyncPaletteItems } from "./use-async-palette-items"
import { useQuickNotes } from "./use-quick-notes"
import { useRecentItems } from "./use-recent-items"
import { usePalettePins } from "./use-palette-pins"
import { collectPaletteItems } from "./lib/collect-palette-items"
import { copyText, toastPreview } from "./lib/copy-text"
import { withPinActions } from "./lib/pin-actions"
import { collectStableItems } from "./lib/stable-items"
import { rankPaletteItems } from "./lib/rank-palette-items"
import { parsePaletteQuery } from "./lib/parse-palette-query"
import { toActionRows } from "./lib/action-rows"
import { paletteKeyBinding } from "./lib/palette-key-binding"
import { createCalculatorProvider } from "./providers/calculator-provider"
import { createContextActionsProvider } from "./providers/context-actions-provider"
import { createConversionsProvider } from "./providers/conversions-provider"
import { createNavigationProvider } from "./providers/navigation-provider"
import { createContentProvider } from "./providers/content-provider"
import { createContentSearchProvider } from "./providers/content-search-provider"
import { createQuickNotesProvider } from "./providers/quick-notes-provider"
import { createPinsProvider } from "./providers/pins-provider"
import { createRecentItemsProvider, recentIdToRecord } from "./providers/recent-items-provider"
import { createShortcutsProvider } from "./providers/shortcuts-provider"
import { createToolsProvider } from "./providers/tools-provider"
import { PaletteList } from "./_parts/palette-list"
import { PaletteFooter } from "./_parts/palette-footer"

const NO_SEEDS: Seed[] = []

const DATE_FNS_LOCALE: Record<string, Locale> = { it: itLocale, en: enUS }

export interface CommandPaletteProps {
  /** Providers assembled outside the slice (composition root); rendered after the built-ins. */
  readonly hostProviders: readonly PaletteProvider[]
  /** Told after the palette opens or closes, so the composition root can fetch only while it is open. The palette stays uncontrolled. */
  readonly onOpenChange?: (open: boolean) => void
  /** Alt+Shift+N: the palette closes and this runs. Absent when the caller may not create content types. */
  readonly onNewSeed?: () => void
}

function EmptyMessage({ searching }: { searching: boolean }) {
  const { t } = useTranslation()
  const search = useCommandState((s) => s.search)
  return (
    <CommandEmpty>
      {searching
        ? t("commandPalette.searching")
        : search.length === 0
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
export function CommandPalette({ hostProviders, onOpenChange, onNewSeed }: CommandPaletteProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const {
    open, setOpen, pages, currentPage, pushPage, popPage, search, setSearch, actionsTarget, openActions,
  } = useCommandPalette()
  const { data: seedsData } = useSchema()
  const seeds = seedsData ?? NO_SEEDS
  const { can, canAnywhere, canGlobally } = usePermissions()
  const { data: me } = useMe()
  const quickNotes = useQuickNotes(me?.id, open)
  const recentItems = useRecentItems(me?.id, open)
  const pins = usePalettePins(me?.id)
  // Content rows are the only stable rows that wait on a query the engine owns.
  const catalogueReady = seedsData !== undefined
  const pinnedIds = React.useMemo(
    () => new Set(pins.state.status === "ready" ? pins.state.ids : []),
    [pins.state],
  )
  const declarations = usePageActionDeclarations()
  React.useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])
  const [pendingAction, setPendingAction] = React.useState<PendingPageAction | null>(null)
  const confirmedRef = React.useRef(false)

  const PLACEHOLDER: Record<CommandPage, string> = {
    root: t("commandPalette.placeholderRoot"),
    seeds: t("commandPalette.placeholderSeeds"),
    create: t("commandPalette.placeholderCreate"),
    settings: t("commandPalette.placeholderSettings"),
    "edit-schema": t("commandPalette.placeholderEditSchema"),
    shortcuts: t("commandPalette.placeholderShortcuts"),
    actions: t("commandPalette.placeholderActions"),
  }

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  // Cmd/Ctrl+Shift+L, as in Notion. e.code: Shift changes e.key's case, and the shortcut must not depend on layout state.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyL" || !event.shiftKey || event.altKey || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      toggleTheme()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [toggleTheme])

  // Alt+Shift+N. e.code: on macOS Option+N produces a dead key, so e.key is not "n".
  React.useEffect(() => {
    if (!onNewSeed) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyN" || !event.altKey || !event.shiftKey || event.metaKey || event.ctrlKey) return
      event.preventDefault()
      setOpen(false)
      onNewSeed()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [onNewSeed, setOpen])

  const formatUpdatedAt = React.useCallback(
    (unixSeconds: number) =>
      formatDistanceToNow(new Date(unixSeconds * 1000), {
        addSuffix: true,
        locale: DATE_FNS_LOCALE[i18n.language] ?? enUS,
      }),
    [i18n.language],
  )

  const formatSavedAt = React.useCallback(
    (epochMs: number) => formatUpdatedAt(epochMs / 1000),
    [formatUpdatedAt],
  )

  // Computed providers come first so equal scores go to the computed row; idle order: context, pinned, recent, navigation, content, host, notes, tools; the shortcuts page serves only its own page.
  // Search rows (async lane) always come after every local row.
  const providers = React.useMemo<readonly PaletteProvider[]>(() => {
    const contextActions = createContextActionsProvider({ declarations, requestConfirm: setPendingAction })
    const afterContext = [
      createNavigationProvider({ t }),
      createContentProvider({ t, seeds }),
      ...hostProviders,
      createQuickNotesProvider({
        t,
        notes: quickNotes.state,
        save: quickNotes.save,
        remove: quickNotes.remove,
        formatSavedAt,
      }),
      createToolsProvider({ t, theme: resolvedTheme, toggleTheme }),
      createShortcutsProvider({ t }),
    ]
    const calculator = createCalculatorProvider({ t })
    const conversions = createConversionsProvider({ t })
    const sources = [calculator, conversions, contextActions, ...afterContext]
    const pinned = createPinsProvider({ t, pins: pins.state, sources, catalogueReady, unpin: pins.unpin })
    const recent = createRecentItemsProvider({ t, recent: recentItems.state, sources, exclude: pinnedIds })
    return [calculator, conversions, contextActions, pinned, recent, ...afterContext]
  }, [t, seeds, declarations, hostProviders, quickNotes.state, quickNotes.save, quickNotes.remove, recentItems.state, pins.state, pins.unpin, catalogueReady, pinnedIds, formatSavedAt, resolvedTheme, toggleTheme])

  const asyncProviders = React.useMemo(
    () => [createContentSearchProvider({ t, seeds, formatUpdatedAt })],
    [t, seeds, formatUpdatedAt],
  )

  const parsed = React.useMemo(() => parsePaletteQuery(search, currentPage), [search, currentPage])
  const context = React.useMemo<PaletteQueryContext>(
    () => ({
      page: currentPage,
      query: parsed.text,
      prefix: parsed.prefix,
      permissions: { can, canAnywhere, canGlobally },
    }),
    [currentPage, parsed, can, canAnywhere, canGlobally],
  )
  const asyncResults = useAsyncPaletteItems(asyncProviders, context)
  const stable = React.useMemo(
    () => collectStableItems(providers, { permissions: { can, canAnywhere, canGlobally } }),
    [providers, can, canAnywhere, canGlobally],
  )

  const items = React.useMemo(() => {
    if (currentPage === "actions") {
      return actionsTarget ? rankPaletteItems(toActionRows(actionsTarget), parsed.text) : []
    }
    const describeMissing = ({ permission }: PaletteRequirement) =>
      t("commandPalette.requiresPermission", { permission })
    const rankedLocal = rankPaletteItems(collectPaletteItems(providers, context, describeMissing), parsed.text)
    const localItems = withPinActions(rankedLocal, { t, pins: pins.state, stable, pin: pins.pin, unpin: pins.unpin })
    return [...localItems, ...collectPaletteItems(asyncResults.settled, context, describeMissing)]
  }, [currentPage, actionsTarget, providers, context, parsed.text, asyncResults.settled, t, pins.state, pins.pin, pins.unpin, stable])

  const copyToClipboard = (value: string) => {
    void copyText(value).then((copied) =>
      copied ? toast.success(t("commandPalette.copied", { value: toastPreview(value) })) : toast.error(t("common.copyFailed")),
    )
  }

  const runPerform = (action: PalettePerform) => {
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
        if (!action.keepOpen) setOpen(false)
        // The actions page lists a frozen copy of its row, which would still offer the old Pin or Unpin.
        else if (currentPage === "actions") popPage()
        break
      case "copy":
        copyToClipboard(action.value)
        setOpen(false)
        break
    }
  }

  const perform = (item: ResolvedPaletteItem) => {
    // Recorded before runPerform, which closes the palette.
    const recentId = recentIdToRecord(item, stable)
    if (recentId) recentItems.record(recentId)
    runPerform(item.perform)
  }

  const confirmPendingAction = () => {
    if (!pendingAction) return
    confirmedRef.current = true
    const { hostId, targetId, action } = pendingAction
    const stillPublished = getPageActionDeclarations().some(
      (declaration) => declaration.hostId === hostId && declaration.targetId === targetId,
    )
    if (stillPublished) runPerform(action.perform)
    else toast.error(t("commandPalette.context.targetGone"))
    setPendingAction(null)
  }

  const handleConfirmOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return
    const wasConfirmed = confirmedRef.current
    confirmedRef.current = false
    setPendingAction(null)
    // Cancel or Escape returns to the palette; a confirmation never does.
    if (!wasConfirmed) setOpen(true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const binding = paletteKeyBinding(event.nativeEvent)
    if (!binding) return

    // cmdk's Enter ignores modifiers; consuming the chord keeps it off the primary action.
    event.preventDefault()

    // The same lookup cmdk uses to find the row Enter selects.
    const selectedId = event.currentTarget
      .querySelector('[cmdk-item=""][aria-selected="true"]')
      ?.getAttribute("data-value")
    const row = items.find((item) => item.id === selectedId)
    if (!row || row.disabledReason !== null || !row.actions?.length) return

    if (binding === "secondary-action") runPerform(row.actions[0].perform)
    else openActions(row)
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
        {/* No padding on Command: each of header, body and footer pads itself, so the footer's border and tint reach the dialog edges. */}
        <Command loop shouldFilter={false} onKeyDown={handleKeyDown} className="border-none bg-transparent p-0 shadow-none">
          <div data-slot="palette-header" className="flex flex-col p-1">
            <BreadcrumbChips pages={pages} popPage={popPage} />
            <CommandInput
              placeholder={PLACEHOLDER[currentPage]}
              value={search}
              onValueChange={setSearch}
            />
          </div>

          <div data-slot="palette-body" className="min-h-0 flex-1 px-1 pb-1">
            <CommandList className="max-h-[min(550px,calc(100dvh-12rem))]">
              <EmptyMessage searching={asyncResults.pending} />

              <PaletteList
                items={items}
                ranked={search.trim().length > 0}
                onPerform={perform}
                onRunAction={(action) => runPerform(action.perform)}
              />
            </CommandList>
          </div>

          <PaletteFooter page={currentPage} items={items} />
        </Command>
      </CommandDialog>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={handleConfirmOpenChange}
        title={pendingAction?.action.confirm?.title ?? ""}
        description={pendingAction?.action.confirm?.description ?? ""}
        confirmVariant={pendingAction?.action.confirm?.destructive ? "destructive" : undefined}
        onConfirm={confirmPendingAction}
      />
    </>
  )
}
