// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import type { Branch, BranchType, Seed } from "@beechcms/core"
import { Plus } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ButtonGroup } from "@/components/ui/button-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { BranchEditorForm } from "@/components/fields"
import { useSettingsDialog } from "@/features/settings"
import { branchIssue, deriveAlias } from "../lib/field-alias"
import { FIELD_TYPES, FIELD_TYPE_ICONS } from "../lib/field-types"
import { SEED_TEMPLATE_IDS, buildTemplate, type BuiltTemplate, type SeedTemplateId } from "../lib/seed-templates"
import { FieldRow } from "./FieldRow"

export interface FieldsStepProps {
  branches: Branch[]
  onChange: (branches: Branch[]) => void
  activeSeedsForRelation: Seed[]
  /** Whether the content type has no entries yet (unlocks the stricter privacy tiers). */
  tableEmpty: boolean
  /** Templates are offered only while creating, on an empty list. */
  canUseTemplates: boolean
  onApplyTemplate: (template: BuiltTemplate) => void
}

let newFieldCounter = 0
const newFieldId = () => `br_new_${Date.now()}_${newFieldCounter++}`

/**
 * The "Fields" step: type a name and press Enter to add a field, pick the type with one click, then open a
 * field in the panel to refine it. The alias is derived from the name, so a field costs one line.
 */
export function FieldsStep({
  branches,
  onChange,
  activeSeedsForRelation,
  tableEmpty,
  canUseTemplates,
  onApplyTemplate,
}: FieldsStepProps) {
  const { t } = useTranslation()
  // The content languages live in the Site tab of the settings dialog that hosts this wizard.
  const { setTab } = useSettingsDialog()
  const [name, setName] = React.useState("")
  const [type, setType] = React.useState<BranchType>("text")
  const [selectedId, setSelectedId] = React.useState<string | null>(branches[0]?.id ?? null)
  const listRef = React.useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const selected = branches.find((b) => b.id === selectedId) ?? null

  function addField() {
    const label = name.trim()
    if (!label) return
    const taken = new Set(branches.map((b) => b.alias))
    const branch: Branch = { id: newFieldId(), alias: deriveAlias(label, taken), label, type }
    onChange([...branches, branch])
    setSelectedId(branch.id)
    setName("")
  }

  function updateBranch(updated: Branch) {
    onChange(branches.map((b) => (b.id === updated.id ? updated : b)))
  }

  function removeBranch(id: string) {
    const index = branches.findIndex((b) => b.id === id)
    const next = branches.filter((b) => b.id !== id)
    onChange(next)
    if (selectedId === id) setSelectedId(next[Math.min(index, next.length - 1)]?.id ?? null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = branches.findIndex((b) => b.id === active.id)
    const to = branches.findIndex((b) => b.id === over.id)
    if (from !== -1 && to !== -1) onChange(arrayMove(branches, from, to))
  }

  /** Arrows move between rows; Alt+arrows reorder the focused one. */
  function handleListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-field-row]") ?? [])
    const index = rows.indexOf(e.target as HTMLElement)
    if (index === -1) return
    e.preventDefault()
    const offset = e.key === "ArrowDown" ? 1 : -1
    const target = index + offset
    if (target < 0 || target >= rows.length) return
    if (e.altKey) {
      onChange(arrayMove(branches, index, target))
      // The row keeps its place in the DOM order of the new list: follow it.
      requestAnimationFrame(() => {
        listRef.current?.querySelectorAll<HTMLElement>("[data-field-row]")[target]?.focus()
      })
    } else {
      rows[target].focus()
    }
  }

  return (
    <div className="space-y-4">
      {canUseTemplates && branches.length === 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("seedBuilder.templates.title")}</span>
          {SEED_TEMPLATE_IDS.map((id: SeedTemplateId) => (
            <Button
              key={id}
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                const template = buildTemplate(id, (templateId, alias) => t(`seedBuilder.templates.${templateId}.${alias}`))
                onApplyTemplate(template)
                setSelectedId(template.branches[0]?.id ?? null)
              }}
            >
              {t(`seedBuilder.templates.${id}.name`)}
            </Button>
          ))}
        </div>
      )}

      {/* Quick add: a name, a type, Enter */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          data-enter-next=""
          value={name}
          placeholder={t("seedBuilder.fields.addPlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return
            // Adds a field; the dialog's own Enter handling must not also move on to the next step.
            e.preventDefault()
            e.stopPropagation()
            addField()
          }}
          className="min-w-40 flex-1"
        />
        {/* Like the keys of a tape recorder: the chosen type stays pressed, the others fade back. */}
        <ButtonGroup role="radiogroup" aria-label={t("seedBuilder.branchEditor.type")}>
          {FIELD_TYPES.map((fieldType) => {
            const Icon = FIELD_TYPE_ICONS[fieldType]
            const active = fieldType === type
            return (
              <Tooltip key={fieldType}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={t(`seedBuilder.fieldTypes.${fieldType}`)}
                    variant={active ? "default" : "outline"}
                    size="icon"
                    onClick={() => setType(fieldType)}
                    className={cn(!active && "text-muted-foreground hover:text-foreground")}
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{t(`seedBuilder.fieldTypes.${fieldType}`)}</TooltipContent>
              </Tooltip>
            )
          })}
        </ButtonGroup>
        <Button type="button" variant="outline" onClick={addField} disabled={!name.trim()}>
          <Plus className="size-4" />
          {t("seedBuilder.fields.add")}
        </Button>
      </div>

      {branches.length === 0 ? (
        <p className="rounded-control border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t("seedBuilder.fields.empty")}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)]">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={branches.map((b) => b.id)} strategy={verticalListSortingStrategy}>
              {/* Eight rows are visible (3.375rem each, 0.375rem apart, plus the 0.5rem of padding); the rest scrolls. The -m-1 / p-1 pair keeps
                  the rows' focus ring from being clipped without moving them. */}
              <ScrollArea className="-m-1 max-h-[30.125rem] self-start">
                <div ref={listRef} onKeyDown={handleListKeyDown} className="space-y-1.5 p-1 pr-3">
                  {branches.map((branch) => (
                    <FieldRow
                      key={branch.id}
                      branch={branch}
                      selected={branch.id === selectedId}
                      issue={branchIssue(branch, branches)}
                      removable={branch.id.startsWith("br_new_")}
                      onSelect={() => setSelectedId(branch.id)}
                      onRemove={() => removeBranch(branch.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </SortableContext>
          </DndContext>

          {/* Same ceiling as the list (less the 2px border): the panel scrolls instead of growing the dialog. */}
          <div className="self-start rounded-lg border">
            <ScrollArea className="max-h-[calc(30.125rem-2px)]">
              <div className="p-3 pr-4">
                {selected ? (
                  <BranchEditorForm
                    key={selected.id}
                    branch={selected}
                    activeSeedsForRelation={activeSeedsForRelation}
                    onChange={updateBranch}
                    tableEmpty={tableEmpty}
                    onOpenLanguages={() => setTab("general")}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("seedBuilder.fields.select")}</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  )
}
