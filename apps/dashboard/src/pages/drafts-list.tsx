// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, Link } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import { it as itLocale, enUS, type Locale } from "date-fns/locale"
import type { ColumnDef, SortingState, VisibilityState } from "@tanstack/react-table"
import { MoreHorizontal } from "lucide-react"
import { toast } from "sonner"
import type { Seed } from "@beechcms/core"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar, SiteHeader } from "@/features/navigation"
import { DataTable } from "@/components/ui/data-table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  ContentToolbar,
  type UserViewInstance,
  type ToolbarFiltersState,
} from "@/features/content-toolbar"
import {
  useGlobalDrafts,
  usePublishDraft,
  useDiscardDraft,
  type DraftSummary,
} from "@/features/drafts"
import { useSchema } from "@/features/schema"
import { matchesFilterGroupStrict } from "@/lib/filter-dsl"

const DATE_FNS_LOCALE: Record<string, Locale> = { it: itLocale, en: enUS }

async function gravatarUrl(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase()
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized))
  const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  return `https://www.gravatar.com/avatar/${hex}?d=mp&s=40`
}

function UserCell({ name, email }: Readonly<{ name: string | null; email: string }>) {
  const [src, setSrc] = React.useState("")
  React.useEffect(() => {
    if (email) gravatarUrl(email).then(setSrc)
  }, [email])
  const displayName = name ?? email ?? "—"
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("")
  return (
    <div className="flex items-center gap-2">
      <Avatar size="sm">
        <AvatarImage src={src} alt={displayName} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <span>{displayName}</span>
    </div>
  )
}

function getDraftFieldValue(draft: DraftSummary, columnId: string): unknown {
  switch (columnId) {
    case "seedLabel": return draft.seedLabel
    case "title": return draft.title
    case "updatedAt": return new Date(draft.updatedAt * 1000).toISOString().slice(0, 10)
    case "lastModifiedBy": return draft.lastModifiedBy.name ?? draft.lastModifiedBy.email
    default: return undefined
  }
}

function SeedLabelCell({ row }: Readonly<{ row: { original: DraftSummary } }>) {
  return <Badge variant="outline">{row.original.seedLabel}</Badge>
}

function TitleCell({ row }: Readonly<{ row: { original: DraftSummary } }>) {
  return (
    <Link
      to={`/content/${row.original.seedSlug}/${row.original.id}`}
      state={{ isDraftContext: true }}
      className="font-medium hover:underline text-foreground decoration-primary/30"
    >
      {row.original.title}
    </Link>
  )
}

function LastModifiedByCell({ row }: Readonly<{ row: { original: DraftSummary } }>) {
  return (
    <UserCell
      name={row.original.lastModifiedBy.name}
      email={row.original.lastModifiedBy.email}
    />
  )
}

