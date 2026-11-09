// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Tabs as TabsPrimitive } from "radix-ui"
import { toast } from "sonner"
import type { Branch, BranchType } from "@beechcms/core"
import { AlertTriangle, Refresh } from "@/components/icons"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { IconBadgeGroup } from "@/components/ui/icon-badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useDropBranch, useDropOrphan, useOrphans, useRebuildFts, useRenameBranch, useRetypeBranch } from "../hooks/use-seeds"
import type { SeedRecordDTO } from "../api/seeds.api"
import { fieldBadges } from "../lib/field-badges"
import type { DangerDraft } from "../lib/seed-draft"
import { FIELD_TYPE_ICONS } from "../lib/field-types"

/** What a retype can target: a relation needs a target seed and a repeater needs sub-fields, neither of which a retype carries. */
const RETYPE_TARGETS: BranchType[] = ["text", "richtext", "number", "boolean", "date", "json", "tags", "file"]

type Operation = "rename" | "retype" | "drop"
const OPERATIONS: Operation[] = ["rename", "retype", "drop"]

/** The stored operation, or the first one when the draft names something that no longer exists. */
function asOperation(value: string): Operation {
  return OPERATIONS.find((operation) => operation === value) ?? "rename"
}

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

function MaintenanceSection({ record, manifestOwned, open, onOpenChange }: { record: SeedRecordDTO; manifestOwned: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation()
  const rebuildFts = useRebuildFts(record.slug)
  const { data, refetch, isFetching } = useOrphans(record.slug)
  const dropOrphan = useDropOrphan()
  const listId = React.useId()
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
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("seedBuilder.dangerZone.maintenance.title")}
          </h3>
          <Badge variant="outline">{t("seedBuilder.dangerZone.maintenance.badge")}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.maintenance.subtitle")}</p>
      </header>

      {/* Two columns: the text, and the actions. `auto` takes the widest action, and `subgrid` lets every row share it, so the
          buttons stack at one natural width. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] divide-y overflow-hidden rounded-lg border">
        <div className="col-span-full grid grid-cols-subgrid items-center gap-x-3 p-3">
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-medium">{t("seedBuilder.dangerZone.ftsRebuild.title")}</h4>
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
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium">{t("seedBuilder.dangerZone.orphans.title")}</h4>
                <Badge variant="secondary">{orphans.length}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.orphans.description")}</p>
            </div>
            <ButtonGroup className="w-full">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => void refetch()} disabled={isFetching} aria-label={t("seedBuilder.dangerZone.orphans.refreshButton")}>
                    <Refresh className={cn("size-3.5", isFetching && "animate-spin")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("seedBuilder.dangerZone.orphans.refreshButton")}</TooltipContent>
              </Tooltip>
              {/* The width is always that of "Review": the invisible label sizes the button, the current one sits over it. */}
              <Button type="button" variant="outline" size="sm" className="relative flex-1 whitespace-nowrap" onClick={() => onOpenChange(!open)} aria-expanded={open} aria-controls={listId}>
                <span className="invisible" aria-hidden>{t("seedBuilder.dangerZone.orphans.review")}</span>
                <span className="absolute inset-0 flex items-center justify-center">
                  {open ? t("seedBuilder.dangerZone.orphans.hide") : t("seedBuilder.dangerZone.orphans.review")}
                </span>
              </Button>
            </ButtonGroup>
          </div>

          {/* Always mounted: the row grows from 0fr to 1fr, so the list slides out from under the row above. */}
          <div
            id={listId}
            className={cn(
              "col-span-full grid transition-[grid-template-rows] ease-out motion-reduce:transition-none",
              open ? "grid-rows-[1fr] duration-(--duration-enter)" : "grid-rows-[0fr] duration-(--duration-exit)"
            )}
            inert={!open}
          >
            <div
              className={cn(
                "min-h-0 overflow-hidden transition-[opacity,transform] ease-out motion-reduce:transition-none",
                open ? "translate-y-0 opacity-100 duration-(--duration-enter)" : "-translate-y-2 opacity-0 duration-(--duration-exit)"
              )}
            >
              <div className="border-t bg-muted/30 p-3">
                {orphans.length === 0 ? (
                  <p className="text-xs italic text-muted-foreground">{t("seedBuilder.dangerZone.orphans.empty")}</p>
                ) : (
                  <ul className="space-y-2">
                    {orphans.map((column) => {
                      const expected = `${record.slug}.${column}`
                      const placeholder = t("seedBuilder.dangerZone.dropField.confirmPlaceholder", { expected })
                      return (
                        <li key={column} className="flex items-center gap-2">
                          <code className="flex-1 text-xs">{column}</code>
                          <Input
                            aria-label={placeholder}
                            value={confirms[column] ?? ""}
                            onChange={(e) => setConfirms((prev) => ({ ...prev, [column]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-52 font-mono text-xs"
                            autoComplete="off"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={manifestOwned || confirms[column] !== expected || dropOrphan.isPending}
                            onClick={() => void handleDrop(column)}
                          >
                            {t("seedBuilder.dangerZone.orphans.dropButton")}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Field operations ─────────────────────────────────────────────────────────

function FieldOperations({ record, disabled, state, onStateChange, onChooseDisplayName }: { record: SeedRecordDTO; disabled: boolean; state: DangerDraft; onStateChange: (state: DangerDraft) => void; onChooseDisplayName?: () => void }) {
  const { t } = useTranslation()
  const slug = record.slug
  // A field added in the Fields tab and not saved yet has no column: there is nothing to operate on.
  const branches = record.definition.branches.filter((b) => !b.id.startsWith("br_new_"))
  // The field and the operation come from the state kept across a reload; a field that no longer exists falls back to the first.
  const selected = branches.find((b) => b.id === state.branchId) ?? branches[0] ?? null

  return (
    // `inert` takes the whole section out of reach, keyboard included: pointer-events alone would leave it tabbable.
    <section className={cn("space-y-2", disabled && "opacity-50")} inert={disabled}>
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("seedBuilder.dangerZone.fieldOps.title")}
          </h3>
          <Badge variant="outline" className="border-status-warning/50 text-status-warning-foreground">
            {t("seedBuilder.dangerZone.fieldOps.badge")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{t("seedBuilder.dangerZone.fieldOps.subtitle")}</p>
      </header>

      {branches.length === 0 ? (
        <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          {t("seedBuilder.dangerZone.fieldOps.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-status-warning/30 bg-status-warning-soft p-3 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          {/* Four rows are visible (3.375rem each, 0.375rem apart, plus the 0.5rem of padding): that is what lets the whole tab fit the
              dialog without scrolling the page. The rest of the list scrolls. */}
          <ScrollArea className="-m-1 max-h-[15.125rem] self-start">
            <ul className="space-y-1.5 p-1 pr-3" aria-label={t("seedBuilder.dangerZone.fieldOps.title")}>
              {branches.map((branch) => {
                const Icon = FIELD_TYPE_ICONS[branch.type]
                const active = branch.id === selected?.id
                return (
                  <li key={branch.id}>
                  <button
                    type="button"
                    aria-current={active}
                    onClick={() => onStateChange({ ...state, branchId: branch.id, mode: "rename" })}
                    className={cn(
                      "flex h-[3.375rem] w-full items-center gap-3 rounded-control border bg-card px-3 text-left transition-colors",
                      active ? "border-primary/60 bg-accent" : "hover:bg-accent/60"
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{branch.label}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">{branch.alias}</span>
                    </span>
                    <IconBadgeGroup items={fieldBadges(branch, t)} moreLabel={(count) => t("rbac.roles.moreRoles", "+{{count}} more", { count })} />
                  </button>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>

          {selected && <FieldOperationPanel key={selected.id} branch={selected} mode={selected.id === state.branchId ? asOperation(state.mode) : "rename"} onModeChange={(mode) => onStateChange({ ...state, branchId: selected.id, mode })} slug={slug} displayNameAlias={record.definition.displayNameAlias} onChooseDisplayName={onChooseDisplayName} />}
        </div>
      )}
    </section>
  )
}

function FieldOperationPanel({ branch, mode, onModeChange, slug, displayNameAlias, onChooseDisplayName }: { branch: Branch; mode: Operation; onModeChange: (mode: Operation) => void; slug: string; displayNameAlias: string; onChooseDisplayName?: () => void }) {
  const { t } = useTranslation()
  const renameBranch = useRenameBranch()
  const retypeBranch = useRetypeBranch()
  const dropBranch = useDropBranch()
  const [newAlias, setNewAlias] = React.useState("")
  const [newType, setNewType] = React.useState<BranchType>(branch.type)
  const [confirm, setConfirm] = React.useState("")

  const expected = `${slug}.${branch.alias}`
  const placeholder = t("seedBuilder.dangerZone.dropField.confirmPlaceholder", { expected })
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
    <TabsPrimitive.Trigger
      key={op}
      value={op}
      disabled={blocked[op] !== undefined}
      className={cn(
        "relative z-10 flex-1 rounded-[calc(var(--radius-control)-3px)] px-3 py-1 text-sm text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
        mode === op && (op === "drop" ? "text-status-danger-foreground" : "text-foreground")
      )}
    >
      {label}
    </TabsPrimitive.Trigger>
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
  // Concentric corners: an inner radius is the outer one minus the distance between them (padding + border). The controls
  // here use --radius-control, with 6px of padding and a 1px border around them, so the card gets control + 7px. The
  // tabs sit 3px inside the tablist (2px padding + 1px border), so they get control - 3px.
  return (
    <div className="self-start rounded-[calc(var(--radius-control)+7px)] border bg-card">
      <ScrollArea className="max-h-[calc(15.125rem-2px)]">
        <TabsPrimitive.Root value={mode} onValueChange={(value) => onModeChange(value as Operation)} className="space-y-3 p-1.5">
          <TabsPrimitive.List aria-label={t("seedBuilder.dangerZone.fieldOps.title")} className="relative flex gap-0.5 rounded-control border p-0.5">
            {/* The pill slides under the tabs: three equal columns of (100% - 4px padding - 4px gaps) / 3, moved by one column
                plus one gap per step. */}
            <span
              aria-hidden
              className={cn(
                "absolute inset-y-0.5 left-0.5 w-[calc((100%-0.5rem)/3)] rounded-[calc(var(--radius-control)-3px)] transition-[transform,background-color] duration-(--duration-enter) ease-out motion-reduce:transition-none",
                mode === "drop" ? "bg-destructive/15" : "bg-accent"
              )}
              style={{ transform: `translateX(calc(${OPERATIONS.indexOf(mode)} * (100% + 0.125rem)))` }}
            />
            {segment("rename", t("seedBuilder.dangerZone.fieldOps.rename"))}
            {segment("retype", t("seedBuilder.dangerZone.fieldOps.retype"))}
            {segment("drop", t("seedBuilder.dangerZone.fieldOps.drop"))}
          </TabsPrimitive.List>

          {(blocked.retype || blocked.drop) && (
            <ul className="space-y-0.5 px-1.5 text-xs text-status-warning-foreground">
              {blocked.retype && <li>{t("seedBuilder.dangerZone.fieldOps.retype")}: {blocked.retype}</li>}
              {blocked.drop && (
                <li>
                  {t("seedBuilder.dangerZone.fieldOps.drop")}: {blocked.drop}
                  {onChooseDisplayName && (
                    <>
                      {" "}
                      <button type="button" onClick={onChooseDisplayName} className="underline underline-offset-2 hover:text-foreground">
                        {t("seedBuilder.dangerZone.blocked.displayNameLink")}
                      </button>
                    </>
                  )}
                </li>
              )}
            </ul>
          )}

          <TabsPrimitive.Content value={mode} className="space-y-3 outline-none">
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
              <div className="flex gap-2">
                <Input
                  aria-label={placeholder}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={placeholder}
                  className="font-mono text-xs"
                  autoComplete="off"
                />
                {runButton}
              </div>
            </>
          )}
          </TabsPrimitive.Content>
        </TabsPrimitive.Root>
      </ScrollArea>
    </div>
  )
}

function Impact({ tone, title, body }: { tone: "warn" | "danger"; title: string; body: string }) {
  return (
    <div role="note" className={cn("mx-1.5 space-y-0.5 border-l-2 py-1 pl-3 text-sm", tone === "danger" ? "border-destructive" : "border-status-warning")}>
      <p className="font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export interface SeedDangerZoneProps {
  record: SeedRecordDTO
  /** Where the user is in the tab (field, operation, orphan list). It lives in the dialog, so it can survive a reload. */
  state: DangerDraft
  onStateChange: (state: DangerDraft) => void
  /** Jumps to where the display name is chosen (the Dashboard tab), so a blocked Drop has a way out. */
  onChooseDisplayName?: () => void
}

/**
 * The "Danger zone" tab: safe maintenance first, then the operations that change the database one field at a time.
 * Deleting the whole content type is the footer's red button (`HardDeleteDialog`), so it is never a stray click here.
 */
export function SeedDangerZone({ record, state, onStateChange, onChooseDisplayName }: SeedDangerZoneProps) {
  const { t } = useTranslation()
  const manifestOwned = record.source === "code"

  return (
    <div className="space-y-7" data-testid="seed-danger-zone">
      {manifestOwned && (
        <div className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning-soft p-3 text-sm text-status-warning-foreground" role="note">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>{t("seedBuilder.dangerZone.manifest.title")}</strong> {t("seedBuilder.dangerZone.manifest.body")}
          </p>
        </div>
      )}
      <MaintenanceSection record={record} manifestOwned={manifestOwned} open={state.orphansOpen} onOpenChange={(orphansOpen) => onStateChange({ ...state, orphansOpen })} />
      <FieldOperations record={record} disabled={manifestOwned} state={state} onStateChange={onStateChange} onChooseDisplayName={onChooseDisplayName} />
    </div>
  )
}
