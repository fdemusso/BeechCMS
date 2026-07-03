// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { resolveKanbanConfig, resolveKanbanColumns, kanbanColumnFilter } from './kanban.js'
import type { Seed, Branch } from '../../engine/types.js'

const baseSeed: Seed = {
  slug: 'tasks',
  label: 'Tasks',
  displayNameAlias: 'title',
  branches: [],
}

describe('resolveKanbanConfig', () => {
  it('returns incompatible for allowDrafts seeds', () => {
    const seed: Seed = { ...baseSeed, allowDrafts: true, branches: [
      { id: 'br_01', alias: 'state', type: 'text', label: 'State', options: ['todo', 'done'] },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(false)
    expect(result.reason).toBe('drafts-enabled')
    expect(result.candidates).toEqual([])
  })

  it('returns incompatible when no candidate branch exists', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },       // no options → not candidate
      { id: 'br_02', alias: 'body', type: 'richtext', label: 'Body' },
      { id: 'br_03', alias: 'count', type: 'number', label: 'Count' },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(false)
    expect(result.reason).toBe('no-candidate-branch')
  })

  it('accepts text branch with options as candidate', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'priority', type: 'text', label: 'Priority', options: ['low', 'high'] },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(true)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].branchId).toBe('br_01')
    expect(result.candidates[0].type).toBe('text')
  })

  it('rejects text branch without options', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'name', type: 'text', label: 'Name' },
    ] }
    expect(resolveKanbanConfig(seed).compatible).toBe(false)
  })

  it('accepts tags branch as candidate', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'labels', type: 'tags', label: 'Labels' },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(true)
    expect(result.candidates[0].type).toBe('tags')
  })

  it('accepts boolean branch as candidate', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'done', type: 'boolean', label: 'Done' },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(true)
    expect(result.candidates[0].type).toBe('boolean')
  })

  it('excludes status alias even when type would qualify', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'status', type: 'text', label: 'Status', options: ['a', 'b'] },
    ] }
    expect(resolveKanbanConfig(seed).compatible).toBe(false)
  })

  it('excludes richtext, file, number, date, json, relation, repeater', () => {
    const excluded: Branch['type'][] = ['richtext', 'file', 'number', 'date', 'json', 'relation', 'repeater']
    for (const type of excluded) {
      const seed: Seed = { ...baseSeed, branches: [
        { id: 'br_01', alias: 'field', type, label: 'Field' },
      ] }
      expect(resolveKanbanConfig(seed).compatible).toBe(false)
    }
  })

  it('uses branchId not alias in candidates', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_42', alias: 'category', type: 'text', label: 'Category', options: ['a'] },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.candidates[0].branchId).toBe('br_42')
    expect(result.candidates[0].alias).toBe('category')
  })
})

