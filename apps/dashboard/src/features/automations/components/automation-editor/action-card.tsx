import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import { X, ChevronUp, ChevronDown } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Branch } from '@beechcms/core'
import { WebhookForm } from '../action-forms/webhook-form'
import { SendMailForm } from '../action-forms/send-mail-form'
import { EditFieldForm } from '../action-forms/edit-field-form'
import { CreateEntryForm } from '../action-forms/create-entry-form'
import type { AutomationFormValues } from '../../schema/automation.schema'

const ACTION_BORDER: Record<string, string> = {
  webhook: 'border-l-blue-500',
  send_mail: 'border-l-green-500',
  edit_field: 'border-l-amber-500',
  create_entry: 'border-l-purple-500',
}

interface ActionCardProps {
  index: number
  total: number
  seedBranches: Branch[]
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

export function ActionCard({ index, total, seedBranches, onRemove, onMoveUp, onMoveDown }: ActionCardProps) {
  const { t } = useTranslation()
  const { watch } = useFormContext<AutomationFormValues>()
  const type = watch(`actions.${index}.type` as any) as string

  return (
    <Card className={`border-l-4 ${ACTION_BORDER[type] ?? 'border-l-border'}`}>
      <CardHeader className="flex flex-row items-center justify-between p-3 pb-2">
        <span className="text-sm font-medium">{t(`automations.actions.${type}`)}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onMoveUp}
            disabled={index === 0}
            aria-label="Move up"
          >
            <ChevronUp className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onMoveDown}
            disabled={index === total - 1}
            aria-label="Move down"
          >
            <ChevronDown className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label="Remove action"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        {type === 'webhook' && <WebhookForm index={index} />}
        {type === 'send_mail' && <SendMailForm index={index} />}
        {type === 'edit_field' && <EditFieldForm index={index} seedBranches={seedBranches} />}
        {type === 'create_entry' && <CreateEntryForm index={index} />}
      </CardContent>
    </Card>
  )
}
