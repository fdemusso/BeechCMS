// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Asterisk, ChevronDown } from "lucide-react"
import type { FormLayout, LayoutSection, LayoutTab, LayoutColumn } from "@beechcms/core"
import type { Branch } from "@beechcms/core"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FieldEdit } from "@/components/fields"

/** Dictionary mapping schema branch IDs to their corresponding Branch configuration. */
export interface RendererBranchMap {
  [id: string]: Branch
}

/** Properties for the {@link LayoutRenderer} component. */
export interface RendererProps {
  /** The full grid/tab layout schema configured for the entry form. */
  readonly layout: FormLayout
  /** The lookup map to retrieve branch definitions by ID. */
  readonly branchById: RendererBranchMap
  /** The reactive key-value map representing the current form input state. */
  readonly formData: Record<string, unknown>
  /** Dictionary containing validation error messages indexed by branch/field alias. */
  readonly fieldErrors: Record<string, string>
  /** Callback fired when any field value changes. */
  readonly onChange: (alias: string, value: unknown) => void
  /** Optional React element to render inside a separate "Danger Zone" layout tab. */
  readonly dangerZoneSlot?: React.ReactNode
  /** Custom label for the Danger Zone tab trigger. Defaults to "Danger Zone". */
  readonly dangerZoneLabel?: string
  /** Controls active tab ID from a parent state (controlled tab). */
  readonly activeTabId?: string
  /** Callback triggered when the active tab selection changes. */
  readonly onActiveTabChange?: (tabId: string) => void
  /** Disables editing inputs when set to true. */
  readonly isReadOnly?: boolean
}

/** Static ID representing the injected Danger Zone tab structure. */
const DANGER_ZONE_TAB_ID = "__danger_zone__"

/**
 * Returns Tailwind grid column classes based on the number of requested layout columns.
 *
 * @param columnCount - The number of columns in the grid section.
 * @returns Tailwind CSS grid column class string.
 */
function gridClassFor(columnCount: number): string {
  switch (columnCount) {
    case 1: return "grid-cols-1"
    case 2: return "grid-cols-1 sm:grid-cols-2"
    case 3: return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
    case 4: return "grid-cols-1 sm:grid-cols-2 md:grid-cols-4"
    default: return "grid-cols-1"
  }
}

/** Properties for the {@link ColumnRenderer} helper component. */
interface ColumnRendererProps {
  /** The column schema layout containing field lists. */
  column: LayoutColumn
  /** Map of schema branches. */
  branchById: RendererBranchMap
  /** The current form input values. */
  formData: Record<string, unknown>
  /** Active validation error messages. */
  fieldErrors: Record<string, string>
  /** Callback fired when any field changes. */
  onChange: (alias: string, value: unknown) => void
}

/**
 * ColumnRenderer component.
 * Renders all assigned fields in vertical order inside a layout column.
 */
function ColumnRenderer({
  column,
  branchById,
  formData,
  fieldErrors,
  onChange,
}: ColumnRendererProps) {
  const { t: translate } = useTranslation()

  if (column.fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic py-2">
        {translate("content.editor.emptyColumn")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {column.fields.map((field) => {
        const branch = branchById[field.branchId]
        if (branch == null) return null
        return (
          <div key={field.branchId} className="space-y-2">
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
              onChange={(value) => onChange(branch.alias, value)}
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

/** Properties for the {@link SectionRenderer} helper component. */
interface SectionRendererProps {
  /** The section layout schema. */
  section: LayoutSection
  /** True if this is the final section inside its parent tab. */
  isLast: boolean
  /** Map of schema branches. */
  branchById: RendererBranchMap
  /** The current form input values. */
  formData: Record<string, unknown>
  /** Active validation error messages. */
  fieldErrors: Record<string, string>
  /** Callback fired when any field changes. */
  onChange: (alias: string, value: unknown) => void
}

/**
 * SectionRenderer component.
 * Renders a collapsible section with a custom header, borders, and a grid container of columns.
 */
function SectionRenderer({
  section,
  isLast,
  branchById,
  formData,
  fieldErrors,
  onChange,
}: SectionRendererProps) {
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
              onClick={() => setIsCollapsed((prevCollapsed) => !prevCollapsed)}
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
          {section.columns.map((column) => (
            <ColumnRenderer
              key={column.id}
              column={column}
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

/** Properties for the {@link TabSections} helper component. */
interface TabSectionsProps {
  /** The tab layout schema containing sections. */
  tab: LayoutTab
  /** Map of schema branches. */
  branchById: RendererBranchMap
  /** The current form input values. */
  formData: Record<string, unknown>
  /** Active validation error messages. */
  fieldErrors: Record<string, string>
  /** Callback fired when any field changes. */
  onChange: (alias: string, value: unknown) => void
}

/**
 * TabSections component.
 * Renders all sections in sequence for a specific active layout tab.
 */
function TabSections({
  tab,
  branchById,
  formData,
  fieldErrors,
  onChange,
}: TabSectionsProps) {
  const { t: translate } = useTranslation()

  if (tab.sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {translate("content.editor.emptyTab")}
      </p>
    )
  }

  return (
    <div>
      {tab.sections.map((section, index) => (
        <SectionRenderer
          key={section.id}
          section={section}
          isLast={index === tab.sections.length - 1}
          branchById={branchById}
          formData={formData}
          fieldErrors={fieldErrors}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

/**
 * LayoutRenderer component.
 * Core rendering component that takes a form layout, maps database entry values to fields,
 * and renders tabs, collapsible sections, and responsive grids of editor inputs.
 *
 * @param props - Component properties conforming to {@link RendererProps}.
 */
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
    const exists = layout.tabs.some((tab) => tab.id === activeTabId) || (!!dangerZoneSlot && activeTabId === DANGER_ZONE_TAB_ID)
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
