// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { cn } from "@/lib/utils"
import { useSchema } from "@/features/shared"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { ROW_HEIGHT_PX } from "@/components/ui/data-table"
import { useSeeds } from "../hooks/use-seeds"
import { useSeedEditorDialog } from "../hooks/use-seed-editor-dialog"
import { DeleteSeedDialog } from "./DeleteSeedDialog"
import { SchemaFormShell } from "@/features/entry-editor"
import type { SeedRecordDTO } from "../api/seeds.api"
import type { Seed } from "@beechcms/core"

interface SeedFormDialogProps {
  open: boolean
  editRecord: SeedRecordDTO | null
  activeSeedsForRelation: Seed[]
  onClose: () => void
}

// Adapter: SchemaFormShell is a controlled dialog driven by a view-model.
// The hook must always run (stable hook order) â€” `open` only gates the shell.
function SeedFormDialog({ open, editRecord, activeSeedsForRelation, onClose }: SeedFormDialogProps) {
  const vm = useSeedEditorDialog({ editRecord, activeSeedsForRelation, onClose })
  return <SchemaFormShell vm={vm} open={open} />
}

export function SeedBuilderPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"

  const { data: records = [], isLoading, refetch } = useSeeds()
  const { data: activeSeeds = [] } = useSchema()

  const [showDeleted, setShowDeleted] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<SeedRecordDTO | null>(null)
  const [deleteRecord, setDeleteRecord] = useState<SeedRecordDTO | null>(null)

  const visible = showDeleted ? records : records.filter(r => r.status !== "deleted")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t("seedBuilder.page.subtitle")}</p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => refetch()} title={t("common.retry")}>
            <RefreshCw className="size-4" />
          </Button>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)} size="sm" className="gap-1.5">
              <Plus className="size-4" />
              {t("seedBuilder.page.newButton")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="show-deleted"
          checked={showDeleted}
          onCheckedChange={setShowDeleted}
        />
        <Label htmlFor="show-deleted" className="cursor-pointer text-sm">
          {t("seedBuilder.page.showDeleted")}
        </Label>
      </div>

      <div className="w-full">
        <div className="rounded-md border">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("seedBuilder.table.label")}</TableHead>
                  <TableHead>{t("seedBuilder.table.slug")}</TableHead>
                  <TableHead>{t("seedBuilder.table.branches")}</TableHead>
                  <TableHead>{t("seedBuilder.table.source")}</TableHead>
                  <TableHead>{t("seedBuilder.table.status")}</TableHead>
                  {isAdmin && <TableHead className="w-20">{t("seedBuilder.table.actions")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow style={{ height: ROW_HEIGHT_PX }}>
                    <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                      {t("common.loading")}
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow style={{ height: ROW_HEIGHT_PX }}>
                    <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                      {t("common.noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map(record => (
                    <TableRow
                      key={record.slug}
                      className={cn("transition-colors", record.status === "deleted" && "opacity-50")}
                      style={{ height: ROW_HEIGHT_PX }}
                    >
                      <TableCell className="font-medium">
                        {record.definition.label}
                        {record.status === "deleted" && (
                          <Badge variant="destructive" className="ml-2 text-xs">{t("seedBuilder.table.deleted")}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">{record.slug}</code>
                      </TableCell>
                      <TableCell>{record.definition.branches?.length ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={record.source === "code" ? "secondary" : "default"} className="text-xs">
                          {record.source === "code"
                            ? t("seedBuilder.table.sourceCode")
                            : t("seedBuilder.table.sourceRuntime")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={record.status === "active" ? "outline" : "destructive"}
                          className="text-xs"
                        >
                          {record.status === "active"
                            ? t("seedBuilder.table.statusActive")
                            : t("seedBuilder.table.statusDeleted")}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setEditRecord(record)}
                              disabled={record.status === "deleted"}
                              aria-label={t("common.edit")}
                              data-testid="edit-seed-btn"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setDeleteRecord(record)}
                              disabled={record.status === "deleted"}
                              aria-label={t("common.delete")}
                              data-testid="delete-seed-btn"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      <SeedFormDialog
        open={createOpen}
        editRecord={null}
        activeSeedsForRelation={activeSeeds as Seed[]}
        onClose={() => setCreateOpen(false)}
      />

      <SeedFormDialog
        open={!!editRecord}
        editRecord={editRecord}
        activeSeedsForRelation={activeSeeds as Seed[]}
        onClose={() => setEditRecord(null)}
      />

      <DeleteSeedDialog
        seed={deleteRecord}
        open={!!deleteRecord}
        onOpenChange={open => { if (!open) setDeleteRecord(null) }}
      />
    </div>
  )
}
