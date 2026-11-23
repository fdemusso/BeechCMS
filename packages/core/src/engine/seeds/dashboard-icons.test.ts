// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  DASHBOARD_ICON_NAMES,
  DEFAULT_DASHBOARD_ICON,
  closestDashboardIconNames,
  isDashboardIconName,
} from './dashboard-icons.js'

describe('DASHBOARD_ICON_NAMES', () => {
  it('lists every name once and includes the default icon', () => {
    expect(new Set(DASHBOARD_ICON_NAMES).size).toBe(DASHBOARD_ICON_NAMES.length)
    expect(DASHBOARD_ICON_NAMES).toContain(DEFAULT_DASHBOARD_ICON)
  })

  it('holds the common names agents pick that the dashboard used to render as a folder', () => {
    expect(DASHBOARD_ICON_NAMES).toEqual(expect.arrayContaining(['Car', 'ClipboardList', 'Warehouse']))
  })
})

describe('isDashboardIconName', () => {
  it('accepts listed names and rejects the rest, including inherited object keys', () => {
    const verdicts = ['Users', 'Car', 'ListChecks', 'users', '', 'constructor', '__proto__'].map(isDashboardIconName)

    expect(verdicts).toEqual([true, true, false, false, false, false, false])
  })
})

describe('closestDashboardIconNames', () => {
  it('ranks a name that contains or is contained in the input first', () => {
    const closest = closestDashboardIconNames('Cars')

    expect(closest[0]).toBe('Car')
  })

  it('matches case-insensitively and falls back to edit distance', () => {
    expect(closestDashboardIconNames('warehous')[0]).toBe('Warehouse')
    expect(closestDashboardIconNames('Uesrs')[0]).toBe('Users')
  })

  it('returns at most `limit` distinct valid names, even for input with no overlap', () => {
    const closest = closestDashboardIconNames('zzzzzz', 3)

    expect(closest).toHaveLength(3)
    expect(new Set(closest).size).toBe(3)
    expect(closest.every(isDashboardIconName)).toBe(true)
  })
})
