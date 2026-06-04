// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ClipboardCopyIcon,
  DotsHorizontalIcon,
  DownloadIcon,
  Link2Icon,
  SizeIcon,
} from "@radix-ui/react-icons"
import { ActionWrapper } from "./action-wrapper"
import { ActionButton } from "./action-button"
import { cn } from "@/lib/utils"

export { ActionWrapper, ActionButton }

interface ImageActionsProps {
  shouldMerge?: boolean
  isLink?: boolean
  onView?: () => void
  onDownload?: () => void
  onCopy?: () => void
  onCopyLink?: () => void
}

type ActionKey = "onView" | "onDownload" | "onCopy" | "onCopyLink"

const ActionItems: Array<{
  key: ActionKey
  icon: React.ReactNode
  tooltip: string
  isLink?: boolean
}> = [
  {
    key: "onView",
    icon: <SizeIcon />,
    tooltip: "View image",
  },
  {
    key: "onDownload",
    icon: <DownloadIcon />,
    tooltip: "Download image",
  },
  {
    key: "onCopy",
    icon: <ClipboardCopyIcon />,
    tooltip: "Copy image to clipboard",
  },
  {
    key: "onCopyLink",
    icon: <Link2Icon />,
    tooltip: "Copy image link",
    isLink: true,
  },
]

export const ImageActions: React.FC<ImageActionsProps> = ({
  shouldMerge = false,
  isLink = false,
  ...actions
}) => {
  const [isOpen, setIsOpen] = React.useState(false)

  const handleAction = React.useCallback(
    (e: React.MouseEvent, action: (() => void) | undefined) => {
      e.preventDefault()
      e.stopPropagation()
      action?.()
    },
    []
  )

  const filteredActions = React.useMemo(
    () => ActionItems.filter((item) => isLink || !item.isLink),
    [isLink]
  )

  return (
    <ActionWrapper className={cn({ "opacity-100": isOpen })}>
      {shouldMerge ? (
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <ActionButton
              icon={<DotsHorizontalIcon />}
              tooltip="Open menu"
              onClick={(e) => e.preventDefault()}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            {filteredActions.map(({ key, icon, tooltip }) => (
              <DropdownMenuItem
                key={key}
                onClick={(e) => handleAction(e, actions[key])}
              >
                <div className="flex flex-row items-center gap-2">
                  {icon}
                  <span>{tooltip}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        filteredActions.map(({ key, icon, tooltip }) => (
          <ActionButton
            key={key}
            icon={icon}
            tooltip={tooltip}
            onClick={(e) => handleAction(e, actions[key])}
          />
        ))
      )}
    </ActionWrapper>
  )
}

ImageActions.displayName = "ImageActions"
