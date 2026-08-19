// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Editor } from "@tiptap/react"
import type { FormatAction } from "../types"
import type { VariantProps } from "class-variance-authority"
import type { toggleVariants } from "@/components/ui/toggle"
import { cn } from "@/lib/utils"
import { ArrowDown as CaretDownIcon } from 'reicon-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToolbarButton } from "./toolbar-button"
import { ShortcutKey } from "./shortcut-key"
import { getShortcutKey } from "../utils"

interface ToolbarSectionProps extends VariantProps<typeof toggleVariants> {
  editor: Editor
  actions: FormatAction[]
  activeActions?: string[]
  mainActionCount?: number
  dropdownIcon?: React.ReactNode
  dropdownTooltip?: string
  dropdownClassName?: string
}

export const ToolbarSection: React.FC<ToolbarSectionProps> = ({
  editor,
  actions,
  activeActions = actions.map((action) => action.value),
  mainActionCount = 0,
  dropdownIcon,
  dropdownTooltip = "More options",
  dropdownClassName = "w-12",
  size,
  variant,
}) => {
  const { mainActions, dropdownActions } = React.useMemo(() => {
    const activeActionIndexMap = new Map(
      activeActions.map((value, index) => [value, index])
    )
    const sortedActions = actions
      .filter((action) => activeActionIndexMap.has(action.value))
      .sort(
        (a, b) =>
          (activeActionIndexMap.get(a.value) ?? 0) -
          (activeActionIndexMap.get(b.value) ?? 0)
      )

    return {
      mainActions: sortedActions.slice(0, mainActionCount),
      dropdownActions: sortedActions.slice(mainActionCount),
    }
  }, [actions, activeActions, mainActionCount])

  const renderToolbarButton = React.useCallback(
    (action: FormatAction) => (
      <ToolbarButton
        key={action.label}
        onClick={() => action.action(editor)}
        disabled={!action.canExecute(editor)}
        isActive={action.isActive(editor)}
        tooltip={`${action.label} ${action.shortcuts.map((s) => getShortcutKey(s).symbol).join(" ")}`}
        aria-label={action.label}
        size={size}
        variant={variant}
      >
        {action.icon}
      </ToolbarButton>
    ),
    [editor, size, variant]
  )

  const renderDropdownMenuItem = React.useCallback(
    (action: FormatAction) => (
      <DropdownMenuItem
        key={action.label}
        onClick={() => action.action(editor)}
        disabled={!action.canExecute(editor)}
        className={cn("flex flex-row items-center justify-between gap-4", {
          "bg-muted": action.isActive(editor),
        })}
        aria-label={action.label}
      >
        <span className="grow">{action.label}</span>
        <ShortcutKey keys={action.shortcuts} />
      </DropdownMenuItem>
    ),
    [editor]
  )

  const isDropdownActive = dropdownActions.some((action) =>
    action.isActive(editor)
  )

  return (
    <>
      {mainActions.map(renderToolbarButton)}
      {dropdownActions.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton
              isActive={isDropdownActive}
              tooltip={dropdownTooltip}
              aria-label={dropdownTooltip}
              className={cn("gap-0", dropdownClassName)}
              size={size}
              variant={variant}
            >
              {dropdownIcon || <CaretDownIcon className="size-5" />}
            </ToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-full">
            {dropdownActions.map(renderDropdownMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
}

export default ToolbarSection
