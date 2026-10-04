// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ChevronLeft, FolderAdd, Image as ImageIcon } from 'reicon-react'

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/small-cta"
import type { GalleryCardDisplayModel } from "./gallery-card-display"
import { GalleryCard } from "./gallery-components/gallery-card"
import { GalleryFolderCard } from "./gallery-components/gallery-folder-card"
import { formatItemCount } from "./gallery-components/format-item-count"
import { GalleryNewFolderDialog } from "./gallery-components/gallery-new-folder-dialog"
import { GallerySkeletonGrid } from "./gallery-components/gallery-skeleton-grid"
import { useContentGallery } from "./gallery-hooks"
import { categoryKey } from "./group-by-category"
import type { ContentGalleryProps } from "./types"

/** Parametro URL con la cartella aperta: il tasto "indietro" del browser torna alle cartelle. */
const FOLDER_PARAM = "album"
/** Valore del parametro per la cartella "Altre foto" (foto senza categoria). */
const UNCATEGORIZED_PARAM = "__altre"

/**
 * Griglia condivisa da card foto e card cartella, perché occupino esattamente
 * lo stesso spazio: auto-fit, 220px min / 420px max per evitare card troppo
 * larghe su monitor 21:9 dove 1fr diventerebbe enorme. clamp(220px, ...) non
 * è supportato direttamente in grid-template-columns, quindi usiamo minmax
 * con un cap esplicito.
 */
function GalleryGridContainer({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="grid gap-5"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 420px))", justifyContent: "center" }}
    >
      {children}
    </div>
  )
}

function GalleryGrid({
  models,
  onOpen,
}: {
  readonly models: GalleryCardDisplayModel[]
  readonly onOpen: (entryId: string) => void
}) {
  return (
    <GalleryGridContainer>
      {models.map((model) => (
        <GalleryCard key={model.entryId} model={model} onOpen={onOpen} />
      ))}
    </GalleryGridContainer>
  )
}

export function ContentGallery({
  seed,
  data,
  isLoading = false,
  onEdit,
  onCreate,
  groupBy,
  formatElement,
}: ContentGalleryProps) {
  const { t } = useTranslation()
  const { cardModels, categoryGroups, categoryAlias } = useContentGallery(seed, data, groupBy, formatElement)
  const [searchParams, setSearchParams] = useSearchParams()
  const [newFolderOpen, setNewFolderOpen] = React.useState(false)

  const folderParam = searchParams.get(FOLDER_PARAM)
  const openGroup = folderParam
    ? categoryGroups.find((group) => (group.key ?? UNCATEGORIZED_PARAM) === folderParam) ?? null
    : null

  // push (non replace): il tasto "indietro" del browser chiude la cartella.
  const openFolder = React.useCallback(
    (key: string | null) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set(FOLDER_PARAM, key ?? UNCATEGORIZED_PARAM)
        return next
      })
    },
    [setSearchParams]
  )

  const closeFolder = React.useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete(FOLDER_PARAM)
      return next
    })
  }, [setSearchParams])

  function handleNewFolder(name: string) {
    setNewFolderOpen(false)
    const existing = categoryGroups.find((group) => group.key === categoryKey(name))
    if (existing) {
      openFolder(existing.key)
    } else if (onCreate && categoryAlias) {
      onCreate({ [categoryAlias]: name })
    }
  }

  if (isLoading) {
    return <GallerySkeletonGrid />
  }

  // Seed senza campo categoria: galleria piatta, come prima.
  if (!categoryAlias) {
    if (data.length === 0) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{t("gallery.noItems")}</EmptyTitle>
            <EmptyDescription>
              {t("gallery.noItemsDesc")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }
    return <GalleryGrid models={cardModels} onOpen={onEdit} />
  }

  return (
    <>
      {openGroup ? (
        <section aria-label={openGroup.label ?? t("gallery.folders.uncategorized")}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="lg" onClick={closeFolder}>
              <ChevronLeft className="size-4" />
              {t("gallery.folders.backToFolders")}
            </Button>
            <h3 className="font-heading flex flex-1 items-baseline gap-2 text-xl font-semibold">
              {openGroup.label ?? t("gallery.folders.uncategorized")}
              <span className="text-sm font-normal text-muted-foreground">
                {formatItemCount(t, openGroup.models.length)}
              </span>
            </h3>
            {onCreate && (
              <Button
                size="lg"
                onClick={() => onCreate(openGroup.label ? { [categoryAlias]: openGroup.label } : {})}
              >
                <ImageIcon className="size-4" />
                {t("gallery.folders.addPhotoHere")}
              </Button>
            )}
          </div>
          <GalleryGrid models={openGroup.models} onOpen={onEdit} />
        </section>
      ) : (
        <section aria-label={t("gallery.folders.sectionAriaLabel")}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-heading text-xl font-semibold">{t("gallery.folders.title")}</h3>
            {onCreate && (
              <Button size="lg" onClick={() => setNewFolderOpen(true)}>
                <FolderAdd className="size-4" />
                {t("gallery.folders.newFolder")}
              </Button>
            )}
          </div>
          {categoryGroups.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderAdd className="size-5" />
                </EmptyMedia>
                <EmptyTitle>{t("gallery.folders.emptyTitle")}</EmptyTitle>
                <EmptyDescription>
                  {t("gallery.folders.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <GalleryGridContainer>
              {categoryGroups.map((group) => (
                <GalleryFolderCard
                  key={group.key ?? UNCATEGORIZED_PARAM}
                  group={group}
                  onOpen={openFolder}
                />
              ))}
            </GalleryGridContainer>
          )}
        </section>
      )}

      <GalleryNewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        onConfirm={handleNewFolder}
      />
    </>
  )
}
