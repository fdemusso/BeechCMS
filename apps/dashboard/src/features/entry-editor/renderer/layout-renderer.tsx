// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Asterisk, ChevronDown } from "lucide-react"
import type { FormLayout, LayoutSection, LayoutTab, LayoutColumn } from "@beechcms/core"
import type { Branch } from "@beechcms/core"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FieldEdit } from "@/features/fields"

export interface RendererBranchMap { [id: string]: Branch }

export interface RendererProps {
  layout: FormLayout
  branchById: RendererBranchMap
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  onChange: (alias: string, value: unknown) => void
  dangerZoneSlot?: React.ReactNode
  dangerZoneLabel?: string
  activeTabId?: string
  onActiveTabChange?: (tabId: string) => void
  isReadOnly?: boolean
}

const DANGER_ZONE_TAB_ID = "__danger_zone__"

function gridClassFor(n: number): string {
  switch (n) {
    case 1: return "grid-cols-1"
    case 2: return "grid-cols-1 sm:grid-cols-2"
    case 3: return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
    case 4: return "grid-cols-1 sm:grid-cols-2 md:grid-cols-4"
    default: return "grid-cols-1"
  }
}

function ColumnRenderer({
  column,
  branchById,
  formData,
  fieldErrors,
  onChange,
}: {
  column: LayoutColumn
  branchById: RendererBranchMap
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  onChange: (alias: string, value: unknown) => void
}) {
  const { t } = useTranslation()

  if (column.fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        {t("content.editor.emptyColumn")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {column.fields.map((f) => {
        const branch = branchById[f.branchId]
        if (branch == null) return null
        return (
          <div key={f.branchId} className="space-y-2">
            <Label htmlFor={branch.alias} className="flex items-center gap-1">
              {branch.hint ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      {branch.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-64">
                    {branch.hint}
                  </TooltipContent>
                </Tooltip>
              ) : (
                branch.label
              )}
              {branch.requiredOnCreate && (
                <Asterisk className="inline size-3 text-destructive" />
              )}
            </Label>
            <FieldEdit
              branch={branch as any}
              value={formData[branch.alias]}
              onChange={(v) => onChange(branch.alias, v)}
            />
            {fieldErrors[branch.alias] && (
              <p className="text-xs text-destructive">{fieldErrors[branch.alias]}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SectionRenderer({
  section,
  isLast,
  branchById,
  formData,
  fieldErrors,
  onChange,
}: {
  section: LayoutSection
  isLast: boolean
  branchById: RendererBranchMap
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  onChange: (alias: string, value: unknown) => void
}) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)
  const showBorder = !section.hideBorder && !isLast
  const showHeader = section.collapsible || (!section.hideLabel && !!section.label)

  return (
    <section className={`px-6 py-4 space-y-4 ${showBorder ? "border-b" : ""}`}>
      {showHeader && (
        <header className="flex items-center gap-2">
          {!section.hideLabel && section.label && (
            <span className="text-sm font-medium text-muted-foreground">{section.label}</span>
          )}
          {section.collapsible && (
            <button
              type="button"
              onClick={() => setIsCollapsed((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={!isCollapsed}
            >
              <ChevronDown
                className={`size-4 transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}
              />
            </button>
          )}
        </header>
      )}
      {!isCollapsed && (
        <div className={`grid gap-4 ${gridClassFor(section.columns.length)}`}>
          {section.columns.map((col) => (
            <ColumnRenderer
              key={col.id}
              column={col}
              branchById={branchById}
              formData={formData}
              fieldErrors={fieldErrors}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function TabSections({
  tab,
  branchById,
  formData,
  fieldErrors,
  onChange,
}: {
  tab: LayoutTab
  branchById: RendererBranchMap
  formData: Record<string, unknown>
  fieldErrors: Record<string, string>
  onChange: (alias: string, value: unknown) => void
}) {
  const { t } = useTranslation()

  if (tab.sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("content.editor.emptyTab")}
      </p>
    )
  }

  return (
    <div>
      {tab.sections.map((section, i) => (
        <SectionRenderer
          key={section.id}
          section={section}
          isLast={i === tab.sections.length - 1}
          branchById={branchById}
          formData={formData}
          fieldErrors={fieldErrors}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

export function LayoutRenderer({
  layout,
  branchById,
  formData,
  fieldErrors,
  onChange,
  dangerZoneSlot,
  dangerZoneLabel,
  activeTabId: propActiveTabId,
  onActiveTabChange,
  isReadOnly,
}: RendererProps) {
  const [internalActiveTabId, setInternalActiveTabId] = React.useState(() => layout.tabs[0]?.id ?? "")

  const activeTabId = propActiveTabId !== undefined ? propActiveTabId : internalActiveTabId
  const setActiveTabId = onActiveTabChange !== undefined ? onActiveTabChange : setInternalActiveTabId

  React.useEffect(() => {
    const exists = layout.tabs.some((t) => t.id === activeTabId) || (!!dangerZoneSlot && activeTabId === DANGER_ZONE_TAB_ID)
    if (!exists && layout.tabs.length > 0) {
      setActiveTabId(layout.tabs[0].id)
    }
  }, [layout, activeTabId, dangerZoneSlot, setActiveTabId])

  return (
    <Tabs value={activeTabId} onValueChange={setActiveTabId} className="rounded-lg border overflow-hidden flex flex-col">
      <div className="px-6 bg-transparent">
        <TabsList variant="line" className="flex w-fit justify-start gap-6 p-0 h-auto">
          {layout.tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="px-0 py-3 font-medium"
            >
              {tab.label}
            </TabsTrigger>
          ))}
          {dangerZoneSlot && (
            <TabsTrigger
              value={DANGER_ZONE_TAB_ID}
              className="px-0 py-3 font-medium text-destructive data-[state=active]:text-destructive"
            >
              {dangerZoneLabel ?? "Danger Zone"}
            </TabsTrigger>
          )}
        </TabsList>
      </div>
      {layout.tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="mt-0 outline-none">
          <fieldset disabled={isReadOnly} className="contents">
            <TabSections
              tab={tab}
              branchById={branchById}
              formData={formData}
              fieldErrors={fieldErrors}
              onChange={onChange}
            />
          </fieldset>
        </TabsContent>
      ))}
      {dangerZoneSlot && (
        <TabsContent value={DANGER_ZONE_TAB_ID} className="mt-0 outline-none p-6">
          {dangerZoneSlot}
        </TabsContent>
      )}
    </Tabs>
  )
}
