import { useTranslation } from "react-i18next"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import type { UserViewInstance, ViewType } from "../shared"
import {
  Table,
  Plus,
  LayoutGrid,
  LayoutList,
  PieChart,
} from "lucide-react"

const VIEW_TYPE_ICONS: Record<ViewType, React.ComponentType<{ className?: string }>> = {
  table: Table,
  gallery: LayoutGrid,
  grid: LayoutGrid,
  kanban: LayoutList,
  chart: PieChart,
}

interface ViewSwitcherProps {
  readonly views: UserViewInstance[]
  readonly activeViewId: string
  readonly onChangeView: (viewId: string) => void
  readonly onCreateView?: () => void
}

export function ViewSwitcher({
  views,
  activeViewId,
  onChangeView,
  onCreateView,
}: ViewSwitcherProps) {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      <ToggleGroup
        type="single"
        value={activeViewId}
        onValueChange={(v) => v && onChangeView(v)}
        variant="outline"
        size="sm"
        className="gap-0"
      >
        {views.map((view) => {
          const Icon = VIEW_TYPE_ICONS[view.type]
          return (
            <ToggleGroupItem
              key={view.id}
              value={view.id}
              aria-label={view.label}
              className="h-8 gap-1.5 px-2.5"
            >
              {Icon && <Icon className="size-4 shrink-0" />}
              <span className="truncate max-w-24">{view.label}</span>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 shrink-0"
            aria-label={t("toolbar.viewSwitcher.addView")}
            onClick={() => onCreateView?.()}
          >
            <Plus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("toolbar.viewSwitcher.addView")}</TooltipContent>
      </Tooltip>
    </div>
  )
}
