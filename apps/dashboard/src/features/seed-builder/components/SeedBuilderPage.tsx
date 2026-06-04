// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useSchema } from "@/features/schema"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useSeeds } from "../hooks/use-seeds"
import { SeedEditorDialog } from "./SeedEditorDialog"
import { DeleteSeedDialog } from "./DeleteSeedDialog"
import type { SeedRecordDTO } from "../api/seeds.api"
import type { Seed } from "@beechcms/core"

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
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("seedBuilder.page.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("seedBuilder.page.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch()} title={t("common.retry")}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
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

      <div className="rounded-md border">
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
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                  {t("common.loading")}
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isAdmin ? 6 : 5} className="text-center text-muted-foreground py-8">
                  {t("common.noResults")}
                </TableCell>
              </TableRow>
            ) : (
              visible.map(record => (
                <TableRow
                  key={record.slug}
                  className={record.status === "deleted" ? "opacity-50" : undefined}
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
                          size="sm"
                          onClick={() => setEditRecord(record)}
                          disabled={record.status === "deleted"}
                          aria-label={t("common.edit")}
                          data-testid="edit-seed-btn"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteRecord(record)}
                          disabled={record.status === "deleted"}
                          aria-label={t("common.delete")}
                          data-testid="delete-seed-btn"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SeedEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        activeSeedsForRelation={activeSeeds as Seed[]}
      />

      <SeedEditorDialog
        open={!!editRecord}
        onOpenChange={open => { if (!open) setEditRecord(null) }}
        editRecord={editRecord}
        activeSeedsForRelation={activeSeeds as Seed[]}
      />

      <DeleteSeedDialog
        seed={deleteRecord}
        open={!!deleteRecord}
        onOpenChange={open => { if (!open) setDeleteRecord(null) }}
      />
    </div>
  )
}
