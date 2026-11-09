// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ComponentType, ReactNode } from 'react'
import { cn } from '../lib/cn.js'

export interface WidgetShellProps {
  children: ReactNode
  className?: string
  bare?: boolean
  title?: string
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
  contentClassName?: string
}

/** Card chrome shared by every widget — built-in or custom. */
export function WidgetShell({
  children,
  className,
  bare = false,
  title,
  icon: Icon,
  action,
  contentClassName,
}: WidgetShellProps) {
  if (bare) {
    return <div className={cn('h-full w-full', className)}>{children}</div>
  }

  const hasHeader = !!(title || Icon || action)

  return (
    <div
      className={cn(
        'h-full w-full flex flex-col',
        'rounded-lg border border-border bg-card overflow-hidden',
        'transition-colors hover:border-border/80',
        'p-5',
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && <Icon className="size-4 text-muted-foreground" />}
            {title && <h3 className="font-heading text-sm font-bold text-foreground truncate">{title}</h3>}
          </div>
          {action && <div className="flex items-center">{action}</div>}
        </div>
      )}
      <div className={cn('flex-1 min-h-0', contentClassName)}>{children}</div>
    </div>
  )
}
