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
import { useSchema } from '@/features/schema'
import { TRIGGER_OPS } from '../../schema/automation.schema'
import type { AutomationFormValues } from '../../schema/automation.schema'

interface SetVariableFormProps {
  index: number
}

export function SetVariableForm({ index }: SetVariableFormProps) {
  const { t } = useTranslation()
  const { register, control, watch, setValue, formState: { errors } } = useFormContext<AutomationFormValues>()
  const { data: seeds = [] } = useSchema()
  const { fields, append, remove } = useFieldArray({ control, name: `actions.${index}.filters` as any })

  const seedSlug = watch(`actions.${index}.seed_slug` as any) as string
  const loadType = watch(`actions.${index}.load_type` as any) as string
  const actionErrors = (errors.actions as any)?.[index]

  const targetSeed = seeds.find((s) => s.slug === seedSlug)

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.variableName')} *
        </label>
        <Input
          {...register(`actions.${index}.name` as any)}
          placeholder="cliente"
          className="h-8 text-sm font-mono"
        />
        {actionErrors?.name && (
          <p className="mt-1 text-xs text-destructive">{t(actionErrors.name.message)}</p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">{t('automations.actions.variableNameHint')}</p>
      </div>

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
          <p className="mt-1 text-xs text-destructive">{t(actionErrors.seed_slug.message)}</p>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {t('automations.actions.loadType')}
        </label>
        <Select
          value={loadType ?? 'fruit'}
          onValueChange={(v) => setValue(`actions.${index}.load_type` as any, v)}
        >
          <SelectTrigger size="sm" className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fruit">{t('automations.actions.loadTypeFruit')}</SelectItem>
            <SelectItem value="branch">{t('automations.actions.loadTypeBranch')}</SelectItem>
          </SelectContent>
        </Select>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {loadType === 'branch'
            ? t('automations.actions.loadTypeBranchHint')
            : t('automations.actions.loadTypeFruitHint')}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t('automations.actions.filters')}
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => append({ field: '', op: 'eq', value: '' })}
          >
            <Plus className="size-3 mr-1" />
            {t('automations.editor.addCondition')}
          </Button>
        </div>
        {fields.map((field, fIdx) => {
          const fieldAlias = watch(`actions.${index}.filters.${fIdx}.field` as any) as string
          const op = watch(`actions.${index}.filters.${fIdx}.op` as any) as string
          const showValue = op !== 'isempty' && op !== 'isnotempty'

          return (
            <div key={field.id} className="flex gap-1.5 items-center mb-1.5">
              <Select
                value={fieldAlias ?? ''}
                onValueChange={(v) => setValue(`actions.${index}.filters.${fIdx}.field` as any, v)}
              >
                <SelectTrigger size="sm" className="h-7 text-xs flex-1">
                  <SelectValue placeholder={t('automations.editor.conditionField')} />
                </SelectTrigger>
                <SelectContent>
                  {(targetSeed?.branches ?? []).map((b) => (
                    <SelectItem key={b.alias} value={b.alias}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={op ?? 'eq'}
                onValueChange={(v) => setValue(`actions.${index}.filters.${fIdx}.op` as any, v)}
              >
                <SelectTrigger size="sm" className="h-7 text-xs w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPS.map((o) => (
                    <SelectItem key={o} value={o}>{t(`automations.ops.${o}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {showValue && (
                <Input
                  {...register(`actions.${index}.filters.${fIdx}.value` as any)}
                  placeholder="{{this.field}}"
                  className="h-7 text-xs flex-1 font-mono"
                />
              )}

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
          )
        })}
        {fields.length === 0 && (
          <p className="text-[10px] text-muted-foreground">{t('automations.actions.noFilters')}</p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">{t('automations.actions.filterTemplateHint')}</p>
      </div>
    </div>
  )
}
