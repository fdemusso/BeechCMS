// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useFormContext } from 'react-hook-form'
import { Clock, Sun, Calendar, CalendarDays, Terminal } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { AutomationFormValues } from '../../schema/automation.schema'

export type CronPreset = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'advanced'

export function parseCronToState(cron: string) {
  if (!cron || !cron.trim()) {
    return { preset: 'daily' as CronPreset, hour: '09', minute: '00', dayOfWeek: '1', dayOfMonth: '1' }
  }
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) {
    return { preset: 'advanced' as CronPreset, hour: '09', minute: '00', dayOfWeek: '1', dayOfMonth: '1' }
  }
  const [min, hr, dom, mon, dow] = parts

  if (min === '0' && hr === '*' && dom === '*' && mon === '*' && dow === '*') {
    return { preset: 'hourly' as CronPreset, hour: '00', minute: '00', dayOfWeek: '1', dayOfMonth: '1' }
  }

  const isNumericMin = /^\d+$/.test(min)
  const isNumericHr = /^\d+$/.test(hr)
  const paddedMin = isNumericMin ? min.padStart(2, '0') : '00'
  const paddedHr = isNumericHr ? hr.padStart(2, '0') : '09'

  if (isNumericMin && isNumericHr && dom === '*' && mon === '*' && dow === '*') {
    return { preset: 'daily' as CronPreset, hour: paddedHr, minute: paddedMin, dayOfWeek: '1', dayOfMonth: '1' }
  }

  if (isNumericMin && isNumericHr && dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
    return { preset: 'weekly' as CronPreset, hour: paddedHr, minute: paddedMin, dayOfWeek: dow, dayOfMonth: '1' }
  }

  if (isNumericMin && isNumericHr && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return { preset: 'monthly' as CronPreset, hour: paddedHr, minute: paddedMin, dayOfWeek: '1', dayOfMonth: dom }
  }

  return { preset: 'advanced' as CronPreset, hour: paddedHr, minute: paddedMin, dayOfWeek: '1', dayOfMonth: '1' }
}

interface CronSchedulerUiProps {
  triggerIndex: number
}

