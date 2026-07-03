// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { FieldRegistryImpl } from '@/components/fields/field-registry'
import {
  getDisplayComponent,
  getEditComponent,
  fieldRegistry,
} from '@/components/fields/registry'
import { DefaultDisplay, DefaultEdit } from '@/components/fields/default'
import type { BranchType } from '@beechcms/core'

// ─── FieldRegistryImpl ────────────────────────────────────────────────────────

describe('FieldRegistryImpl', () => {
  it('returns undefined for an unregistered display type', () => {
    const registry = new FieldRegistryImpl()
    expect(registry.getDisplay('text')).toBeUndefined()
  })

  it('returns undefined for an unregistered edit type', () => {
    const registry = new FieldRegistryImpl()
    expect(registry.getEdit('number')).toBeUndefined()
  })

  it('returns the component after registerDisplay', () => {
    const registry = new FieldRegistryImpl()
    const FakeDisplay = () => null
    registry.registerDisplay('text', FakeDisplay as any)
    expect(registry.getDisplay('text')).toBe(FakeDisplay)
  })

  it('returns the component after registerEdit', () => {
    const registry = new FieldRegistryImpl()
    const FakeEdit = () => null
    registry.registerEdit('number', FakeEdit as any)
    expect(registry.getEdit('number')).toBe(FakeEdit)
  })

  it('later registerDisplay overwrites an earlier registration for the same type', () => {
    const registry = new FieldRegistryImpl()
    const First = () => null
    const Second = () => null
    registry.registerDisplay('boolean', First as any)
    registry.registerDisplay('boolean', Second as any)
    expect(registry.getDisplay('boolean')).toBe(Second)
  })

  it('later registerEdit overwrites an earlier registration for the same type', () => {
    const registry = new FieldRegistryImpl()
    const First = () => null
    const Second = () => null
    registry.registerEdit('date', First as any)
    registry.registerEdit('date', Second as any)
    expect(registry.getEdit('date')).toBe(Second)
  })

  it('display and edit maps are independent', () => {
    const registry = new FieldRegistryImpl()
    const DisplayComp = () => null
    registry.registerDisplay('json', DisplayComp as any)
    expect(registry.getEdit('json')).toBeUndefined()
  })
})

// ─── registry.ts singleton ────────────────────────────────────────────────────

describe('fieldRegistry singleton (registry.ts)', () => {
  const BUILT_IN_TYPES: BranchType[] = [
    'text', 'number', 'boolean', 'date', 'json', 'richtext', 'file',
  ]

  it('exports fieldRegistry as an object with registerDisplay/registerEdit', () => {
    expect(typeof fieldRegistry.registerDisplay).toBe('function')
    expect(typeof fieldRegistry.registerEdit).toBe('function')
  })

  it.each(BUILT_IN_TYPES)('has a display component registered for "%s"', (type) => {
    expect(fieldRegistry.getDisplay(type)).toBeDefined()
  })

  it.each(BUILT_IN_TYPES)('has an edit component registered for "%s"', (type) => {
    expect(fieldRegistry.getEdit(type)).toBeDefined()
  })
})

// ─── getDisplayComponent / getEditComponent public API ────────────────────────

describe('getDisplayComponent', () => {
  it('returns a registered component for a known type', () => {
    const component = getDisplayComponent('text')
    expect(component).toBeDefined()
    expect(component).not.toBe(DefaultDisplay)
  })

  it('falls back to DefaultDisplay for an unregistered type', () => {
    expect(getDisplayComponent('tags' as BranchType)).toBe(DefaultDisplay)
  })
})

describe('getEditComponent', () => {
  it('returns a registered component for a known type', () => {
    const component = getEditComponent('text')
    expect(component).toBeDefined()
    expect(component).not.toBe(DefaultEdit)
  })

  it('falls back to DefaultEdit for an unregistered type', () => {
    expect(getEditComponent('tags' as BranchType)).toBe(DefaultEdit)
  })
})
