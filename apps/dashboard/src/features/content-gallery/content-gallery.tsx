// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { FolderAdd, Image as ImageIcon } from 'reicon-react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
import { GallerySkeletonGrid } from "./gallery-components/gallery-skeleton-grid"
import { useContentGallery } from "./gallery-hooks"
import { FOLDER_PARAM, UNCATEGORIZED_PARAM } from "./folder-create-defaults"
import type { ContentGalleryProps } from "./types"


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

/**
 * Path bar: breadcrumb sempre visibile sopra le cartelle: nella lista cartelle il seed è la
 * pagina corrente, dentro una cartella diventa il link per tornare indietro.
 * A destra il conteggio degli elementi mostrati.
 */
function GalleryPathBar({
  rootLabel,
  folderLabel,
  countText,
  onBack,
}: {
  readonly rootLabel: string
  readonly folderLabel?: string
  readonly countText: string
  readonly onBack: () => void
}) {
  // pl-7 = px-4 della toolbar + px-3 interno della pillola vista: il testo parte sotto l'icona della prima pillola
  return (
    <div data-slot="gallery-path-bar" className="mb-4 flex flex-wrap items-center gap-3 pl-7 pr-4">
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            {folderLabel === undefined ? (
              <BreadcrumbPage className="font-medium">{rootLabel}</BreadcrumbPage>
            ) : (
              <BreadcrumbLink asChild>
                <button type="button" onClick={onBack} className="cursor-pointer">
                  {rootLabel}
                </button>
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {folderLabel !== undefined && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-medium">{folderLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      <span className="text-sm text-muted-foreground">{countText}</span>
    </div>
  )
}

export function ContentGallery({
  seed,
  data,
  isLoading = false,
  onEdit,
  groupBy,
  formatElement,
  card,
}: ContentGalleryProps) {
  const { t } = useTranslation()
  const { cardModels, categoryGroups, categoryAlias } = useContentGallery(seed, data, groupBy, formatElement, card)
  const [searchParams, setSearchParams] = useSearchParams()

  const rootLabel = seed.labelPlural ?? seed.label
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
          <GalleryPathBar
            rootLabel={rootLabel}
            folderLabel={openGroup.label ?? t("gallery.folders.uncategorized")}
            countText={formatItemCount(t, openGroup.models.length, seed)}
            onBack={closeFolder}
          />
          <GalleryGrid models={openGroup.models} onOpen={onEdit} />
        </section>
      ) : (
        <section aria-label={t("gallery.folders.sectionAriaLabel")}>
          <GalleryPathBar
            rootLabel={rootLabel}
            countText={formatItemCount(t, data.length, seed)}
            onBack={closeFolder}
          />
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
                  seed={seed}
                  key={group.key ?? UNCATEGORIZED_PARAM}
                  group={group}
                  onOpen={openFolder}
                />
              ))}
            </GalleryGridContainer>
          )}
        </section>
      )}
    </>
  )
}
