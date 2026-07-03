// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { FormLayout, Branch } from "@beechcms/core"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TabSections } from "./layout-elements"

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
  const [internalActiveTabId, setInternalActiveTabId] = React.useState(
    () => layout.tabs[0]?.id ?? ""
  )

  const activeTabId = propActiveTabId !== undefined ? propActiveTabId : internalActiveTabId
  const setActiveTabId =
    onActiveTabChange !== undefined ? onActiveTabChange : setInternalActiveTabId

  React.useEffect(() => {
    const exists =
      layout.tabs.some((tab) => tab.id === activeTabId) ||
      (!!dangerZoneSlot && activeTabId === DANGER_ZONE_TAB_ID)
    if (!exists && layout.tabs.length > 0) {
      setActiveTabId(layout.tabs[0].id)
    }
  }, [layout, activeTabId, dangerZoneSlot, setActiveTabId])

  return (
    <Tabs
      value={activeTabId}
      onValueChange={setActiveTabId}
      className="rounded-lg border overflow-hidden flex flex-col"
    >
      <div className="px-6 bg-transparent">
        <TabsList variant="line" className="flex w-fit justify-start gap-6 p-0 h-auto">
          {layout.tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="px-0 py-3 font-medium">
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
