import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface DashboardWidgetShellProps {
  children: ReactNode
  className?: string
  /** Set to false to strip all padding/glass — useful for media widgets or custom layouts */
  bare?: boolean
}

/**
 * DashboardWidgetShell — the standard visual container for all
 * BeechCMS dashboard widgets.
 *
 * Provides consistent glassmorphism styling (blurred background,
 * subtle border, rounded corners) so individual widgets only need
 * to worry about their content, not their container aesthetics.
 *
 * Usage:
 * ```tsx
 * export function MyWidget() {
 *   return (
 *     <DashboardWidgetShell>
 *       <p>My content here</p>
 *     </DashboardWidgetShell>
 *   )
 * }
 * ```
 *
 * For widgets that manage their own outer container (e.g. a full-bleed
 * image gallery), set `bare` to skip all wrapping styles.
 */
export function DashboardWidgetShell({
  children,
  className,
  bare = false,
}: DashboardWidgetShellProps) {
  if (bare) {
    return <div className={cn("h-full w-full", className)}>{children}</div>
  }

  return (
    <div
      className={cn(
        // Layout
        "h-full w-full",
        // Glass card styling — BeechCMS standard
        "rounded-xl border border-neutral-200/60 bg-background/50 backdrop-blur-sm",
        "shadow-sm transition-shadow hover:shadow-md",
        "dark:border-neutral-800/60 dark:bg-neutral-900/40",
        // Padding
        "p-4",
        className
      )}
    >
      {children}
    </div>
  )
}
