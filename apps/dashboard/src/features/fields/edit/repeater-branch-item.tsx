// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Trash2, ChevronDown, ChevronUp, GripVertical, Info } from "lucide-react"
import type { Branch, BranchType, Seed } from "@beechcms/core"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"

const BRANCH_TYPES: BranchType[] = [
  "text", "richtext", "number", "boolean", "date", "json", "tags", "file", "relation",
]

export const AUTOMATION_RESERVED = new Set([
  "id", "slug", "status", "created_at", "updated_at", "schema_slug",
])

export interface BranchItemRowProps {
  branch: Branch
  activeSeedsForRelation: Seed[]
  onChange: (updated: Branch) => void
  onRemove: () => void
}

export function BranchItemRow({ branch, activeSeedsForRelation, onChange, onRemove }: BranchItemRowProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const isExisting = !branch.id.startsWith("br_new_")
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: branch.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  function set<K extends keyof Branch>(key: K, value: Branch[K]) {
    onChange({ ...branch, [key]: value })
  }

  function setPolicy(key: keyof NonNullable<Branch["policies"]>, value: boolean | string) {
    onChange({ ...branch, policies: { ...branch.policies, [key]: value } })
  }

  return (
    <Collapsible
      ref={setNodeRef}
      style={style}
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border bg-background"
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
          title={t("fields.repeater.dragHandle")}
          aria-label={t("fields.repeater.dragHandle")}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium truncate">{branch.alias || t("seedBuilder.branchEditor.newField")}</span>
            <Badge variant="secondary" className="text-xs">{branch.type}</Badge>
          </div>
          {branch.label && <p className="text-xs text-muted-foreground truncate">{branch.label}</p>}
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <Button variant="ghost" size="sm" onClick={onRemove} title={t("fields.repeater.removeItem")} aria-label={t("fields.repeater.removeItem")}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <CollapsibleContent>
        <Separator />
        <div className="p-3 space-y-3">
          {/* Alias */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("seedBuilder.branchEditor.alias")}</Label>
              {isExisting ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1">
                        <Input value={branch.alias} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" />
                        <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{t("seedBuilder.branchEditor.aliasReadOnlyHint")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Input
                  value={branch.alias}
                  onChange={e => set("alias", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  placeholder="field_name"
                  pattern="^[a-z0-9_]+$"
                />
              )}
            </div>

            {/* Type */}
            <div className="space-y-1">
              <Label className="text-xs">{t("seedBuilder.branchEditor.type")}</Label>
              {isExisting ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1">
                        <Input value={branch.type} readOnly className="bg-muted text-muted-foreground cursor-not-allowed" />
                        <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{t("seedBuilder.branchEditor.typeReadOnlyHint")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <Select value={branch.type} onValueChange={v => set("type", v as BranchType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRANCH_TYPES.map(bt => (
                      <SelectItem key={bt} value={bt}>{t(`seedBuilder.fieldTypes.${bt}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Label */}
          <div className="space-y-1">
            <Label className="text-xs">{t("seedBuilder.branchEditor.label")}</Label>
            <Input
              value={branch.label}
              onChange={e => set("label", e.target.value)}
              placeholder={t("seedBuilder.branchEditor.labelPlaceholder")}
            />
          </div>

          {/* Type-specific sub-forms */}
          {branch.type === "relation" && (
            <div className="space-y-2 rounded-md border p-2">
              <p className="text-xs font-medium">{t("seedBuilder.branchEditor.relationOptions")}</p>
              <div className="space-y-1">
                <Label className="text-xs">{t("seedBuilder.branchEditor.targetSeed")}</Label>
                <Select value={branch.targetSeed ?? ""} onValueChange={v => set("targetSeed", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("seedBuilder.branchEditor.targetSeedPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSeedsForRelation.map(s => (
                      <SelectItem key={s.slug} value={s.slug}>{s.labelPlural ?? s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`multiple-${branch.id}`}
                  checked={!!branch.multiple}
                  onCheckedChange={v => set("multiple", !!v)}
                />
                <Label htmlFor={`multiple-${branch.id}`} className="text-xs">{t("seedBuilder.branchEditor.multiple")}</Label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("seedBuilder.branchEditor.onDelete")}</Label>
                <Select
                  value={branch.onDelete ?? "SET NULL"}
                  onValueChange={v => set("onDelete", v as Branch["onDelete"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASCADE">{t("seedBuilder.branchEditor.onDeleteCascade")}</SelectItem>
                    <SelectItem value="RESTRICT">{t("seedBuilder.branchEditor.onDeleteRestrict")}</SelectItem>
                    <SelectItem value="SET NULL" disabled={!!branch.multiple}>{t("seedBuilder.branchEditor.onDeleteSetNull")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {branch.type === "number" && (
            <div className="space-y-2 rounded-md border p-2">
              <p className="text-xs font-medium">{t("seedBuilder.branchEditor.numberOptions")}</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("seedBuilder.branchEditor.min")}</Label>
                  <Input
                    type="number"
                    value={branch.numberOptions?.min ?? ""}
                    onChange={e => onChange({ ...branch, numberOptions: { ...branch.numberOptions, min: e.target.value ? +e.target.value : undefined } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("seedBuilder.branchEditor.max")}</Label>
                  <Input
                    type="number"
                    value={branch.numberOptions?.max ?? ""}
                    onChange={e => onChange({ ...branch, numberOptions: { ...branch.numberOptions, max: e.target.value ? +e.target.value : undefined } })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("seedBuilder.branchEditor.step")}</Label>
                  <Input
                    type="number"
                    value={branch.numberOptions?.step ?? ""}
                    onChange={e => onChange({ ...branch, numberOptions: { ...branch.numberOptions, step: e.target.value ? +e.target.value : undefined } })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("seedBuilder.branchEditor.control")}</Label>
                <Select
                  value={branch.numberOptions?.control ?? "input"}
                  onValueChange={v => onChange({ ...branch, numberOptions: { ...branch.numberOptions, control: v as "input" | "slider" | "rating" | "stepper" } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["input", "slider", "rating", "stepper"].map(c => (
                      <SelectItem key={c} value={c}>{t(`seedBuilder.branchEditor.control_${c}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {branch.type === "file" && (
            <div className="space-y-2 rounded-md border p-2">
              <p className="text-xs font-medium">{t("seedBuilder.branchEditor.fileOptions")}</p>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`file-multiple-${branch.id}`}
                  checked={!!branch.multiple}
                  onCheckedChange={v => set("multiple", !!v)}
                />
                <Label htmlFor={`file-multiple-${branch.id}`} className="text-xs">{t("seedBuilder.branchEditor.multiple")}</Label>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("seedBuilder.branchEditor.fileAccept")}</Label>
                <Select
                  value={branch.fileOptions?.accept ?? "any"}
                  onValueChange={v => onChange({ ...branch, fileOptions: { ...branch.fileOptions, accept: v as "image" | "document" | "any" } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["any", "image", "document"].map(a => (
                      <SelectItem key={a} value={a}>{t(`seedBuilder.branchEditor.fileAccept_${a}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(branch.type === "tags" || branch.type === "json") && (
            <div className="space-y-1">
              <Label className="text-xs">{t("seedBuilder.branchEditor.options")}</Label>
              <Input
                value={(branch.options ?? []).join(",")}
                onChange={e => set("options", e.target.value ? e.target.value.split(",").map(s => s.trim()) : [])}
                placeholder={t("seedBuilder.branchEditor.optionsPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("seedBuilder.branchEditor.optionsHint")}</p>
            </div>
          )}

          {/* Policies */}
          <div className="space-y-2 rounded-md border p-2">
            <p className="text-xs font-medium">{t("seedBuilder.branchEditor.policies")}</p>
            <div className="grid grid-cols-2 gap-2">
              {(["search", "filter", "sort", "public"] as const).map(pol => (
                <div key={pol} className="flex items-center gap-2">
                  <Checkbox
                    id={`policy-${branch.id}-${pol}`}
                    checked={branch.policies?.[pol] !== false}
                    onCheckedChange={v => setPolicy(pol, !!v)}
                  />
                  <Label htmlFor={`policy-${branch.id}-${pol}`} className="text-xs">{t(`seedBuilder.policies.${pol}`)}</Label>
                </div>
              ))}
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">{t("seedBuilder.policies.visibility")}</Label>
                <Select
                  value={branch.policies?.visibility ?? "full"}
                  onValueChange={v => setPolicy("visibility", v)}
                >
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["full", "masked", "hidden"].map(vis => (
                      <SelectItem key={vis} value={vis} className="text-xs">{t(`seedBuilder.policies.visibility_${vis}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
