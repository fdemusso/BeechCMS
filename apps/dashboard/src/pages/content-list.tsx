// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Trash2 } from "reicon-react"
import { usePermissions } from "@/features/shared/hooks/use-permissions"
import { Button } from "@/components/ui/button"

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader, PageShellLoading } from "@/features/navigation"
import { useActiveSeed } from "@/features/schema"
import { resolveAuthorizedViews, type ContentView, type DashboardView } from "@beechcms/core"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DEFAULT_ENABLED_TOOLS, DEFAULT_VIEW_SETTINGS, ToolbarStrip, ViewSwitcher, type UserViewInstance } from "@/features/content-toolbar"
import { viewRegistry } from "./view-registry"
import {
  resolveActiveViewId,
  useContentViews,
  useCreateContentView,
  useDeleteContentView,
  useReorderContentViews,
  useUpdateContentView,
  viewProblemType,
  ViewEmptyState,
} from "@/features/content-views"
import { ContentViewWorkspace } from "./content-view-workspace"

/**
 * Persistenza locale (per seed) della vista attiva in /admin/content/:slug.
 * Il valore memorizzato è un instance id. Non gestisce la pulizia se il seed
 * viene poi eliminato: la entry resta orfana in localStorage, inoffensiva,
 * finché non viene sovrascritta.
 */
const ACTIVE_VIEW_STORAGE_PREFIX = "beech_content_view_"

function getStoredActiveView(slug: string | undefined): string | null {
  if (!slug) return null
  return localStorage.getItem(`${ACTIVE_VIEW_STORAGE_PREFIX}${slug}`)
}

function setStoredActiveView(slug: string | undefined, viewId: string): void {
  if (!slug) return
  localStorage.setItem(`${ACTIVE_VIEW_STORAGE_PREFIX}${slug}`, viewId)
}

const EMPTY_VIEWS: ContentView[] = []