describe('resolveKanbanColumns', () => {
  it('boolean axis: [false, true, null] in order', () => {
    const branch: Branch = { id: 'br_01', alias: 'done', type: 'boolean', label: 'Done' }
    const cols = resolveKanbanColumns(branch)
    expect(cols).toEqual([
      { value: 'false', label: 'No' },
      { value: 'true', label: 'Sì' },
      { value: null, label: 'Senza Done' },
    ])
  })

  it('text axis with options: follows options order, null last', () => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'text', label: 'State', options: ['todo', 'in-progress', 'done'] }
    const cols = resolveKanbanColumns(branch)
    expect(cols.map(c => c.value)).toEqual(['todo', 'in-progress', 'done', null])
  })

  it('tags axis with branch options: uses options order', () => {
    const branch: Branch = { id: 'br_01', alias: 'tags', type: 'tags', label: 'Tags', options: ['b', 'a', 'c'] }
    const cols = resolveKanbanColumns(branch)
    expect(cols.map(c => c.value)).toEqual(['b', 'a', 'c', null])
  })

  it('tags axis without options: sorts distinctTagValues alphabetically', () => {
    const branch: Branch = { id: 'br_01', alias: 'tags', type: 'tags', label: 'Tags' }
    const cols = resolveKanbanColumns(branch, ['zebra', 'apple', 'mango'])
    expect(cols.map(c => c.value)).toEqual(['apple', 'mango', 'zebra', null])
  })

  it('null column always last', () => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'text', label: 'State', options: ['x'] }
    const cols = resolveKanbanColumns(branch)
    expect(cols[cols.length - 1].value).toBeNull()
  })

  it('null column label uses branch label', () => {
    const branch: Branch = { id: 'br_01', alias: 'cat', type: 'tags', label: 'Categoria' }
    const cols = resolveKanbanColumns(branch, [])
    expect(cols[cols.length - 1].label).toBe('Senza Categoria')
  })

  it('omits null column if branch is required on create or update', () => {
    const branchReqCreate: Branch = { id: 'br_01', alias: 'state', type: 'text', label: 'State', options: ['x'], requiredOnCreate: true }
    const colsReqCreate = resolveKanbanColumns(branchReqCreate)
    expect(colsReqCreate.find(c => c.value === null)).toBeUndefined()

    const branchReqUpdate: Branch = { id: 'br_02', alias: 'state', type: 'text', label: 'State', options: ['x'], requiredOnUpdate: true }
    const colsReqUpdate = resolveKanbanColumns(branchReqUpdate)
    expect(colsReqUpdate.find(c => c.value === null)).toBeUndefined()
  })
})

describe('kanbanColumnFilter', () => {
  it('text axis with value → eq on select type', () => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'text', label: 'State', options: ['todo', 'done'] }
    const f = kanbanColumnFilter(branch, 'todo')
    expect(f.column).toBe('state')
    expect(f.type).toBe('select')
    expect(f.conditions).toEqual([{ op: 'eq', value: 'todo' }])
  })

  it('boolean axis with value "true" → eq with boolean true', () => {
    const branch: Branch = { id: 'br_01', alias: 'done', type: 'boolean', label: 'Done' }
    const f = kanbanColumnFilter(branch, 'true')
    expect(f.type).toBe('boolean')
    expect(f.conditions).toEqual([{ op: 'eq', value: true }])
  })

  it('boolean axis with value "false" → eq with boolean false', () => {
    const branch: Branch = { id: 'br_01', alias: 'done', type: 'boolean', label: 'Done' }
    const f = kanbanColumnFilter(branch, 'false')
    expect(f.conditions).toEqual([{ op: 'eq', value: false }])
  })

  it('tags axis with value → has_tag', () => {
    const branch: Branch = { id: 'br_01', alias: 'labels', type: 'tags', label: 'Labels' }
    const f = kanbanColumnFilter(branch, 'frontend')
    expect(f.type).toBe('tags')
    expect(f.conditions).toEqual([{ op: 'has_tag', value: 'frontend' }])
  })

  it('null value (text) → is_empty', () => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'text', label: 'State', options: ['x'] }
    const f = kanbanColumnFilter(branch, null)
    expect(f.column).toBe('state')
    expect(f.conditions).toEqual([{ op: 'is_empty', value: null }])
  })

  it('null value (boolean) → is_empty on boolean type', () => {
    const branch: Branch = { id: 'br_01', alias: 'done', type: 'boolean', label: 'Done' }
    const f = kanbanColumnFilter(branch, null)
    expect(f.type).toBe('boolean')
    expect(f.conditions).toEqual([{ op: 'is_empty', value: null }])
  })

  it('null value (tags) → is_empty on tags type', () => {
    const branch: Branch = { id: 'br_01', alias: 'labels', type: 'tags', label: 'Labels' }
    const f = kanbanColumnFilter(branch, null)
    expect(f.type).toBe('tags')
    expect(f.conditions).toEqual([{ op: 'is_empty', value: null }])
  })
})
