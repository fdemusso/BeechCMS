// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

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
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8 text-destructive/60"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" x2="12" y1="8" y2="12" />
        <line x1="12" x2="12.01" y1="16" y2="16" />
      </svg>
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
