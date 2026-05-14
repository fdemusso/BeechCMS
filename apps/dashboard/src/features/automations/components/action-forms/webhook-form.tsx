import { useTranslation } from 'react-i18next'
import { useFormContext, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface WebhookFormProps {
  index: number
}

export function WebhookForm({ index }: WebhookFormProps) {
  const { t } = useTranslation()
  const { register, control, watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: `actions.${index}.headers` as any })
  const method = watch(`actions.${index}.method` as any) as string

  const actionErrors = (errors.actions as any)?.[index]

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.webhookUrl')} *
        </label>
        <Input
          {...register(`actions.${index}.url` as any)}
          placeholder="https://example.com/webhook"
          className="h-8 text-sm"
        />
        {actionErrors?.url && (
          <p className="mt-1 text-xs text-destructive">{t(actionErrors.url.message)}</p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.webhookMethod')}
        </label>
        <Select
          value={method ?? 'POST'}
          onValueChange={(v) => setValue(`actions.${index}.method` as any, v)}
        >
          <SelectTrigger size="sm" className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['POST', 'GET', 'PUT'] as const).map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t('automations.actions.webhookHeaders')}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => append({ key: '', value: '' })}
          >
            <Plus className="size-3 mr-1" />
            {t('automations.actions.addHeader')}
          </Button>
        </div>
        {fields.map((field, hIdx) => (
          <div key={field.id} className="flex gap-2 mb-1">
            <Input
              {...register(`actions.${index}.headers.${hIdx}.key` as any)}
              placeholder={t('automations.actions.webhookHeaderKeyPlaceholder')}
              className="h-7 text-xs"
            />
            <Input
              {...register(`actions.${index}.headers.${hIdx}.value` as any)}
              placeholder={t('automations.actions.webhookHeaderValuePlaceholder')}
              className="h-7 text-xs"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => remove(hIdx)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.webhookBody')}
        </label>
        <textarea
          {...register(`actions.${index}.body_template` as any)}
          rows={3}
          placeholder='{"event": "{{trigger_event}}"}'
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <p className="mt-1 text-[10px] text-muted-foreground">{t('automations.actions.templateHint')}</p>
      </div>
    </div>
  )
}
