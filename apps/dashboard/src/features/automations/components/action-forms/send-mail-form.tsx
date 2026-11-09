// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface SendMailFormProps {
  index: number
}

export function SendMailForm({ index }: SendMailFormProps) {
  const { t } = useTranslation()
  const baseId = useId()
  const { register, formState: { errors } } = useFormContext<AutomationFormValues>()
  const actionErrors = (errors.actions as any)?.[index]

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={`${baseId}-to`} className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.mailTo')} *
        </label>
        <Input
          id={`${baseId}-to`}
          {...register(`actions.${index}.to` as any)}
          type="email"
          placeholder={t('automations.actions.mailToPlaceholder')}
          className="h-8 text-sm"
        />
        {actionErrors?.to && (
          <p className="mt-1 text-xs text-status-danger-foreground">{t(actionErrors.to.message)}</p>
        )}
      </div>

      <div>
        <label htmlFor={`${baseId}-subject`} className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.mailSubject')} *
        </label>
        <Input
          id={`${baseId}-subject`}
          {...register(`actions.${index}.subject_template` as any)}
          placeholder={t('automations.actions.mailSubjectPlaceholder')}
          className="h-8 text-sm"
        />
        {actionErrors?.subject_template && (
          <p className="mt-1 text-xs text-status-danger-foreground">{t(actionErrors.subject_template.message)}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{t('automations.actions.templateHint')}</p>
      </div>

      <div>
        <label htmlFor={`${baseId}-body`} className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.mailBody')} *
        </label>
        <textarea
          id={`${baseId}-body`}
          {...register(`actions.${index}.body_template` as any)}
          rows={4}
          placeholder={t('automations.actions.mailBodyPlaceholder')}
          className="w-full rounded-control border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {actionErrors?.body_template && (
          <p className="mt-1 text-xs text-status-danger-foreground">{t(actionErrors.body_template.message)}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{t('automations.actions.templateHint')}</p>
      </div>
    </div>
  )
}
