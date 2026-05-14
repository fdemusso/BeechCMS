import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import { Zap } from 'lucide-react'
import { Input } from '@/components/ui/input'
import type { Branch } from '@beechcms/core'
import { TriggerSelector } from './trigger-selector'
import { TriggerConditions } from './trigger-conditions'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface TriggerSectionProps {
  seedBranches: Branch[]
}

export function TriggerSection({ seedBranches }: TriggerSectionProps) {
  const { t } = useTranslation()
  const { watch, setValue, register, formState: { errors } } = useFormContext<AutomationFormValues>()
  const triggerEvent = watch('trigger_event')
  const isCron = triggerEvent === 'cron'

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
          <Zap className="size-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium">{t('automations.editor.triggerLabel')}</span>
      </div>

      <TriggerSelector
        value={triggerEvent ?? ''}
        onChange={(ev) => setValue('trigger_event', ev, { shouldValidate: true })}
      />

      {errors.trigger_event && (
        <p className="mt-1 text-xs text-destructive">{t(errors.trigger_event.message ?? '')}</p>
      )}

      {isCron && (
        <div className="mt-3">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {t('automations.editor.cronExpression')}
          </label>
          <Input
            {...register('trigger_cron')}
            placeholder="0 9 * * 1"
            className="h-8 text-sm font-mono"
          />
          {errors.trigger_cron && (
            <p className="mt-1 text-xs text-destructive">{t(errors.trigger_cron.message ?? '')}</p>
          )}
          <p className="mt-1 text-[10px] text-muted-foreground">{t('automations.editor.cronHint')}</p>
        </div>
      )}

      {!isCron && triggerEvent && (
        <TriggerConditions seedBranches={seedBranches} />
      )}
    </div>
  )
}
