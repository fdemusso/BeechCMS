// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { AlertCircle } from 'lucide-react'
import { cn } from '../lib/cn.js'

export interface WidgetErrorProps {
  message?: string
  onRetry?: () => void
  /** Label for the retry button. Default: "Retry". */
  retryLabel?: string
}

/**
 * Error state shown by a widget when its data fetch fails. Authors that
 * need localized copy should pass `message`/`retryLabel` explicitly — this
 * component has no i18n dependency.
 */
export function WidgetError({ message = 'Something went wrong.', onRetry, retryLabel = 'Retry' }: WidgetErrorProps) {
  return (
    <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-3 text-center">
      <AlertCircle className="size-8 text-destructive/60" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            'inline-flex h-6 shrink-0 items-center justify-center gap-1.5 rounded-md border bg-background px-2',
            'text-xs font-medium shadow-xs transition-all outline-none',
            'hover:bg-accent hover:text-accent-foreground',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
          )}
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}
