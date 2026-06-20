// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import { useState, useEffect } from "react"
import { ChevronDown, Loader2, Pencil, Trash2, LayoutTemplate } from "lucide-react"
import type { Seed } from "@beechcms/core"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BuilderPane } from "../builder/builder-pane"
import { ReferencedByPanel } from "@/features/backrefs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { LayoutRenderer } from "./layout-renderer"
import type { SchemaFormViewModel } from "./schema-form-view-model"

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface SchemaFormShellProps {
  readonly vm: SchemaFormViewModel
  readonly open: boolean
}

interface LoadingDialogProps {
  readonly open: boolean
  readonly goBack: () => void
}

interface SeedNotFoundDialogProps {
  readonly open: boolean
  readonly notFoundLabel: string
  readonly goBack: () => void
  readonly t: SchemaFormViewModel["t"]
}

interface EntryErrorDialogProps {
  readonly open: boolean
  readonly errorEntry: string
  readonly goBack: () => void
  readonly t: SchemaFormViewModel["t"]
}

// ============================================================================
// SUB-DIALOG COMPONENTS (To reduce cognitive complexity)
// ============================================================================

function LoadingDialog({ open, goBack }: LoadingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
      <DialogContent className="flex flex-col max-h-[calc(100vh-2rem)] p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogTitle>
            <Skeleton className="h-6 w-48" />
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 max-h-[calc(100vh-12rem)]">
          <div className="px-6 pt-4 pb-4 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="min-h-[30vh] w-full rounded-lg" />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function SeedNotFoundDialog({ open, notFoundLabel, goBack, t }: SeedNotFoundDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
      <DialogContent className="flex flex-col max-h-[calc(100vh-2rem)] p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogTitle>{t("common.error")}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 max-h-[calc(100vh-12rem)]">
          <div className="px-6 pt-4 pb-4">
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-destructive">{notFoundLabel}</p>
              <Button variant="outline" className="mt-2" onClick={goBack}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

function EntryErrorDialog({ open, errorEntry, goBack, t }: EntryErrorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
      <DialogContent className="flex flex-col max-h-[calc(100vh-2rem)] p-0">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogTitle>{t("common.error")}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 max-h-[calc(100vh-12rem)]">
          <div className="px-6 pt-4 pb-4">
            <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
              <p className="text-destructive">{errorEntry}</p>
              <Button variant="outline" className="mt-2" onClick={goBack}>
                {t("common.close")}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// MAIN SHELL COMPONENT
// ============================================================================

export function SchemaFormShell({ vm, open }: SchemaFormShellProps) {
  const {
    t,
    title,
    isCreate,
    seed,
    isSeedLoading,
    isLoadingEntry,
    errorEntry,
    notFoundLabel,
    showDiscardConfirm,
    setShowDiscardConfirm,
    effectiveDraftContext,
    hasPendingDraftNotice,
    isDiscarding,
    isDeleting,
    isPublishing,
    formData,
    fieldErrors,
    hasRestrictedRefs,
    setHasRestrictedRefs,
    showDeleteConfirm,
    setShowDeleteConfirm,
    builderMode,
    setBuilderMode,
    canEditLayoutFlag,
    blocker,
    branchById,
    layout,
    handleInputChange,
    goBack,
    navigate,
    handlePublishDraft,
    handleDiscardDraft,
    handleDelete,
    handleSubmit,
    isBusy,
    saveLabel,
    hasSaveDropdown,
    capabilities,
    dangerZoneSlot,
    schemaSlug,
    entryId,
  } = vm

  const [activeTabId, setActiveTabId] = useState(() => layout?.tabs[0]?.id ?? "")

  useEffect(() => {
    if (!layout) return
    const exists = layout.tabs.some((t) => t.id === activeTabId) || (!!dangerZoneSlot && activeTabId === "__danger_zone__")
    if (!exists && layout.tabs.length > 0) {
      setActiveTabId(layout.tabs[0].id)
    }
  }, [layout, activeTabId, dangerZoneSlot])

  // ---- Loading state ----
  if (isSeedLoading || (entryId && isLoadingEntry)) {
    return <LoadingDialog open={open} goBack={goBack} />
  }

  // ---- Seed not found ----
  if (!seed && !isSeedLoading) {
    return <SeedNotFoundDialog open={open} notFoundLabel={notFoundLabel} goBack={goBack} t={t} />
  }

  // ---- Entry load error ----
  if (entryId && errorEntry) {
    return <EntryErrorDialog open={open} errorEntry={errorEntry} goBack={goBack} t={t} />
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) goBack() }}>
        <DialogContent 
          className="flex flex-col max-h-[calc(100vh-2rem)] p-0 sm:max-w-2xl md:max-w-4xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="absolute top-2 right-10 flex items-center gap-1">
            {vm.isReadOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => vm.setIsReadOnly?.(false)}
                  >
                    <Pencil className="size-4" />
                    <span className="sr-only">Passa alla modalità modifica</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Passa alla modalità modifica
                </TooltipContent>
              </Tooltip>
            )}

            {capabilities.layoutBuilder && canEditLayoutFlag && seed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setBuilderMode(true)}
                  >
                    <LayoutTemplate className="size-4" />
                    <span className="sr-only">{t("layoutBuilder.editLayout")}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t("layoutBuilder.editLayout")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Only the content hook (capabilities.layoutBuilder=true) ever supplies a
              full Seed here — the narrowed view-model type only guarantees label/slug. */}
          {capabilities.layoutBuilder && builderMode && seed ? (
            <BuilderPane
              seed={seed as Seed}
              branchById={branchById}
              onClose={() => setBuilderMode(false)}
            />
          ) : null}

          <form
            className={`flex-1 flex flex-col min-h-0 ${builderMode ? 'hidden' : ''}`}
            onSubmit={handleSubmit}
          >
            {/* Scrollable body */}
            <ScrollArea className="flex-1 max-h-[calc(100vh-12rem)]">
              <div className="px-6 pt-4 pb-4 space-y-4">

              {/* Draft context notice */}
              {capabilities.drafts && effectiveDraftContext && (
                <div className="flex items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
                  <span>{t("content.editor.draftModeNotice")}</span>
                </div>
              )}

              {/* Pending draft notice (normal context) */}
              {capabilities.drafts && !effectiveDraftContext && hasPendingDraftNotice && (
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-200">
                  <span className="flex-1">{t("content.editor.pendingDraftNotice")}</span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
                      onClick={() => navigate(`/content/${schemaSlug}/${entryId}`, { state: { isDraftContext: true }, replace: true })}
                    >
                      {t("content.editor.editDraft")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/30"
                      onClick={() => setShowDiscardConfirm(true)}
                      disabled={isDiscarding}
                    >
                      {t("content.editor.discardDraft")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Layout renderer
                  Field rendering is fully registry-driven. New branch types (e.g. the
                  'repeater' added in sprint 08, promoted to a core BranchType in sprint 10)
                  appear here automatically with zero changes to this shell. */}
              {layout != null && (
                <LayoutRenderer
                  layout={layout}
                  branchById={branchById}
                  formData={formData}
                  fieldErrors={fieldErrors}
                  onChange={handleInputChange}
                  dangerZoneSlot={capabilities.dangerZone && !isCreate ? dangerZoneSlot : undefined}
                  dangerZoneLabel={t("content.editor.tabs.dangerZone", "Danger Zone")}
                  activeTabId={activeTabId}
                  onActiveTabChange={setActiveTabId}
                  isReadOnly={vm.isReadOnly}
                />
              )}

              {/* Back-references panel — edit mode only */}
              {capabilities.backrefs && !isCreate && schemaSlug && entryId && (
                <ReferencedByPanel
                  targetSlug={schemaSlug}
                  targetId={entryId}
                  onRestrictsChange={setHasRestrictedRefs}
                />
              )}
              </div>
            </ScrollArea>

            {/* Fixed footer — always visible at the bottom of the dialog, actions aligned right */}
            {activeTabId !== "__danger_zone__" && !vm.isReadOnly && (
              <div className="flex-shrink-0 flex items-center justify-end gap-2 px-6 pt-4 pb-6">
                {/* Delete button — edit mode, normal context only */}
                {capabilities.delete && !isCreate && !effectiveDraftContext && (
                  hasRestrictedRefs ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button type="button" variant="destructive" size="sm" disabled>
                            <Trash2 className="mr-1 size-4" />
                            {t("common.delete", "Delete")}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("backrefs.deleteBlocked", { count: "?" })}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      <Trash2 className="mr-1 size-4" />
                      {t("common.delete", "Delete")}
                    </Button>
                  )
                )}

                {/* Split save button */}
                <div className="flex items-center">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isBusy}
                    className={capabilities.drafts && hasSaveDropdown ? "rounded-r-none border-r border-r-primary-foreground/20 pr-3" : ""}
                  >
                    {saveLabel}
                  </Button>
                  {capabilities.drafts && hasSaveDropdown && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          disabled={isBusy}
                          className="rounded-l-none px-2 border-l-0"
                        >
                          <ChevronDown className="size-3" />
                          <span className="sr-only">{t("common.openMenu")}</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={handlePublishDraft} disabled={isPublishing}>
                          {isPublishing && <Loader2 className="mr-2 size-3 animate-spin" />}
                          {t("content.editor.publishDraft")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setShowDiscardConfirm(true)}
                        >
                          {t("content.editor.discardDraft")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Unsaved changes warning alert — universal, ungated */}
      <AlertDialog open={blocker.state === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("content.editor.unsavedTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("content.editor.unsavedDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t("content.editor.stay")}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              {t("content.editor.exitWithout")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard draft confirmation */}
      {capabilities.drafts && (
        <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("content.editor.discardDraftTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("content.editor.discardDraftDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowDiscardConfirm(false)}>
                {t("content.editor.stay")}
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDiscardDraft} disabled={isDiscarding}>
                {isDiscarding ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                {t("content.editor.discardDraft")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Delete entry confirmation */}
      {capabilities.delete && (
        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("content.editor.deleteTitle", "Delete entry?")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("content.editor.deleteDesc", "This action cannot be undone.")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setShowDeleteConfirm(false)}>
                {t("content.editor.stay")}
              </AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                {t("common.delete", "Delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