export function ContentListPage() {
  const { slug } = useParams<{ slug: string; id?: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { can } = usePermissions()
  const [searchParams] = useSearchParams()

  // Fetch the seed reactively
  const { seed, isLoading: isSeedLoading } = useActiveSeed(slug)

  const requestedViewId = searchParams.get("view")
  const viewsQuery = useContentViews(seed ? slug : undefined)
  const views = viewsQuery.data ?? EMPTY_VIEWS
  const createView = useCreateContentView(slug ?? "")
  const updateView = useUpdateContentView(slug ?? "")
  const deleteView = useDeleteContentView(slug ?? "")
  const reorderViews = useReorderContentViews(slug ?? "")
  const canManageViews = can("content:update", slug ?? "")

  const [selectedViewId, setSelectedViewId] = React.useState<string | null>(null)
  const [viewPendingDelete, setViewPendingDelete] = React.useState<ContentView | null>(null)
  const [emptyStateType, setEmptyStateType] = React.useState<DashboardView | null>(null)

  const activeViewId = React.useMemo(
    () => resolveActiveViewId(views, [selectedViewId, requestedViewId, getStoredActiveView(slug)]),
    [views, selectedViewId, requestedViewId, slug]
  )
  const activeView = views.find((view) => view.id === activeViewId)

  const handleChangeView = React.useCallback(
    (viewId: string) => {
      setSelectedViewId(viewId)
      setStoredActiveView(slug, viewId)
      setEmptyStateType(null)
    },
    [slug]
  )
  const handleReorderViews = React.useCallback(
    (ids: string[]) => reorderViews.mutate(ids),
    [reorderViews]
  )

  const typeLabel = React.useCallback(
    (type: DashboardView) => t(viewRegistry.get(type)?.labelKey ?? type),
    [t]
  )
  const switcherViews = React.useMemo<UserViewInstance[]>(
    () =>
      views.map((view) => ({
        id: view.id,
        label: view.title ?? typeLabel(view.type),
        type: view.type,
        enabledTools: viewRegistry.get(view.type)?.enabledTools ?? DEFAULT_ENABLED_TOOLS,
        settings: viewRegistry.get(view.type)?.settings ?? DEFAULT_VIEW_SETTINGS,
      })),
    [views, typeLabel]
  )
  const creatableViewTypes = React.useMemo(
    () => (seed && canManageViews ? resolveAuthorizedViews(seed) : []),
    [seed, canManageViews]
  )
  const tableViewCount = views.filter((view) => view.type === "table").length

  const handleCreateView = React.useCallback(
    (type: DashboardView) =>
      createView.mutate(
        { type },
        {
          onSuccess: (created) => handleChangeView(created.id),
          onError: () => toast.error(t("content.views.errors.createFailed")),
        }
      ),
    [createView, handleChangeView, t]
  )
  const handleRenameView = React.useCallback(
    (viewId: string, label: string) => updateView.mutate({ viewId, body: { title: label } }),
    [updateView]
  )
  const handleRequestDeleteView = React.useCallback(
    (viewId: string) => setViewPendingDelete(views.find((view) => view.id === viewId) ?? null),
    [views]
  )
  const handleConfirmDeleteView = React.useCallback(() => {
    if (!viewPendingDelete) return
    const wasActive = viewPendingDelete.id === activeViewId
    const isLastOfType = views.filter((view) => view.type === viewPendingDelete.type).length === 1
    const type = viewPendingDelete.type
    deleteView.mutate(viewPendingDelete.id, {
      onSuccess: () => {
        if (wasActive && isLastOfType && type !== "table") setEmptyStateType(type)
      },
      onError: (error) =>
        toast.error(
          viewProblemType(error) === "content-view-last-table"
            ? t("content.views.errors.lastTable")
            : t("content.views.errors.deleteFailed")
        ),
    })
    setViewPendingDelete(null)
  }, [deleteView, viewPendingDelete, activeViewId, views, t])

  // Show error if seed doesn't exist
  if (!seed && !isSeedLoading) {
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
                    <h2 className="font-heading text-lg font-semibold text-destructive">
                      Error
                    </h2>
                    <p className="text-sm text-destructive/90">
                      {`Seed "${slug}" not found`}
                    </p>
                  </div>
                </div>
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>
    )
  }

  // Loading skeleton while the seed or the views are fetching
  if (isSeedLoading || !seed || viewsQuery.isLoading) {
    return <PageShellLoading message="Loading configuration..." />
  }

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-w-0">
              <div className="content-area-inner">
                {/* Header with title */}
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h1 className="font-heading text-2xl font-semibold">{seed.labelPlural ?? seed.label}</h1>
                    <p className="text-muted-foreground text-sm">
                      Manage "{seed.slug}" content
                    </p>
                  </div>
                  {seed.softDelete === true && (
                    <Button variant="outline" size="sm" onClick={() => navigate(`/content/${slug}/trash`)}>
                      <Trash2 className="size-4" />
                      {t("content.trash.open")}
                    </Button>
                  )}
                </div>

                {viewsQuery.isError || (!activeView && !emptyStateType) ? (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <p className="text-sm text-destructive">{t("content.views.errors.loadFailed")}</p>
                  </div>
                ) : emptyStateType ? (
                  <>
                    <ToolbarStrip>
                      <ViewSwitcher
                        views={switcherViews}
                        activeViewId={null}
                        onChangeView={handleChangeView}
                        onCreateView={canManageViews ? handleCreateView : undefined}
                        creatableViewTypes={creatableViewTypes}
                        onReorderViews={canManageViews ? handleReorderViews : undefined}
                        onDeleteView={canManageViews ? handleRequestDeleteView : undefined}
                      />
                    </ToolbarStrip>
                    <ViewEmptyState
                      typeLabel={typeLabel(emptyStateType)}
                      onCreate={canManageViews ? () => handleCreateView(emptyStateType) : undefined}
                    />
                  </>
                ) : (
                  <ContentViewWorkspace
                    key={activeView!.id}
                    seed={seed}
                    slug={slug!}
                    view={activeView!}
                    switcherViews={switcherViews}
                    creatableViewTypes={creatableViewTypes}
                    canManageViews={canManageViews}
                    canDeleteView={canManageViews && !(activeView!.type === "table" && tableViewCount <= 1)}
                    onChangeView={handleChangeView}
                    onCreateView={canManageViews ? handleCreateView : undefined}
                    onRenameView={canManageViews ? handleRenameView : undefined}
                    onDeleteView={canManageViews ? handleRequestDeleteView : undefined}
                    onReorderViews={canManageViews ? handleReorderViews : undefined}
                  />
                )}
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <ConfirmDialog
        open={viewPendingDelete !== null}
        onOpenChange={(open) => { if (!open) setViewPendingDelete(null) }}
        title={t("content.views.deleteConfirmTitle")}
        description={t("content.views.deleteConfirmDescription", {
          label: viewPendingDelete ? (viewPendingDelete.title ?? typeLabel(viewPendingDelete.type)) : "",
        })}
        confirmVariant="destructive"
        onConfirm={handleConfirmDeleteView}
      />
    </div>
  )
}
