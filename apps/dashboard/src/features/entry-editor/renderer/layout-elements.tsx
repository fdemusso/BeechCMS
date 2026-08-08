// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown } from 'reicon-react'
import type { LayoutSection, LayoutTab, LayoutColumn } from "@beechcms/core"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { FieldEdit } from "@/components/fields"
import type { RendererBranchMap } from "./layout-renderer"

function Asterisk({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 6v12M7.5 9.5l9 5M7.5 14.5l9-5" />
    </svg>
  )
}

/**
 * Returns Tailwind grid column classes based on the number of requested layout columns.
 *
 * @param columnCount - The number of columns in the grid section.
 * @returns Tailwind CSS grid column class string.
 */
function gridClassFor(columnCount: number): string {
  switch (columnCount) {
    case 1:
      return "grid-cols-1"
    case 2:
      return "grid-cols-1 sm:grid-cols-2"
    case 3:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
    case 4:
      return "grid-cols-1 sm:grid-cols-2 md:grid-cols-4"
    default:
      return "grid-cols-1"
  }
}

/** Properties for the {@link ColumnRenderer} helper component. */
export interface ColumnRendererProps {
  /** The column schema layout containing field lists. */
  readonly column: LayoutColumn
  /** Map of schema branches. */
  readonly branchById: RendererBranchMap
  /** The current form input values. */
  readonly formData: Record<string, unknown>
  /** Active validation error messages. */
  readonly fieldErrors: Record<string, string>
  /** Callback fired when any field changes. */
  readonly onChange: (alias: string, value: unknown) => void
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
                    <span className="cursor-help">{branch.label}</span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-64">
                    {branch.hint}
                  </TooltipContent>
                </Tooltip>
              ) : (
                branch.label
              )}
              {branch.requiredOnCreate && <Asterisk className="inline size-3 text-destructive" />}
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
export interface SectionRendererProps {
  /** The section layout schema. */
  readonly section: LayoutSection
  /** True if this is the final section inside its parent tab. */
  readonly isLast: boolean
  /** Map of schema branches. */
  readonly branchById: RendererBranchMap
  /** The current form input values. */
  readonly formData: Record<string, unknown>
  /** Active validation error messages. */
  readonly fieldErrors: Record<string, string>
  /** Callback fired when any field changes. */
  readonly onChange: (alias: string, value: unknown) => void
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
                className={`size-4 transition-transform duration-200 ${
                  isCollapsed ? "-rotate-90" : ""
                }`}
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
export interface TabSectionsProps {
  /** The tab layout schema containing sections. */
  readonly tab: LayoutTab
  /** Map of schema branches. */
  readonly branchById: RendererBranchMap
  /** The current form input values. */
  readonly formData: Record<string, unknown>
  /** Active validation error messages. */
  readonly fieldErrors: Record<string, string>
  /** Callback fired when any field changes. */
  readonly onChange: (alias: string, value: unknown) => void
}

/**
 * TabSections component.
 * Renders all sections in sequence for a specific active layout tab.
 */
export function TabSections({
  tab,
  branchById,
  formData,
  fieldErrors,
  onChange,
}: TabSectionsProps) {
  const { t: translate } = useTranslation()

  if (tab.sections.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">{translate("content.editor.emptyTab")}</p>
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
