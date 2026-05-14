import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import { Trash2 } from 'lucide-react'
import { SEED_REGISTRY } from '@beechcms/core'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { AutomationFormValues, ContextSelectorKind } from '../../schema/automation.schema'

interface ContextLoadCardProps {
  index: number
  onRemove: () => void
}

const SELECTOR_KINDS: ContextSelectorKind[] = ['lastone', 'firstone', 'all', 'byid']

export function ContextLoadCard({ index, onRemove }: ContextLoadCardProps) {
  const { t } = useTranslation()
  const { register, watch, setValue } = useFormContext<AutomationFormValues>()
  const selectorKind = watch(`context.${index}.selector_kind`)
  const seeds = Object.values(SEED_REGISTRY)

  return (
    <div className="border rounded-md p-3 flex flex-col gap-3 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t('automations.context.load')} #{index + 1}
        </span>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Variable name */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('automations.context.as')}</Label>
          <Input
            {...register(`context.${index}.as`)}
            placeholder="myVariable"
            className="h-7 text-xs"
          />
        </div>

        {/* Seed picker */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('automations.context.seed')}</Label>
          <Select
            value={watch(`context.${index}.seed_slug`)}
            onValueChange={(v) => setValue(`context.${index}.seed_slug`, v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder={t('automations.context.seedPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {seeds.map((s) => (
                <SelectItem key={s.slug} value={s.slug} className="text-xs">
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Selector */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('automations.context.selector')}</Label>
          <Select
            value={selectorKind}
            onValueChange={(v) => setValue(`context.${index}.selector_kind`, v as ContextSelectorKind)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SELECTOR_KINDS.map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {t(`automations.context.selector.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* byid value — shown only when selector is byid */}
        {selectorKind === 'byid' && (
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t('automations.context.byidValue')}</Label>
            <Input
              {...register(`context.${index}.byid_value`)}
              placeholder="entry-id or {{this.id}}"
              className="h-7 text-xs font-mono"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* Order by */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('automations.context.orderBy')}</Label>
          <Input
            {...register(`context.${index}.order_by`)}
            placeholder="created_at"
            className="h-7 text-xs"
          />
        </div>

        {/* Limit */}
        <div className="flex flex-col gap-1">
          <Label className="text-xs">{t('automations.context.limit')}</Label>
          <Input
            {...register(`context.${index}.limit`, { valueAsNumber: true })}
            type="number"
            min={1}
            max={1000}
            className="h-7 text-xs"
          />
        </div>
      </div>
    </div>
  )
}
