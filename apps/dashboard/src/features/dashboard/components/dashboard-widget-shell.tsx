import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface DashboardWidgetShellProps {
  children: ReactNode
  className?: string
  bare?: boolean
  title?: string
  icon?: LucideIcon
  action?: ReactNode
  contentClassName?: string
}

export function DashboardWidgetShell({
  children,
  className,
  bare = false,
  title,
  icon: Icon,
  action,
  contentClassName,
}: DashboardWidgetShellProps) {
  if (bare) {
    return <div className={cn("h-full w-full", className)}>{children}</div>
  }

  const hasHeader = !!(title || Icon || action)

  return (
    <div
      className={cn(
        "h-full w-full flex flex-col",
        "rounded-2xl border border-neutral-200/80 bg-white/75 backdrop-blur-md overflow-hidden",
        "shadow-[0_1px_3px_0_rgb(0,0,0,0.05),0_1px_2px_-1px_rgb(0,0,0,0.04)]",
        "transition-all duration-200 hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.08),0_2px_4px_-1px_rgb(0,0,0,0.06)]",
        "hover:border-neutral-300/80",
        "dark:border-neutral-700/50 dark:bg-neutral-900/65 dark:hover:border-neutral-600/60",
        "dark:shadow-[0_1px_3px_0_rgb(0,0,0,0.2)] dark:hover:shadow-[0_4px_12px_0_rgb(0,0,0,0.3)]",
        "p-5",
        className
      )}
    >
      {hasHeader && (
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="size-4 text-muted-foreground" />}
            {title && <span className="text-sm font-semibold text-foreground">{title}</span>}
          </div>
          {action && <div className="flex items-center">{action}</div>}
        </div>
      )}
      <div className={cn("flex-1 min-h-0", contentClassName)}>
        {children}
      </div>
    </div>
  )
}
