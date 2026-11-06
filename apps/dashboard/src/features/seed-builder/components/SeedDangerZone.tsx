// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import type { Branch, BranchType } from "@beechcms/core"
import { AlertTriangle, Refresh } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { IconBadgeGroup } from "@/components/ui/icon-badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useDropBranch, useDropOrphan, useOrphans, useRebuildFts, useRenameBranch, useRetypeBranch } from "../hooks/use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"
import { fieldBadges } from "../lib/field-badges"
import { FIELD_TYPE_ICONS } from "../lib/field-types"

/** What a retype can target: a relation needs a target seed and a repeater needs sub-fields, neither of which a retype carries. */
const RETYPE_TARGETS: BranchType[] = ["text", "richtext", "number", "boolean", "date", "json", "tags", "file"]

type Operation = "rename" | "retype" | "drop"

/** Mirrors the server's refusals, so an operation that would fail is disabled with the reason instead. */
function blockedReasons(branch: Branch, displayNameAlias: string, t: (key: string) => string) {
  const reasons: Partial<Record<Operation, string>> = {}
  if (branch.alias === displayNameAlias) reasons.drop = t("seedBuilder.dangerZone.blocked.displayName")
  if (branch.type === "repeater") reasons.retype = t("seedBuilder.dangerZone.blocked.repeater")
  else if (branch.type === "relation" && branch.multiple === true) reasons.retype = t("seedBuilder.dangerZone.blocked.multiRelation")
  else if (branch.localized === true) reasons.retype = t("seedBuilder.dangerZone.blocked.localized")
  return reasons
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

function MaintenanceSection({ record, manifestOwned }: { record: SeedRecordDTO; manifestOwned: boolean }) {
  const { t } = useTranslation()
  const rebuildFts = useRebuildFts(record.slug)
  const { data, refetch, isFetching } = useOrphans(record.slug)
  const dropOrphan = useDropOrphan()
  const [open, setOpen] = React.useState(false)
  const [confirms, setConfirms] = React.useState<Record<string, string>>({})
  const orphans = data?.orphans ?? []

  async function handleRebuild() {
    try {
      await rebuildFts.mutateAsync()
      toast.success(t("seedBuilder.dangerZone.ftsRebuild.successToast"))
    } catch { /* the hook shows the error toast */ }
  }

  async function handleDrop(column: string) {
    const expected = `${record.slug}.${column}`
    if (confirms[column] !== expected) return
    try {
      await dropOrphan.mutateAsync({ slug: record.slug, column, confirm: expected })
      toast.success(t("seedBuilder.dangerZone.orphans.successToast", { column }))
      void refetch()
    } catch { /* the hook shows the error toast */ }
  }

  return (
    <section className="space-y-2">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("seedBuilder.dangerZone.maintenance.title")}
          <Badge variant="outline" className="normal-case tracking-normal">{t("seedBuilder.dangerZone.maintenance.badge")}</Badge>
        </h3>
        <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.maintenance.subtitle")}</p>
      </header>

      {/* Two columns: the text, and the actions. `auto` takes the widest action, and `subgrid` lets every row share it, so the
          buttons stack at one natural width. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] divide-y rounded-lg border">
        <div className="col-span-full grid grid-cols-subgrid items-center gap-x-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{t("seedBuilder.dangerZone.ftsRebuild.title")}</p>
            <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.ftsRebuild.description")}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleRebuild} disabled={rebuildFts.isPending} className="w-full whitespace-nowrap">
            <Refresh className={cn("size-3.5", rebuildFts.isPending && "animate-spin")} />
            {t("seedBuilder.dangerZone.ftsRebuild.button")}
          </Button>
        </div>

        <div className="col-span-full grid grid-cols-subgrid">
          <div className="col-span-full grid grid-cols-subgrid items-center gap-x-3 p-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium">
                {t("seedBuilder.dangerZone.orphans.title")}
                <Badge variant="secondary">{orphans.length}</Badge>
              </p>
              <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.orphans.description")}</p>
            </div>
            <ButtonGroup className="w-full">
              <Button type="button" variant="outline" size="icon-sm" onClick={() => void refetch()} disabled={isFetching} title={t("seedBuilder.dangerZone.orphans.refreshButton")} aria-label={t("seedBuilder.dangerZone.orphans.refreshButton")}>
                <Refresh className={cn("size-3.5", isFetching && "animate-spin")} />
              </Button>
              {/* The width is always that of "Review": the invisible label sizes the button, the current one sits over it. */}
              <Button type="button" variant="outline" size="sm" className="relative flex-1 whitespace-nowrap" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                <span className="invisible" aria-hidden>{t("seedBuilder.dangerZone.orphans.review")}</span>
                <span className="absolute inset-0 flex items-center justify-center">
                  {open ? t("seedBuilder.dangerZone.orphans.hide") : t("seedBuilder.dangerZone.orphans.review")}
                </span>
              </Button>
            </ButtonGroup>
          </div>

          {open && (
            <div className="col-span-full space-y-2 border-t bg-muted/30 p-3">
              {orphans.length === 0 ? (
                <p className="text-xs italic text-muted-foreground">{t("seedBuilder.dangerZone.orphans.empty")}</p>
              ) : (
                orphans.map((column) => (
                  <div key={column} className="flex items-center gap-2">
                    <code className="flex-1 text-xs">{column}</code>
                    <Input
                      value={confirms[column] ?? ""}
                      onChange={(e) => setConfirms((prev) => ({ ...prev, [column]: e.target.value }))}
                      placeholder={`${record.slug}.${column}`}
                      className="w-52 font-mono text-xs"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={manifestOwned || confirms[column] !== `${record.slug}.${column}` || dropOrphan.isPending}
                      onClick={() => void handleDrop(column)}
                    >
                      {t("seedBuilder.dangerZone.orphans.dropButton")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Field operations ─────────────────────────────────────────────────────────

function FieldOperations({ record, disabled }: { record: SeedRecordDTO; disabled: boolean }) {
  const { t } = useTranslation()
  const slug = record.slug
  // A field added in the Fields tab and not saved yet has no column: there is nothing to operate on.
  const branches = record.definition.branches.filter((b) => !b.id.startsWith("br_new_"))
  const [selectedId, setSelectedId] = React.useState<string | null>(branches[0]?.id ?? null)
  const selected = branches.find((b) => b.id === selectedId) ?? branches[0] ?? null

  return (
    <section className={cn("space-y-2", disabled && "pointer-events-none opacity-50")} aria-disabled={disabled}>
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("seedBuilder.dangerZone.fieldOps.title")}
          <Badge variant="outline" className="border-amber-500/50 normal-case tracking-normal text-amber-500">
            {t("seedBuilder.dangerZone.fieldOps.badge")}
          </Badge>
        </h3>
        <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.fieldOps.subtitle")}</p>
      </header>

      {branches.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {t("seedBuilder.dangerZone.fieldOps.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          {/* Four rows are visible (3.375rem each, 0.375rem apart, plus the 0.5rem of padding): that is what lets the whole tab fit the
              dialog without scrolling the page. The rest of the list scrolls. */}
          <ScrollArea className="-m-1 max-h-[15.125rem] self-start">
            <div className="space-y-1.5 p-1 pr-3" role="listbox" aria-label={t("seedBuilder.dangerZone.fieldOps.title")}>
              {branches.map((branch) => {
                const Icon = FIELD_TYPE_ICONS[branch.type]
                const active = branch.id === selected?.id
                return (
                  <button
                    key={branch.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(branch.id)}
                    className={cn(
                      "flex h-[3.375rem] w-full items-center gap-3 rounded-control border bg-card px-3 text-left transition-colors",
                      active ? "border-primary/60 bg-accent" : "hover:bg-accent/60"
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{branch.label}</span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">{branch.alias}</span>
                    </span>
                    <IconBadgeGroup items={fieldBadges(branch, t)} moreLabel={(count) => t("rbac.roles.moreRoles", "+{{count}} more", { count })} />
                  </button>
                )
              })}
            </div>
          </ScrollArea>

          {selected && <FieldOperationPanel key={selected.id} branch={selected} slug={slug} displayNameAlias={record.definition.displayNameAlias} />}
        </div>
      )}
    </section>
  )
}

function FieldOperationPanel({ branch, slug, displayNameAlias }: { branch: Branch; slug: string; displayNameAlias: string }) {
  const { t } = useTranslation()
  const renameBranch = useRenameBranch()
  const retypeBranch = useRetypeBranch()
  const dropBranch = useDropBranch()
  const [mode, setMode] = React.useState<Operation>("rename")
  const [newAlias, setNewAlias] = React.useState("")
  const [newType, setNewType] = React.useState<BranchType>(branch.type)
  const [confirm, setConfirm] = React.useState("")

  const expected = `${slug}.${branch.alias}`
  const blocked = blockedReasons(branch, displayNameAlias, t)
  const busy = renameBranch.isPending || retypeBranch.isPending || dropBranch.isPending

  async function run() {
    try {
      if (mode === "rename") {
        const res = await renameBranch.mutateAsync({ slug, branchId: branch.id, newAlias, confirm: expected })
        toast.success(t("seedBuilder.dangerZone.rename.successToast", { alias: branch.alias, newAlias }))
        if (res.affectedAutomations?.length > 0) {
          toast.warning(t("seedBuilder.dangerZone.rename.automationWarning", {
            count: res.affectedAutomations.length,
            ids: res.affectedAutomations.join(", "),
          }))
        }
      } else if (mode === "retype") {
        await retypeBranch.mutateAsync({ slug, branchId: branch.id, newType, confirm: expected })
        toast.success(t("seedBuilder.dangerZone.retype.successToast", { alias: branch.alias, newType: t(`seedBuilder.fieldTypes.${newType}`) }))
      } else {
        await dropBranch.mutateAsync({ slug, branchId: branch.id, confirm: expected })
        toast.success(t("seedBuilder.dangerZone.dropField.successToast", { alias: branch.alias }))
      }
    } catch { /* the hook shows the error toast */ }
  }

  const segment = (op: Operation, label: string) => (
    <button
      key={op}
      type="button"
      role="tab"
      aria-selected={mode === op}
      disabled={blocked[op] !== undefined}
      onClick={() => setMode(op)}
      className={cn(
        "flex-1 border-l px-3 py-1.5 text-sm text-muted-foreground transition-colors first:border-l-0 disabled:cursor-not-allowed disabled:opacity-40",
        mode === op && "bg-accent text-foreground",
        mode === op && op === "drop" && "bg-destructive/15 text-destructive"
      )}
    >
      {label}
    </button>
  )

  const effectiveMode = blocked[mode] ? "rename" : mode
  const canRun =
    !busy &&
    (effectiveMode === "rename"
      ? /^[a-z][a-z0-9_]*$/.test(newAlias) && newAlias !== branch.alias
      : effectiveMode === "retype"
        ? newType !== branch.type
        : confirm === expected)
  const buttonKey = effectiveMode === "drop" ? "dropField" : effectiveMode

  const runButton = (
    <Button
      type="button"
      variant={effectiveMode === "drop" ? "destructive" : "default"}
      disabled={!canRun}
      onClick={() => void run()}
      className="shrink-0"
    >
      {t(`seedBuilder.dangerZone.${buttonKey}.button`)}
    </Button>
  )

  // The field itself is the selected row on the left, so the panel starts at the operations: it has to fit the height of
  // the four visible rows, which is what keeps the whole tab inside the dialog.
  return (
    <div className="self-start rounded-lg border bg-card">
      <ScrollArea className="max-h-[calc(15.125rem-2px)]">
        <div className="space-y-3 p-3 pr-4">
          <div role="tablist" className="flex overflow-hidden rounded-lg border">
            {segment("rename", t("seedBuilder.dangerZone.fieldOps.rename"))}
            {segment("retype", t("seedBuilder.dangerZone.fieldOps.retype"))}
            {segment("drop", t("seedBuilder.dangerZone.fieldOps.drop"))}
          </div>

          {(blocked.retype || blocked.drop) && (
            <ul className="space-y-0.5 text-xs text-amber-500">
              {blocked.retype && <li>{t("seedBuilder.dangerZone.fieldOps.retype")}: {blocked.retype}</li>}
              {blocked.drop && <li>{t("seedBuilder.dangerZone.fieldOps.drop")}: {blocked.drop}</li>}
            </ul>
          )}

          {effectiveMode === "rename" && (
            <>
              <Impact tone="warn" title={t("seedBuilder.dangerZone.rename.impactTitle")} body={t("seedBuilder.dangerZone.rename.impactBody")} />
              <div className="flex gap-2">
                <Input
                  aria-label={t("seedBuilder.dangerZone.rename.newAliasLabel")}
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder={t("seedBuilder.dangerZone.rename.newAliasLabel")}
                  className="font-mono"
                  autoComplete="off"
                />
                {runButton}
              </div>
            </>
          )}

          {effectiveMode === "retype" && (
            <>
              <Impact tone="warn" title={t("seedBuilder.dangerZone.retype.impactTitle")} body={t("seedBuilder.dangerZone.retype.impactBody")} />
              <div className="flex gap-2">
                <Select value={newType} onValueChange={(v) => setNewType(v as BranchType)}>
                  <SelectTrigger aria-label={t("seedBuilder.dangerZone.retype.newTypeLabel")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RETYPE_TARGETS.map((type) => (
                      <SelectItem key={type} value={type}>{t(`seedBuilder.fieldTypes.${type}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {runButton}
              </div>
            </>
          )}

          {effectiveMode === "drop" && (
            <>
              <Impact tone="danger" title={t("seedBuilder.dangerZone.dropField.impactTitle")} body={t("seedBuilder.dangerZone.dropField.impactBody")} />
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setConfirm(expected)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  title={t("seedBuilder.dangerZone.dropField.fillHint")}
                >
                  {t("seedBuilder.dangerZone.dropField.confirmLabel")} <code className="text-foreground">{expected}</code>
                </button>
                <div className="flex gap-2">
                  <Input
                    aria-label={t("seedBuilder.dangerZone.dropField.confirmLabel")}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={expected}
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  {runButton}
                </div>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function Impact({ tone, title, body }: { tone: "warn" | "danger"; title: string; body: string }) {
  return (
    <div className={cn("space-y-0.5 border-l-2 py-1 pl-3 text-sm", tone === "danger" ? "border-destructive" : "border-amber-500")}>
      <p className="font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export interface SeedDangerZoneProps {
  record: SeedRecordDTO
}

/**
 * The "Danger zone" tab: safe maintenance first, then the operations that change the database one field at a time.
 * Deleting the whole content type is the footer's red button (`HardDeleteDialog`), so it is never a stray click here.
 */
export function SeedDangerZone({ record }: SeedDangerZoneProps) {
  const { t } = useTranslation()
  const manifestOwned = record.source === "code"

  return (
    <div className="space-y-7" data-testid="seed-danger-zone">
      {manifestOwned && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-500" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>{t("seedBuilder.dangerZone.manifest.title")}</strong> {t("seedBuilder.dangerZone.manifest.body")}
          </p>
        </div>
      )}
      <MaintenanceSection record={record} manifestOwned={manifestOwned} />
      <FieldOperations record={record} disabled={manifestOwned} />
    </div>
  )
}
