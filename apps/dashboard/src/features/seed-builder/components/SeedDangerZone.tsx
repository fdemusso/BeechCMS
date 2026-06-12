// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { RefreshCw, Trash2, AlertTriangle } from "lucide-react"
import type { Branch, BranchType } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  useHardDeleteSeed,
  useDropBranch,
  useRenameBranch,
  useRetypeBranch,
  useRebuildFts,
  useOrphans,
} from "../hooks/use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"

const BRANCH_TYPES: BranchType[] = [
  "text", "richtext", "number", "boolean", "date", "json", "tags", "file", "relation",
]

// ─── Sub-section: Hard delete ─────────────────────────────────────────────────

function HardDeleteSection({ record, onDeleted }: { record: SeedRecordDTO; onDeleted: () => void }) {
  const { t } = useTranslation()
  const [confirm, setConfirm] = React.useState("")
  const hardDelete = useHardDeleteSeed()

  async function handleHardDelete() {
    try {
      await hardDelete.mutateAsync({ slug: record.slug, confirm })
      toast.success(t("seedBuilder.dangerZone.hardDelete.successToast", { slug: record.slug }))
      onDeleted()
    } catch { /* hook surfaces the error toast */ }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{t("seedBuilder.dangerZone.hardDelete.title")}</p>
      <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.hardDelete.description")}</p>
      <Label className="text-xs">
        {t("seedBuilder.dangerZone.hardDelete.confirmLabel", { slug: record.slug })}
      </Label>
      <div className="flex gap-2">
        <Input
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder={t("seedBuilder.dangerZone.hardDelete.confirmPlaceholder")}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={confirm !== record.slug || hardDelete.isPending}
          onClick={handleHardDelete}
        >
          <Trash2 className="mr-1 size-3.5" />
          {t("seedBuilder.dangerZone.hardDelete.button")}
        </Button>
      </div>
    </div>
  )
}

// ─── Sub-section: FTS Rebuild ─────────────────────────────────────────────────

function FtsRebuildSection({ slug }: { slug: string }) {
  const { t } = useTranslation()
  const rebuildFts = useRebuildFts(slug)

  async function handleRebuild() {
    try {
      await rebuildFts.mutateAsync()
      toast.success(t("seedBuilder.dangerZone.ftsRebuild.successToast"))
    } catch { /* hook */ }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("seedBuilder.dangerZone.ftsRebuild.title")}</p>
      <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.ftsRebuild.description")}</p>
      <Button type="button" variant="outline" size="sm" onClick={handleRebuild} disabled={rebuildFts.isPending}>
        <RefreshCw className={`mr-1 size-3.5 ${rebuildFts.isPending ? "animate-spin" : ""}`} />
        {t("seedBuilder.dangerZone.ftsRebuild.button")}
      </Button>
    </div>
  )
}

// ─── Sub-section: Orphans ─────────────────────────────────────────────────────

