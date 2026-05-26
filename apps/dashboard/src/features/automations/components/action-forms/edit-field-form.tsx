// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Branch } from '@beechcms/core'
import type { AutomationFormValues } from '../../schema/automation.schema'
import { AutomationValueInput } from '../automation-editor/automation-value-input'

interface EditFieldFormProps {
  index: number
  seedBranches: Branch[]
}

export function EditFieldForm({ index, seedBranches }: EditFieldFormProps) {
  const { t } = useTranslation()
  const { watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>()
  const field = watch(`actions.${index}.field` as any) as string
  const value = watch(`actions.${index}.value` as any) as string
  const actionErrors = (errors.actions as any)?.[index]

  const selectedBranch: Branch | undefined = seedBranches.find((b) => b.alias === field)

  function handleFieldChange(alias: string) {
    setValue(`actions.${index}.field` as any, alias)
    setValue(`actions.${index}.value` as any, '')
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.editField')} *
        </label>
        <Select
          value={field ?? ''}
          onValueChange={handleFieldChange}
        >
          <SelectTrigger size="sm" className="h-8 text-sm">
            <SelectValue placeholder={t('automations.actions.editFieldPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {seedBranches.map((b) => (
              <SelectItem key={b.alias} value={b.alias}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {actionErrors?.field && (
          <p className="mt-1 text-xs text-destructive">{t(actionErrors.field.message)}</p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.editValue')}
        </label>
        <AutomationValueInput
          branch={selectedBranch}
          value={value ?? ''}
          onChange={(v) => setValue(`actions.${index}.value` as any, v)}
          className="h-8 flex-1"
        />
      </div>
    </div>
  )
}