function ActionsCell({ row }: Readonly<{ row: { original: DraftSummary } }>) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const publishDraft = usePublishDraft()
  const discardDraft = useDiscardDraft()
  const [showDiscard, setShowDiscard] = React.useState(false)
  const { seedSlug, id } = row.original

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">{t("common.openMenu")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/content/${seedSlug}/${id}`, { state: { isDraftContext: true } })}>
            {t("drafts.actions.edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async () => {
              try {
                await publishDraft.mutateAsync({ slug: seedSlug, id })
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
            onClick={() => setShowDiscard(true)}
          >
            {t("drafts.actions.discard")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("drafts.actions.discard")}</AlertDialogTitle>
            <AlertDialogDescription>{t("drafts.discardConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                try {
                  await discardDraft.mutateAsync({ slug: seedSlug, id })
                  toast.success(t("drafts.discarded"))
                } catch {
                  toast.error(t("drafts.error"))
                } finally {
                  setShowDiscard(false)
                }
              }}
            >
              {t("drafts.actions.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function DraftsListPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const dateFnsLocale = DATE_FNS_LOCALE[i18n.language] ?? enUS

  const { data, isLoading, isError, refetch } = useGlobalDrafts()
  const { data: seeds } = useSchema()

  const [tableSearch, setTableSearch] = React.useState("")
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [toolbarFilters, setToolbarFilters] = React.useState<ToolbarFiltersState>({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [seedPickerOpen, setSeedPickerOpen] = React.useState(false)

  const draftSeeds = React.useMemo(
    () => (seeds ?? []).filter((s) => s.allowDrafts),
    [seeds]
  )

  const seedLabelOptions = React.useMemo(
    () => Array.from(new Set((data ?? []).map((d) => d.seedLabel))).sort((a, b) => a.localeCompare(b)),
    [data]
  )

  const virtualSeed = React.useMemo<Seed>(() => ({
    slug: "__drafts__",
    label: t("drafts.title"),
    labelPlural: t("drafts.title"),
    branches: [
      {
        alias: "seedLabel",
        label: t("drafts.columns.seed"),
        type: "text",
        options: seedLabelOptions,
        policies: { sort: true, filter: true },
      },
      {
        alias: "title",
        label: t("drafts.columns.name"),
        type: "text",
        policies: { sort: true, filter: true },
      },
      {
        alias: "updatedAt",
        label: t("drafts.columns.updatedAt"),
        type: "date",
        format: "date",
        policies: { sort: true, filter: true },
      },
      {
        alias: "lastModifiedBy",
        label: t("drafts.columns.user"),
        type: "text",
        policies: { sort: true, filter: true },
      },
    ],
    displayNameAlias: "title",
  }), [t, seedLabelOptions])

  const views = React.useMemo<UserViewInstance[]>(() => [{
    id: "table",
    label: t("content.list.table"),
    type: "table",
    enabledTools: ["filter", "sort", "search", "settings", "create"],
    conditionalFormats: [],
  }], [t])

  const handleCreate = React.useCallback(() => {
    if (draftSeeds.length === 1) {
      navigate(`/content/${draftSeeds[0].slug}/create`)
    } else {
      setSeedPickerOpen(true)
    }
  }, [draftSeeds, navigate])

  const filteredData = React.useMemo<DraftSummary[]>(() => {
    let rows = data ?? []

    if (tableSearch.trim()) {
      const q = tableSearch.trim().toLowerCase()
      rows = rows.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.seedLabel.toLowerCase().includes(q) ||
          (d.lastModifiedBy.name ?? "").toLowerCase().includes(q) ||
          d.lastModifiedBy.email.toLowerCase().includes(q)
      )
    }

    for (const [columnId, group] of Object.entries(toolbarFilters)) {
      if (!group.conditions.length) continue
      rows = rows.filter((d) => {
        const value = getDraftFieldValue(d, columnId)
        return matchesFilterGroupStrict(value, group)
      })
    }

    if (sorting.length > 0) {
      const { id, desc } = sorting[0]
      rows = [...rows].sort((a, b) => {
        const av = getDraftFieldValue(a, id)
        const bv = getDraftFieldValue(b, id)
        const cmp =
          typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av as string | undefined ?? "").localeCompare(String(bv as string | undefined ?? ""))
        return desc ? -cmp : cmp
      })
    }

    return rows
  }, [data, tableSearch, toolbarFilters, sorting])

  const columns = React.useMemo<ColumnDef<DraftSummary>[]>(() => [
    {
      id: "seedLabel",
      header: t("drafts.columns.seed"),
      cell: SeedLabelCell,
    },
    {
      id: "title",
      header: t("drafts.columns.name"),
      cell: TitleCell,
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
      cell: LastModifiedByCell,
    },
    {
      id: "actions",
      header: "",
      cell: ActionsCell,
    },
  ], [t, dateFnsLocale])

  const singleSort = sorting[0]

  return (
    <div className="[--header-height:calc(--spacing(14))] overflow-x-clip">
      <SidebarProvider className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-w-0">
              <div className="content-area-inner">
                <div className="mb-6">
                  <h1 className="text-2xl font-semibold">{t("drafts.title")}</h1>
                  <p className="text-muted-foreground text-sm">{t("drafts.subtitle")}</p>
                </div>

                <ContentToolbar
                  seed={virtualSeed}
                  views={views}
                  activeViewId="table"
                  onChangeView={() => void 0}
                  onCreate={handleCreate}
                  searchValue={tableSearch}
                  onSearchChange={setTableSearch}
                  sortState={{
                    columnId: singleSort?.id ?? null,
                    desc: singleSort?.desc ?? false,
                  }}
                  onSortChange={(state) => {
                    if (state.columnId) {
                      setSorting([{ id: state.columnId, desc: state.desc }])
                    } else {
                      setSorting([])
                    }
                  }}
                  filters={toolbarFilters}
                  onFiltersChange={setToolbarFilters}
                  columnVisibility={columnVisibility}
                  onColumnVisibilityChange={setColumnVisibility}
                >
                  {isError && (
                    <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                      <p>{t("common.error")}</p>
                      <Button variant="outline" size="sm" onClick={() => refetch()}>
                        {t("common.retry")}
                      </Button>
                    </div>
                  )}

                  {!isError && !isLoading && (
                    <DataTable
                      columns={columns}
                      data={filteredData}
                      manualSorting
                      manualFiltering
                      sorting={sorting}
                      onSortingChange={setSorting}
                      columnVisibility={columnVisibility}
                      onColumnVisibilityChange={setColumnVisibility}
                      globalFilter={tableSearch}
                      onGlobalFilterChange={setTableSearch}
                    />
                  )}

                  {!isError && isLoading && (
                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                      {t("common.loading")}
                    </div>
                  )}
                </ContentToolbar>
              </div>
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <Dialog open={seedPickerOpen} onOpenChange={setSeedPickerOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("drafts.selectType")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1 pt-2">
            {draftSeeds.map((seed) => (
              <Button
                key={seed.slug}
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  setSeedPickerOpen(false)
                  navigate(`/content/${seed.slug}/create`)
                }}
              >
                {seed.labelPlural ?? seed.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
