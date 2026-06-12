// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineWidget } from './define-widget.js'
import type { WidgetDefinition } from './widget-definition.js'

function baseDef(type: string): WidgetDefinition<{ label: string }> {
  return {
    type,
    labelKey: 'widgets.example.label',
    category: 'custom',
    configSchema: z.object({ label: z.string() }).catch({ label: '' }),
    defaultConfig: { label: '' },
    component: () => null,
  }
}

describe('defineWidget', () => {
  it('rejects types using the reserved "core/" prefix', () => {
    expect(() => defineWidget(baseDef('core/foo'))).toThrow(/reserved "core\/" prefix/)
  })

  it('rejects malformed types', () => {
    expect(() => defineWidget(baseDef('Not Valid!'))).toThrow(/invalid/)
    expect(() => defineWidget(baseDef(''))).toThrow(/invalid/)
  })

  it('accepts a scoped npm package type', () => {
    const def = baseDef('@acme/thing')
    expect(defineWidget(def)).toBe(def)
  })

  it('accepts a package/sub-name type', () => {
    const def = baseDef('acme-widgets/clock')
    expect(defineWidget(def)).toBe(def)
  })
})
