// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { useFormContext, useFieldArray } from 'react-hook-form'
import { Flash as Zap, Plus, X } from 'reicon-react'
import { Button } from '@/components/ui/button'
import type { Branch } from '@beechcms/core'
import { TriggerSelector } from './trigger-selector'
import { TriggerConditions } from './trigger-conditions'
import { CronSchedulerUi } from './cron-scheduler-ui'
import type { AutomationFormValues } from '../../schema/automation.schema'
import { DEFAULT_TRIGGER_FORM, TRIGGER_EVENTS } from '../../schema/automation.schema'
import type { AutomationTriggerEvent } from '@beechcms/core'

interface TriggerSectionProps {
  seedBranches: Branch[]
}

export function TriggerSection({ seedBranches }: TriggerSectionProps) {
  const { t } = useTranslation()
  const { watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>()

  const { fields, append, remove } = useFieldArray<AutomationFormValues>({
    name: 'triggers',
  })

  const triggers = watch('triggers')
  const selectedEvents = triggers.map((t) => t.event).filter(Boolean) as AutomationTriggerEvent[]
  const availableEvents = TRIGGER_EVENTS.filter((e) => !selectedEvents.includes(e))
  const hasCron = selectedEvents.includes('cron')
  const hasNonCron = selectedEvents.some((e) => e !== 'cron')
  const hasAnySelected = selectedEvents.length > 0

  function handleAddTrigger() {
    append({ ...DEFAULT_TRIGGER_FORM })
  }

  function handleEventChange(index: number, event: AutomationTriggerEvent) {
    setValue(`triggers.${index}.event` as any, event, { shouldValidate: true })
    if (event !== 'cron') {
      setValue(`triggers.${index}.cron` as any, '', { shouldValidate: false })
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="flex size-6 items-center justify-center rounded-full bg-primary/10">
          <Zap className="size-3.5 text-primary" />
        </div>
        <span className="text-sm font-medium">{t('automations.editor.triggerLabel')}</span>
      </div>

      <div className="flex flex-col gap-2">
        {fields.map((field, index) => {
          const triggerEvent = triggers[index]?.event ?? ''
          const isCron = triggerEvent === 'cron'
          const otherSelected = selectedEvents.filter((_, i) => i !== index)
          const allowedForThis = TRIGGER_EVENTS.filter((e) => !otherSelected.includes(e))

          return (
            <div key={field.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <TriggerSelector
                    value={triggerEvent}
                    onChange={(ev) => handleEventChange(index, ev)}
                    allowedEvents={allowedForThis}
                  />
                </div>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-destructive/60 hover:text-destructive"
                    onClick={() => remove(index)}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>

              {isCron && <CronSchedulerUi triggerIndex={index} />}

              {(errors.triggers as any)?.[index]?.event && (
                <p className="text-xs text-destructive">
                  {t((errors.triggers as any)[index].event.message ?? '')}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {availableEvents.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 h-7 px-2 text-xs text-muted-foreground"
          onClick={handleAddTrigger}
        >
          <Plus className="size-3 mr-1" />
          {t('automations.editor.addTrigger')}
        </Button>
      )}

      {(errors.triggers as any)?.message && (
        <p className="mt-1 text-xs text-destructive">{t((errors.triggers as any).message)}</p>
      )}

      {hasAnySelected && (hasNonCron || hasCron) && (
        <TriggerConditions seedBranches={seedBranches} />
      )}
    </div>
  )
}
