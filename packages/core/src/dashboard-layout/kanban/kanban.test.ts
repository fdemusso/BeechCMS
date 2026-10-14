// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { resolveKanbanConfig, resolveKanbanColumns, kanbanColumnFilter, kanbanColumnEntryValue } from './kanban.js'
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
      { id: 'br_01', alias: 'state', type: 'tags', multiple: false, label: 'State', options: [{ value: 'todo', color: '#64748b' }, { value: 'done', color: '#64748b' }] },
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

  it('a text branch is never an axis candidate', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'name', type: 'text', label: 'Name' },
    ] }
    expect(resolveKanbanConfig(seed).compatible).toBe(false)
  })

  it('accepts a single-choice tags branch with options as candidate', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'stage', type: 'tags', multiple: false, label: 'Stage', options: [{ value: 'todo', color: '#64748b' }] },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(true)
    expect(result.candidates[0].type).toBe('tags')
  })

  it('rejects a multiple-choice tags branch as axis candidate', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'labels', type: 'tags', label: 'Labels', options: [{ value: 'todo', color: '#64748b' }] },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(false)
    expect(result.reason).toBe('no-candidate-branch')
  })

  it('rejects a single-choice tags branch without options as axis candidate', () => {
    const seed: Seed = { ...baseSeed, branches: [
      { id: 'br_01', alias: 'topic', type: 'tags', multiple: false, label: 'Topic' },
    ] }
    const result = resolveKanbanConfig(seed)
    expect(result.compatible).toBe(false)
    expect(result.reason).toBe('no-candidate-branch')
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
      { id: 'br_01', alias: 'status', type: 'tags', multiple: false, label: 'Status', options: [{ value: 'a', color: '#64748b' }, { value: 'b', color: '#64748b' }] },
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
      { id: 'br_42', alias: 'category', type: 'tags', multiple: false, label: 'Category', options: [{ value: 'a', color: '#64748b' }] },
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

  it('tags axis with branch options: uses options order', () => {
    const branch: Branch = { id: 'br_01', alias: 'tags', type: 'tags', label: 'Tags', options: ['b', 'a', 'c'].map(value => ({ value, color: '#64748b' })) }
    const cols = resolveKanbanColumns(branch)
    expect(cols.map(c => c.value)).toEqual(['b', 'a', 'c', null])
  })

  it('tags axis columns carry the option color in declared order and the null column has none', () => {
    const branch: Branch = { id: 'br_01', alias: 'stage', type: 'tags', multiple: false, label: 'Stage', options: [
      { value: 'high', color: '#ef4444' },
      { value: 'low', color: '#64748b' },
    ] }
    const cols = resolveKanbanColumns(branch)
    expect(cols).toEqual([
      { value: 'high', label: 'high', color: '#ef4444' },
      { value: 'low', label: 'low', color: '#64748b' },
      { value: null, label: 'Senza Stage' },
    ])
  })

  it('null column always last', () => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'tags', multiple: false, label: 'State', options: [{ value: 'x', color: '#64748b' }] }
    const cols = resolveKanbanColumns(branch)
    expect(cols[cols.length - 1].value).toBeNull()
  })

  it('null column label uses branch label', () => {
    const branch: Branch = { id: 'br_01', alias: 'cat', type: 'tags', multiple: false, label: 'Categoria', options: [{ value: 'x', color: '#64748b' }] }
    const cols = resolveKanbanColumns(branch)
    expect(cols[cols.length - 1].label).toBe('Senza Categoria')
  })

  // A required axis still needs somewhere to show entries whose value was removed from the
  // options; without this column they would match no column and vanish from the board.
  it.each([
    ['requiredOnCreate', { requiredOnCreate: true }],
    ['requiredOnUpdate', { requiredOnUpdate: true }],
  ])('marks the null column as fallback when the branch is %s', (_name, required) => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'tags', multiple: false, label: 'State', options: [{ value: 'x', color: '#64748b' }], ...required }

    const cols = resolveKanbanColumns(branch)

    expect(cols[cols.length - 1]).toEqual({ value: null, label: 'Senza State', fallback: true })
  })

  it('leaves the null column of an optional branch without the fallback flag', () => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'tags', multiple: false, label: 'State', options: [{ value: 'x', color: '#64748b' }] }

    const cols = resolveKanbanColumns(branch)

    expect(cols[cols.length - 1]).toEqual({ value: null, label: 'Senza State' })
  })
})

describe('kanbanColumnFilter', () => {
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

  // Regression guard: with `is_empty` alone, an entry whose value was removed from the options
  // matched no column and vanished from the board.
  it('null value on a tags axis with options → not_in the option values, so obsolete values land there too', () => {
    const branch: Branch = { id: 'br_01', alias: 'state', type: 'tags', multiple: false, label: 'State', options: [{ value: 'todo', color: '#64748b' }, { value: 'done', color: '#10b981' }] }

    const f = kanbanColumnFilter(branch, null)

    expect(f).toEqual({ column: 'state', type: 'tags', conditions: [{ op: 'not_in', value: ['todo', 'done'] }] })
  })

  it('null value (boolean) → is_empty on boolean type', () => {
    const branch: Branch = { id: 'br_01', alias: 'done', type: 'boolean', label: 'Done' }
    const f = kanbanColumnFilter(branch, null)
    expect(f.type).toBe('boolean')
    expect(f.conditions).toEqual([{ op: 'is_empty', value: null }])
  })

  it('null value on a tags axis without options → is_empty on tags type', () => {
    const branch: Branch = { id: 'br_01', alias: 'labels', type: 'tags', label: 'Labels' }
    const f = kanbanColumnFilter(branch, null)
    expect(f.type).toBe('tags')
    expect(f.conditions).toEqual([{ op: 'is_empty', value: null }])
  })
})

describe('kanbanColumnEntryValue', () => {
  const tagsBranch: Branch = { id: 'br_01', alias: 'priority', type: 'tags', multiple: false, label: 'Priority', options: [{ value: 'high', color: '#ef4444' }] }
  const booleanBranch: Branch = { id: 'br_02', alias: 'done', type: 'boolean', label: 'Done' }

  it.each([
    ['tags column value → one-element array', tagsBranch, 'high', ['high']],
    ['tags null column → empty array', tagsBranch, null, []],
    ['boolean "true" → true', booleanBranch, 'true', true],
    ['boolean "false" → false', booleanBranch, 'false', false],
    ['boolean null column → null', booleanBranch, null, null],
  ])('%s', (_name, branch, columnValue, expected) => {
    const result = kanbanColumnEntryValue(branch, columnValue)

    expect(result).toEqual(expected)
  })
})
