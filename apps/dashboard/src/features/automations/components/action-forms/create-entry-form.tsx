import { useTranslation } from 'react-i18next'
import { useFormContext, useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSchema } from '@/features/schema'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface CreateEntryFormProps {
  index: number
}

export function CreateEntryForm({ index }: CreateEntryFormProps) {
  const { t } = useTranslation()
  const { control, watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>()
  const { data: seeds = [] } = useSchema()
  const { fields, append, remove } = useFieldArray({ control, name: `actions.${index}.field_map` as any })
  const seedSlug = watch(`actions.${index}.seed_slug` as any) as string
  const actionErrors = (errors.actions as any)?.[index]

  const targetSeed = seeds.find((s) => s.slug === seedSlug)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.targetSeed')} *
        </label>
        <Select
          value={seedSlug ?? ''}
          onValueChange={(v) => setValue(`actions.${index}.seed_slug` as any, v)}
        >
          <SelectTrigger size="sm" className="h-8 text-sm">
            <SelectValue placeholder={t('automations.actions.targetSeedPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {seeds.map((s) => (
              <SelectItem key={s.slug} value={s.slug}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {actionErrors?.seed_slug && (
          <p className="mt-1 text-xs text-destructive">{actionErrors.seed_slug.message}</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t('automations.actions.fieldMap')}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => append({ targetAlias: '', sourceAlias: '' })}
          >
            <Plus className="size-3 mr-1" />
            {t('automations.actions.addFieldMap')}
          </Button>
        </div>
        {fields.map((field, fIdx) => (
          <div key={field.id} className="flex gap-2 mb-1 items-center">
            <Select
              value={(watch(`actions.${index}.field_map.${fIdx}.targetAlias` as any) as string) ?? ''}
              onValueChange={(v) => setValue(`actions.${index}.field_map.${fIdx}.targetAlias` as any, v)}
            >
              <SelectTrigger size="sm" className="h-7 text-xs flex-1">
                <SelectValue placeholder={t('automations.actions.fieldMapTarget')} />
              </SelectTrigger>
              <SelectContent>
                {(targetSeed?.branches ?? []).map((b) => (
                  <SelectItem key={b.alias} value={b.alias}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">←</span>
            <Select
              value={(watch(`actions.${index}.field_map.${fIdx}.sourceAlias` as any) as string) ?? ''}
              onValueChange={(v) => setValue(`actions.${index}.field_map.${fIdx}.sourceAlias` as any, v)}
            >
              <SelectTrigger size="sm" className="h-7 text-xs flex-1">
                <SelectValue placeholder={t('automations.actions.fieldMapSource')} />
              </SelectTrigger>
              <SelectContent>
                {(targetSeed?.branches ?? []).map((b) => (
                  <SelectItem key={b.alias} value={b.alias}>{b.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => remove(fIdx)}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
