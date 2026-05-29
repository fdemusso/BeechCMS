// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, Link } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import { it as itLocale, enUS, type Locale } from "date-fns/locale"
import type { ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { DataTable } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  useGlobalDrafts,
  usePublishDraft,
  useDiscardDraft,
  type DraftSummary,
} from "@/features/drafts"

const DATE_FNS_LOCALE: Record<string, Locale> = { it: itLocale, en: enUS }

export function DraftsListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dateFnsLocale = DATE_FNS_LOCALE[i18n.language] ?? enUS

  const { data, isLoading, isError, refetch } = useGlobalDrafts()
  const publishDraft = usePublishDraft()
  const discardDraft = useDiscardDraft()

  const [discardTarget, setDiscardTarget] = React.useState<{ seedSlug: string; id: string } | null>(null)

  const columns = React.useMemo<ColumnDef<DraftSummary>[]>(() => [
    {
      id: "seedLabel",
      header: t("drafts.columns.seed"),
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.seedLabel}</Badge>
      ),
    },
    {
      id: "title",
      header: t("drafts.columns.name"),
      cell: ({ row }) => (
        <Link
          to={`/content/${row.original.seedSlug}/${row.original.id}`}
          className="font-medium hover:underline text-foreground decoration-primary/30"
        >
          {row.original.title}
        </Link>
      ),
    },
    {
      id: "updatedAt",
      header: t("drafts.columns.updatedAt"),
      cell: ({ row }) =>
        formatDistanceToNow(new Date(row.original.updatedAt * 1000), {
          addSuffix: true,
          locale: dateFnsLocale,
        }),
    },
    {
      id: "lastModifiedBy",
      header: t("drafts.columns.user"),
      cell: ({ row }) => {
        const { name, email } = row.original.lastModifiedBy
        return (
          <span title={name ? email : undefined}>
            {name ?? email ?? "—"}
          </span>
        )
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const { seedSlug, id } = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">{t("common.openMenu")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/content/${seedSlug}/${id}`)}>
                {t("drafts.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  try {
                    await publishDraft.mutateAsync({ seedSlug, id })
                    toast.success(t("drafts.published"))
                  } catch {
                    toast.error(t("drafts.error"))
                  }
                }}
              >
                {t("drafts.actions.publish")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDiscardTarget({ seedSlug, id })}
              >
                {t("drafts.actions.discard")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [t, dateFnsLocale, navigate, publishDraft])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-col gap-4 p-4 pt-0">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">{t("drafts.title")}</h1>
            <p className="text-muted-foreground text-sm">{t("drafts.subtitle")}</p>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
              <p>{t("common.error")}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("common.retry")}
              </Button>
            </div>
          )}

          {!isLoading && !isError && data?.length === 0 && (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              {t("drafts.empty")}
            </div>
          )}

          {!isLoading && !isError && !!data?.length && (
            <DataTable
              columns={columns}
              data={data}
            />
          )}
        </div>

        <AlertDialog open={!!discardTarget} onOpenChange={(open) => { if (!open) setDiscardTarget(null) }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("drafts.actions.discard")}</AlertDialogTitle>
              <AlertDialogDescription>{t("drafts.discardConfirm")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!discardTarget) return
                  try {
                    await discardDraft.mutateAsync(discardTarget)
                    toast.success(t("drafts.discarded"))
                  } catch {
                    toast.error(t("drafts.error"))
                  } finally {
                    setDiscardTarget(null)
                  }
                }}
              >
                {t("drafts.actions.discard")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  )
}
