// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

interface FieldSpec {
  min: number
  max: number
}

// Day-of-week accepts 0-7: both 0 and 7 mean Sunday, as in standard cron.
const FIELD_SPECS: readonly FieldSpec[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
]

interface ParsedCron {
  minutes: ReadonlySet<number>
  hours: ReadonlySet<number>
  daysOfMonth: ReadonlySet<number>
  months: ReadonlySet<number>
  daysOfWeek: ReadonlySet<number>
  // Standard cron fires on either day field when both are restricted, so the leading `*` must be remembered.
  restrictsDayOfMonth: boolean
  restrictsDayOfWeek: boolean
}

const INTEGER = /^\d+$/

/** Expands `*`, `*\/n`, `a`, `a-b`, `a-b/n` and comma lists into the values they select; null when malformed. */
function parseField(field: string, { min, max }: FieldSpec): Set<number> | null {
  const values = new Set<number>()

  for (const part of field.split(',')) {
    const [rangePart, stepPart, ...extra] = part.split('/')
    if (extra.length > 0) return null

    let step = 1
    if (stepPart !== undefined) {
      if (!INTEGER.test(stepPart)) return null
      step = Number(stepPart)
      if (step <= 0) return null
    }

    let lo: number
    let hi: number
    if (rangePart === '*') {
      lo = min
      hi = max
    } else if (rangePart.includes('-')) {
      const [loText, hiText, ...rest] = rangePart.split('-')
      if (rest.length > 0 || !INTEGER.test(loText) || !INTEGER.test(hiText)) return null
      lo = Number(loText)
      hi = Number(hiText)
    } else {
      // A bare number with a step ("5/15") has no defined range, so it is rejected rather than guessed.
      if (!INTEGER.test(rangePart) || stepPart !== undefined) return null
      lo = Number(rangePart)
      hi = lo
    }

    if (lo < min || hi > max || lo > hi) return null
    for (let value = lo; value <= hi; value += step) values.add(value)
  }

  return values
}

function parseCronExpression(expression: string | null): ParsedCron | null {
  if (!expression) return null
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== FIELD_SPECS.length) return null

  const parsed = fields.map((field, index) => parseField(field, FIELD_SPECS[index]))
  const [minutes, hours, daysOfMonth, months, rawDaysOfWeek] = parsed
  if (!minutes || !hours || !daysOfMonth || !months || !rawDaysOfWeek) return null

  const daysOfWeek = new Set([...rawDaysOfWeek].map((day) => day % 7))
  return {
    minutes,
    hours,
    daysOfMonth,
    months,
    daysOfWeek,
    restrictsDayOfMonth: !fields[2].startsWith('*'),
    restrictsDayOfWeek: !fields[4].startsWith('*'),
  }
}

/** True when the expression is well formed and can fire; the same grammar `cronMatches` evaluates. */
export function isValidCronExpression(expression: string | null): boolean {
  return parseCronExpression(expression) !== null
}

export function cronMatches(expression: string | null, scheduledTime: number): boolean {
  const cron = parseCronExpression(expression)
  if (!cron) return false

  const d = new Date(scheduledTime)
  const dayOfMonthMatches = cron.daysOfMonth.has(d.getUTCDate())
  const dayOfWeekMatches = cron.daysOfWeek.has(d.getUTCDay())
  const dayMatches = cron.restrictsDayOfMonth && cron.restrictsDayOfWeek
    ? dayOfMonthMatches || dayOfWeekMatches
    : dayOfMonthMatches && dayOfWeekMatches

  return (
    cron.minutes.has(d.getUTCMinutes()) &&
    cron.hours.has(d.getUTCHours()) &&
    cron.months.has(d.getUTCMonth() + 1) &&
    dayMatches
  )
}
