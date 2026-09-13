// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import type { RowSelectionState } from "@tanstack/react-table"
import { toast } from "sonner"
import { ArrowLeft } from "lucide-react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { useActiveSeed } from "@/features/schema"
import { SmallCta } from "@/components/ui/small-cta"
import { ContentDeleteDialog } from "@/features/content-delete-dialog"
import {
  ContentTrashView,
  useContentTrash,
  useRestoreContent,
  usePurgeContent,
  useBulkRestoreContent,
  useBulkPurgeContent,
} from "@/features/content-management"

const PAGE_SIZE = 25

export function ContentTrashPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { can } = usePermissions()
  const { seed, isLoading: isSeedLoading } = useActiveSeed(slug)

  const [page, setPage] = React.useState(1)
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [purgeTarget, setPurgeTarget] = React.useState<string[] | null>(null)

  const softDeleteEnabled = seed?.softDelete === true
  const trash = useContentTrash(slug, { page, limit: PAGE_SIZE }, { enabled: softDeleteEnabled })

  const restoreMutation = useRestoreContent(slug ?? "")
  const purgeMutation = usePurgeContent(slug ?? "")
  const bulkRestoreMutation = useBulkRestoreContent(slug ?? "")
  const bulkPurgeMutation = useBulkPurgeContent(slug ?? "")

  const isMutating =
    restoreMutation.isPending ||
    purgeMutation.isPending ||
    bulkRestoreMutation.isPending ||
    bulkPurgeMutation.isPending

  // One reading per data refresh, never a ticking clock — keeps the countdown pure.
  const nowSeconds = React.useMemo(() => Math.floor(Date.now() / 1000), [trash.dataUpdatedAt])

  const selectedIds = React.useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  )

  const reportBulkResult = React.useCallback(
    (successMessageKey: string, result: { succeeded: string[]; failed: { id: string }[] }) => {
      setRowSelection({})
      if (result.failed.length > 0) {
        toast.error(t("content.trash.partialFailure", { count: result.failed.length }))
      } else {
        toast.success(t(successMessageKey))
      }
    },
    [t]
  )

  const handleRestore = React.useCallback(
    (id: string) => {
      const originalSlug = trash.data?.items.find((item) => item.id === id)?.slug ?? null
      restoreMutation.mutate(
        { id },
        {
          onSuccess: (result) => {
            if (result.slug && result.slug !== originalSlug) {
              toast.success(t("content.trash.restoredRenamed", { slug: result.slug }))
            } else {
              toast.success(t("content.trash.restored"))
            }
          },
          onError: () => toast.error(t("content.trash.partialFailure", { count: 1 })),
        }
      )
    },
    [restoreMutation, trash.data, t]
  )

  const handleBulkRestore = React.useCallback(
    (ids: string[]) => {
      bulkRestoreMutation.mutate(
        { ids },
        { onSuccess: (result) => reportBulkResult("content.trash.restored", result) }
      )
    },
    [bulkRestoreMutation, reportBulkResult]
  )

  const handleBulkPurgeConfirm = React.useCallback(async () => {
    if (!purgeTarget) return
    if (purgeTarget.length === 1) {
      await purgeMutation.mutateAsync({ id: purgeTarget[0] })
      setRowSelection({})
      toast.success(t("content.trash.purged"))
    } else {
      const result = await bulkPurgeMutation.mutateAsync({ ids: purgeTarget })
      reportBulkResult("content.trash.purged", result)
    }
  }, [purgeTarget, purgeMutation, bulkPurgeMutation, reportBulkResult, t])

  if (seed === null && !isSeedLoading) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 flex-col gap-4 p-4">
                <div className="content-area-inner">
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <h2 className="font-heading text-lg font-semibold text-destructive">Error</h2>
                    <p className="text-sm text-destructive/90">Seed "{slug}" not found</p>
                  </div>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  if (isSeedLoading || !seed) {
    return (
      <div className="[--header-height:calc(--spacing(14))]">
        <SidebarProvider className="flex flex-col">
          <SiteHeader />
          <div className="flex flex-1">
            <AppSidebar />
            <SidebarInset>
              <div className="flex flex-1 items-center justify-center py-12">
                <div className="text-muted-foreground">Loading configuration...</div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-w-0">
              <div className="content-area-inner flex flex-1 flex-col gap-4 min-h-0">
                <div className="mb-2 flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/content/${slug}`)}>
                    <ArrowLeft className="size-4" />
                    {t("content.trash.back")}
                  </Button>
                </div>
                <h1 className="font-heading text-2xl font-semibold">
                  {t("content.trash.title", { type: seed.labelPlural ?? seed.label })}
                </h1>

                {!softDeleteEnabled ? (
                  <SmallCta
                    svgPath={`${import.meta.env.BASE_URL}noResult.svg`}
                    title={t("content.trash.disabled")}
                    buttonText={t("content.trash.back")}
                    onButtonClick={() => navigate(`/content/${slug}`)}
                  />
                ) : (
                  <ContentTrashView
                    seed={seed}
                    data={trash.data?.items ?? []}
                    nowSeconds={nowSeconds}
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    selectedIds={selectedIds}
                    pageIndex={page - 1}
                    onPageIndexChange={(i) => setPage(i + 1)}
                    pageSize={PAGE_SIZE}
                    pageCount={Math.ceil((trash.data?.total ?? 0) / PAGE_SIZE)}
                    totalRows={trash.data?.total ?? 0}
                    canRestore={can("content:update", seed.slug)}
                    canPurge={can("content:delete", seed.slug)}
                    isMutating={isMutating}
                    onRestore={handleRestore}
                    onPurge={(id) => setPurgeTarget([id])}
                    onBulkRestore={handleBulkRestore}
                    onBulkPurge={(ids) => setPurgeTarget(ids)}
                  />
                )}
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <ContentDeleteDialog
        open={purgeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPurgeTarget(null)
        }}
        seed={seed}
        entryIds={purgeTarget}
        mode="purge"
        onConfirm={handleBulkPurgeConfirm}
      />
    </div>
  )
}
