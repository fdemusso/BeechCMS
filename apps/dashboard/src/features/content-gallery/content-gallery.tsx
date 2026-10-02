// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useSearchParams } from "react-router-dom"
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
import {
  GalleryFolderCard,
  UNCATEGORIZED_LABEL,
  formatItemCount,
} from "./gallery-components/gallery-folder-card"
import { GalleryNewFolderDialog } from "./gallery-components/gallery-new-folder-dialog"
import { GalleryPeekPanel } from "./gallery-components/gallery-peek-panel"
import { GallerySkeletonGrid } from "./gallery-components/gallery-skeleton-grid"
import { useContentGallery } from "./gallery-hooks"
import { categoryKey } from "./group-by-category"
import type { ContentGalleryProps } from "./types"

/** Parametro URL con la cartella aperta: il tasto "indietro" del browser torna alle cartelle. */
const FOLDER_PARAM = "album"
/** Valore del parametro per la cartella "Altre foto" (foto senza categoria). */
const UNCATEGORIZED_PARAM = "__altre"

function GalleryGrid({
  models,
  onOpen,
}: {
  readonly models: GalleryCardDisplayModel[]
  readonly onOpen: (entryId: string) => void
}) {
  return (
    // auto-fill: si adatta da 280px min a 420px max per evitare card
    // troppo larghe su monitor 21:9 dove 1fr diventerebbe enorme.
    // clamp(280px, ...) non è supportato direttamente in grid-template-columns
    // quindi usiamo minmax con un cap esplicito.
    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 420px))", justifyContent: "center" }}>
      {models.map((model) => (
        <GalleryCard key={model.entryId} model={model} onOpen={onOpen} />
      ))}
    </div>
  )
}

export function ContentGallery({
  seed,
  data,
  isLoading = false,
  onEdit,
  onCreate,
}: ContentGalleryProps) {
  const { setPeekId, peekEntry, cardModels, categoryGroups, categoryAlias } = useContentGallery(seed, data)
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
            <EmptyTitle>Nessun elemento da visualizzare</EmptyTitle>
            <EmptyDescription>
              Non ci sono contenuti disponibili per questa vista galleria.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    }
    return (
      <>
        <GalleryGrid models={cardModels} onOpen={setPeekId} />
        <GalleryPeekPanel
          seed={seed}
          entry={peekEntry}
          open={peekEntry != null}
          onClose={() => setPeekId(null)}
          onEdit={onEdit}
        />
      </>
    )
  }

  return (
    <>
      {openGroup ? (
        <section aria-label={openGroup.label ?? UNCATEGORIZED_LABEL}>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="lg" onClick={closeFolder}>
              <ChevronLeft className="size-4" />
              Torna alle cartelle
            </Button>
            <h3 className="flex flex-1 items-baseline gap-2 text-xl font-semibold">
              {openGroup.label ?? UNCATEGORIZED_LABEL}
              <span className="text-sm font-normal text-muted-foreground">
                {formatItemCount(openGroup.models.length)}
              </span>
            </h3>
            {onCreate && (
              <Button
                size="lg"
                onClick={() => onCreate(openGroup.label ? { [categoryAlias]: openGroup.label } : {})}
              >
                <ImageIcon className="size-4" />
                Aggiungi foto qui
              </Button>
            )}
          </div>
          <GalleryGrid models={openGroup.models} onOpen={setPeekId} />
        </section>
      ) : (
        <section aria-label="Cartelle">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">Le tue cartelle</h3>
            {onCreate && (
              <Button size="lg" onClick={() => setNewFolderOpen(true)}>
                <FolderAdd className="size-4" />
                Nuova cartella
              </Button>
            )}
          </div>
          {categoryGroups.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderAdd className="size-5" />
                </EmptyMedia>
                <EmptyTitle>Non hai ancora nessuna cartella</EmptyTitle>
                <EmptyDescription>
                  Premi “Nuova cartella” per iniziare, poi aggiungi la prima foto.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div
              className="grid gap-5"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 280px))" }}
            >
              {categoryGroups.map((group) => (
                <GalleryFolderCard
                  key={group.key ?? UNCATEGORIZED_PARAM}
                  group={group}
                  onOpen={openFolder}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <GalleryNewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        onConfirm={handleNewFolder}
      />

      <GalleryPeekPanel
        seed={seed}
        entry={peekEntry}
        open={peekEntry != null}
        onClose={() => setPeekId(null)}
        onEdit={onEdit}
      />
    </>
  )
}
