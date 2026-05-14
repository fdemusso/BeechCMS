import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Branch } from '@beechcms/core'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface EditFieldFormProps {
  index: number
  seedBranches: Branch[]
}

export function EditFieldForm({ index, seedBranches }: EditFieldFormProps) {
  const { t } = useTranslation()
  const { register, watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>()
  const field = watch(`actions.${index}.field` as any) as string
  const actionErrors = (errors.actions as any)?.[index]

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.editField')} *
        </label>
        <Select
          value={field ?? ''}
          onValueChange={(v) => setValue(`actions.${index}.field` as any, v)}
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
        <Input
          {...register(`actions.${index}.value` as any)}
          placeholder={t('automations.actions.editValuePlaceholder')}
          className="h-8 text-sm"
        />
      </div>
    </div>
  )
}
