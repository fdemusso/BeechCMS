import type { LucideIcon } from "lucide-react"

interface WidgetEmptyProps {
  icon: LucideIcon
  title: string
  description?: string
}

export function WidgetEmpty({ icon: Icon, title, description }: WidgetEmptyProps) {
  return (
    <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-2 text-center">
      <Icon className="size-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/70">{description}</p>
      )}
    </div>
  )
}
