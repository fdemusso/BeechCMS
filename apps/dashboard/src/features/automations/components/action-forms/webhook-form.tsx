// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024â€“2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormContext, useFieldArray, Controller } from 'react-hook-form'
import { Plus, Trash2 } from 'reicon-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const LazyJsonCodeEditor = React.lazy(() =>
  import('@/components/fields/edit/json-code-editor').then((m) => ({ default: m.JsonCodeEditor }))
)
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSchema } from '@/features/shared'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface WebhookFormProps {
  index: number
  triggerSeedSlug?: string
}

export function WebhookForm({ index, triggerSeedSlug }: WebhookFormProps) {
  const { t } = useTranslation()
  const { register, control, watch, setValue, getValues, formState: { errors } } = useFormContext<AutomationFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: `actions.${index}.headers` as any })
  const method = watch(`actions.${index}.method` as any) as string
  const { data: seeds = [] } = useSchema()

  const actionErrors = (errors.actions as any)?.[index]

  useEffect(() => {
    const current = getValues(`actions.${index}.body_template` as any) as string
    if (current && current.trim() !== '') return
    const seed = seeds.find((s) => s.slug === triggerSeedSlug)
    if (!seed) return
    const publicBranches = seed.branches.filter((b: any) => b.policies?.public !== false)
    const obj: Record<string, string> = { id: '{{id}}' }
    for (const b of publicBranches) obj[b.alias] = `{{${b.alias}}}`
    setValue(`actions.${index}.body_template` as any, JSON.stringify(obj, null, 2))
  }, [index, triggerSeedSlug, seeds, getValues, setValue])

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
          {t('automations.actions.webhookBody')} *
        </label>
        <Controller
          control={control}
          name={`actions.${index}.body_template` as any}
          render={({ field }) => (
            <React.Suspense fallback={<div className="h-40 w-full animate-pulse rounded-md bg-muted/50 border border-input" />}>
              <LazyJsonCodeEditor
                id={`webhook-body-${index}`}
                value={field.value ?? ''}
                onChange={field.onChange}
                className="text-xs"
              />
            </React.Suspense>
          )}
        />
        {actionErrors?.body_template && (
          <p className="mt-1 text-xs text-destructive">{t(actionErrors.body_template.message)}</p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">{t('automations.actions.templateHint')}</p>
      </div>

      <div className="rounded-md bg-muted/50 border border-border px-3 py-2 text-[10px] text-muted-foreground">
        {t('automations.actions.webhookSecretHint')}
      </div>
    </div>
  )
}