export function CronSchedulerUi({ triggerIndex }: CronSchedulerUiProps) {
  const { t } = useTranslation()
  const { watch, setValue, register, formState: { errors } } = useFormContext<AutomationFormValues>()

  const cronField = `triggers.${triggerIndex}.cron` as const
  const currentCron = watch(cronField as any) as string ?? ''
  const cronError = (errors.triggers as any)?.[triggerIndex]?.cron

  const [state, setState] = useState(() => parseCronToState(currentCron || ''))

  useEffect(() => {
    if (currentCron) {
      const parsed = parseCronToState(currentCron)
      setState((prev) => {
        if (!prev.preset || prev.preset === 'advanced' || currentCron.trim() === '') {
          return parsed
        }
        return prev
      })
    }
  }, [currentCron])

  useEffect(() => {
    if (state.preset !== 'advanced') {
      let expr = ''
      if (state.preset === 'hourly') {
        expr = '0 * * * *'
      } else if (state.preset === 'daily') {
        expr = `${Number(state.minute)} ${Number(state.hour)} * * *`
      } else if (state.preset === 'weekly') {
        expr = `${Number(state.minute)} ${Number(state.hour)} * * ${state.dayOfWeek}`
      } else if (state.preset === 'monthly') {
        expr = `${Number(state.minute)} ${Number(state.hour)} ${state.dayOfMonth} * *`
      }

      if (currentCron !== expr) {
        setValue(cronField as any, expr, { shouldValidate: true })
      }
    }
  }, [state.preset, state.hour, state.minute, state.dayOfWeek, state.dayOfMonth, setValue, currentCron, cronField])

  function updateSchedule(updates: Partial<typeof state>) {
    setState((prev) => ({ ...prev, ...updates }))
  }

  const presets: { id: CronPreset; labelKey: string; icon: any }[] = [
    { id: 'hourly', labelKey: 'presetHourly', icon: Clock },
    { id: 'daily', labelKey: 'presetDaily', icon: Sun },
    { id: 'weekly', labelKey: 'presetWeekly', icon: CalendarDays },
    { id: 'monthly', labelKey: 'presetMonthly', icon: Calendar },
    { id: 'advanced', labelKey: 'presetAdvanced', icon: Terminal },
  ]

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
  const minutes = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']
  const daysOfWeek = [
    { value: '1', label: t('automations.editor.cron.days.1') },
    { value: '2', label: t('automations.editor.cron.days.2') },
    { value: '3', label: t('automations.editor.cron.days.3') },
    { value: '4', label: t('automations.editor.cron.days.4') },
    { value: '5', label: t('automations.editor.cron.days.5') },
    { value: '6', label: t('automations.editor.cron.days.6') },
    { value: '0', label: t('automations.editor.cron.days.0') },
  ]
  const daysOfMonth = Array.from({ length: 31 }, (_, i) => String(i + 1))

  return (
    <div className="mt-3">
      <label className="text-xs font-medium text-muted-foreground mb-1 block">
        {t('automations.editor.cron.title')}
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        {presets.map((p) => {
          const Icon = p.icon
          const isActive = state.preset === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => updateSchedule({ preset: p.id })}
              className={cn(
                'flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs font-medium transition-all relative overflow-hidden select-none cursor-pointer',
                isActive
                  ? 'bg-primary border-primary text-primary-foreground shadow-xs'
                  : 'bg-background hover:bg-muted/50 border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className={cn('size-4 mb-1.5 transition-transform', isActive ? 'scale-110' : '')} />
              <span className="text-[11px] text-center leading-tight">
                {t(`automations.editor.cron.${p.labelKey}`)}
              </span>
            </button>
          )
        })}
      </div>

      {state.preset !== 'hourly' && state.preset !== 'advanced' && (
        <div className="mt-3 p-3 rounded-lg bg-secondary/30 dark:bg-secondary/10 border border-secondary flex flex-wrap items-center gap-4 animate-in fade-in-50 duration-200">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">
              {t('automations.editor.cron.timeLabel')}
            </label>
            <div className="flex items-center gap-1">
              <Select value={state.hour} onValueChange={(v) => updateSchedule({ hour: v })}>
                <SelectTrigger className="h-8 w-18 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-48">
                  {hours.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground font-bold">:</span>
              <Select value={state.minute} onValueChange={(v) => updateSchedule({ minute: v })}>
                <SelectTrigger className="h-8 w-18 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-48">
                  {minutes.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {state.preset === 'weekly' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                {t('automations.editor.cron.dayOfWeekLabel')}
              </label>
              <Select value={state.dayOfWeek} onValueChange={(v) => updateSchedule({ dayOfWeek: v })}>
                <SelectTrigger className="h-8 w-32 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-48">
                  {daysOfWeek.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {state.preset === 'monthly' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                {t('automations.editor.cron.dayOfMonthLabel')}
              </label>
              <Select value={state.dayOfMonth} onValueChange={(v) => updateSchedule({ dayOfMonth: v })}>
                <SelectTrigger className="h-8 w-20 text-xs bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="max-h-48">
                  {daysOfMonth.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      {state.preset === 'advanced' && (
        <div className="mt-3 p-3 rounded-lg bg-secondary/30 dark:bg-secondary/10 border border-secondary animate-in fade-in-50 duration-200">
          <Input
            {...register(cronField as any)}
            placeholder="0 9 * * 1"
            className="h-8 text-sm font-mono bg-background"
          />
          {cronError && (
            <p className="mt-1 text-xs text-destructive">{t(cronError.message ?? '')}</p>
          )}
          <p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
            {t('automations.editor.cronHint')}
          </p>
        </div>
      )}

      {state.preset !== 'advanced' && cronError && (
        <p className="mt-1.5 text-xs text-destructive px-1">{t(cronError.message ?? '')}</p>
      )}
    </div>
  )
}
