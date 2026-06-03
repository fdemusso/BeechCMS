// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function InputGroupButton({
  className,
  size = "icon-xs",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="input-group-button"
      size={size}
      className={cn(className)}
      {...props}
    />
  )
}

export { InputGroupButton }