function OrphansSection({ record }: { record: SeedRecordDTO }) {
  const { t } = useTranslation()
  const { data, refetch, isFetching } = useOrphans(record.slug)
  const dropBranch = useDropBranch()
  const [confirms, setConfirms] = React.useState<Record<string, string>>({})

  const orphans = data?.orphans ?? []

  async function handleDrop(col: string) {
    const expected = `${record.slug}.${col}`
    if (confirms[col] !== expected) return
    try {
      // Use branch id "orphan" — the API resolves by alias for orphan drops.
      await dropBranch.mutateAsync({ slug: record.slug, branchId: "_orphan_", confirm: expected })
      toast.success(t("seedBuilder.dangerZone.dropColumn.successToast", { alias: col }))
      refetch()
    } catch { /* hook */ }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium flex-1">{t("seedBuilder.dangerZone.orphans.title")}</p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching} title={t("seedBuilder.dangerZone.orphans.refreshButton")}>
          <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.orphans.description")}</p>
      {orphans.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{t("seedBuilder.dangerZone.orphans.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {orphans.map(col => (
            <li key={col} className="flex items-center gap-2">
              <code className="text-xs bg-muted px-1 py-0.5 rounded flex-1">{col}</code>
              <Input
                value={confirms[col] ?? ""}
                onChange={e => setConfirms(prev => ({ ...prev, [col]: e.target.value }))}
                placeholder={`${record.slug}.${col}`}
                className="font-mono text-xs w-40"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={confirms[col] !== `${record.slug}.${col}` || dropBranch.isPending}
                onClick={() => handleDrop(col)}
              >
                {t("seedBuilder.dangerZone.orphans.dropButton")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Sub-section: Per-field destructive ops ───────────────────────────────────

function FieldDangerRow({ branch, slug }: { branch: Branch; slug: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [confirm, setConfirm] = React.useState("")
  const [newAlias, setNewAlias] = React.useState("")
  const [newType, setNewType] = React.useState<BranchType>(branch.type as BranchType)
  const [mode, setMode] = React.useState<"rename" | "retype" | "drop" | null>(null)

  const renameBranch = useRenameBranch()
  const retypeBranch = useRetypeBranch()
  const dropBranch = useDropBranch()

  const expected = `${slug}.${branch.alias}`

  async function execute() {
    try {
      if (mode === "rename") {
        const res = await renameBranch.mutateAsync({ slug, branchId: branch.id, newAlias, confirm })
        toast.success(t("seedBuilder.dangerZone.renameAlias.successToast", { newAlias }))
        if (res.affectedAutomations?.length > 0) {
          toast.warning(t("seedBuilder.dangerZone.renameAlias.automationWarning", {
            count: res.affectedAutomations.length,
            ids: res.affectedAutomations.join(", "),
          }))
        }
      } else if (mode === "retype") {
        await retypeBranch.mutateAsync({ slug, branchId: branch.id, newType, confirm })
        toast.success(t("seedBuilder.dangerZone.retypeField.successToast", { alias: branch.alias, newType }))
      } else if (mode === "drop") {
        await dropBranch.mutateAsync({ slug, branchId: branch.id, confirm })
        toast.success(t("seedBuilder.dangerZone.dropColumn.successToast", { alias: branch.alias }))
      }
      setOpen(false)
      setConfirm("")
    } catch { /* hook */ }
  }

  const isBusy = renameBranch.isPending || retypeBranch.isPending || dropBranch.isPending
  const isValid = confirm === expected && (mode !== "rename" || (newAlias.length > 0 && /^[a-z0-9_]+$/.test(newAlias)))

  return (
    <div className="rounded border bg-background text-xs">
      <div className="flex items-center gap-2 p-2">
        <code className="font-mono flex-1">{branch.alias}</code>
        <span className="text-muted-foreground">{branch.type}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
          {t("seedBuilder.dangerZone.branchDangerToggle")}
        </Button>
      </div>

      {open && (
        <div className="border-t p-3 space-y-3">
          <div className="flex gap-2">
            <Button type="button" variant={mode === "rename" ? "secondary" : "outline"} size="sm" onClick={() => setMode("rename")}>
              {t("seedBuilder.dangerZone.renameAlias.button")}
            </Button>
            <Button type="button" variant={mode === "retype" ? "secondary" : "outline"} size="sm" onClick={() => setMode("retype")}>
              {t("seedBuilder.dangerZone.retypeField.button")}
            </Button>
            <Button type="button" variant={mode === "drop" ? "destructive" : "outline"} size="sm" onClick={() => setMode("drop")}>
              {t("seedBuilder.dangerZone.dropColumn.button")}
            </Button>
          </div>

          {mode && (
            <div className="space-y-2">
              {mode === "rename" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("seedBuilder.dangerZone.renameAlias.newAliasLabel")}</Label>
                  <Input
                    value={newAlias}
                    onChange={e => setNewAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder={t("seedBuilder.dangerZone.renameAlias.newAliasPlaceholder")}
                    className="font-mono"
                  />
                </div>
              )}

              {mode === "retype" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("seedBuilder.dangerZone.retypeField.newTypeLabel")}</Label>
                  <Select value={newType} onValueChange={v => setNewType(v as BranchType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BRANCH_TYPES.map(bt => (
                        <SelectItem key={bt} value={bt}>{t(`seedBuilder.fieldTypes.${bt}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">{expected}</Label>
                <Input
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={mode === "drop"
                    ? t("seedBuilder.dangerZone.dropColumn.confirmPlaceholder")
                    : mode === "rename"
                      ? t("seedBuilder.dangerZone.renameAlias.confirmPlaceholder")
                      : t("seedBuilder.dangerZone.retypeField.confirmPlaceholder")}
                  className="font-mono"
                />
              </div>

              <Button
                type="button"
                variant={mode === "drop" ? "destructive" : "default"}
                size="sm"
                disabled={!isValid || isBusy}
                onClick={execute}
              >
                {mode === "rename" && t("seedBuilder.dangerZone.renameAlias.button")}
                {mode === "retype" && t("seedBuilder.dangerZone.retypeField.button")}
                {mode === "drop" && t("seedBuilder.dangerZone.dropColumn.button")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface SeedDangerZoneProps {
  record: SeedRecordDTO
  onClose: () => void
}

export function SeedDangerZone({ record, onClose }: SeedDangerZoneProps) {
  const { t } = useTranslation()

  const existingBranches = record.definition.branches.filter(
    b => !b.id.startsWith("br_new_")
  )

  return (
    <div
      className="rounded-lg border border-destructive bg-destructive/5 p-4 space-y-6"
      data-testid="seed-danger-zone"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-destructive" />
        <span className="font-semibold text-destructive text-sm">{t("seedBuilder.dangerZone.title")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.subtitle")}</p>

      <Separator />

      <HardDeleteSection record={record} onDeleted={onClose} />

      <Separator />

      <FtsRebuildSection slug={record.slug} />

      <Separator />

      <OrphansSection record={record} />

      {existingBranches.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("seedBuilder.editor.tabFields")}</p>
            {existingBranches.map(b => (
              <FieldDangerRow key={b.id} branch={b} slug={record.slug} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
