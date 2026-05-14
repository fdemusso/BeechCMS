import { useTranslation } from 'react-i18next'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { Automation } from '@beechcms/core'

interface AutomationRowProps {
  automation: Automation
  onEdit: () => void
  onDelete: () => void
  onToggle: (enabled: boolean) => void
  isToggling: boolean
}

export function AutomationRow({ automation, onEdit, onDelete, onToggle, isToggling }: AutomationRowProps) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 py-3 px-1 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{automation.name}</p>
        <p className="text-xs text-muted-foreground">{t(`automations.triggers.${automation.trigger_event}`)}</p>
      </div>
      <Switch
        checked={automation.enabled}
        onCheckedChange={onToggle}
        disabled={isToggling}
        aria-label={t('automations.panel.toggleAriaLabel')}
      />
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={onEdit}
        aria-label={t('common.edit')}
      >
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-destructive hover:text-destructive"
        onClick={onDelete}
        aria-label={t('common.delete')}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  )
}
