// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDraftStorageKey,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
  purgeStaleFormDrafts,
} from '../core/draft-storage.js'

describe('draft-storage', () => {
  const seedSlug = 'contact-form'

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('generates consistent draft storage keys', () => {
    expect(getDraftStorageKey('test-slug')).toBe('beech_form_draft_test-slug')
  })

  it('saves and loads draft data successfully', () => {
    const values = {
      name: 'Mario Rossi',
      email: 'mario@example.com',
      message: 'Hello world',
    }

    const saved = saveFormDraft(seedSlug, values)
    expect(saved).toBe(true)

    const loaded = loadFormDraft<typeof values>(seedSlug)
    expect(loaded).toEqual(values)
  })

  it('sanitizes and excludes internal keys, honeypots, and file attachments', () => {
    const values = {
      name: 'Mario Rossi',
      _internalToken: 'secret',
      _timeTrap: 12345,
      fax_number: 'spam-decoy',
      avatar: new File([''], 'avatar.png', { type: 'image/png' }),
      document: { filename: 'doc.pdf', mimeType: 'application/pdf', data: 'base64...' },
      note: 'Valid note',
    }

    saveFormDraft(seedSlug, values)

    const loaded = loadFormDraft<Record<string, unknown>>(seedSlug)
    expect(loaded).toEqual({
      name: 'Mario Rossi',
      note: 'Valid note',
    })
  })

  it('returns null when loading non-existent draft', () => {
    const loaded = loadFormDraft('non-existent')
    expect(loaded).toBeNull()
  })

  it('a draft saved with a ttl is dropped from localStorage once it expires', () => {
    saveFormDraft(seedSlug, { name: 'Mario Rossi' }, { ttlMs: 1000, now: 10_000 })

    const loaded = loadFormDraft(seedSlug, { now: 11_001 })

    expect(loaded).toBeNull()
    expect(window.localStorage.getItem(getDraftStorageKey(seedSlug))).toBeNull()
  })

  it('a draft still inside its ttl is loaded', () => {
    saveFormDraft(seedSlug, { name: 'Mario Rossi' }, { ttlMs: 1000, now: 10_000 })

    const loaded = loadFormDraft(seedSlug, { now: 10_999 })

    expect(loaded).toEqual({ name: 'Mario Rossi' })
  })

  it('exclude keeps the named fields out of the stored draft', () => {
    saveFormDraft(seedSlug, { name: 'Mario Rossi', phone: '555-0100' }, { exclude: ['phone'] })

    expect(window.localStorage.getItem(getDraftStorageKey(seedSlug))).not.toContain('555-0100')
  })

  it('a draft written before drafts expired is discarded on load', () => {
    window.localStorage.setItem(getDraftStorageKey(seedSlug), JSON.stringify({ name: 'Mario Rossi' }))

    const loaded = loadFormDraft(seedSlug)

    expect(loaded).toBeNull()
    expect(window.localStorage.getItem(getDraftStorageKey(seedSlug))).toBeNull()
  })

  it('purgeStaleFormDrafts removes expired and legacy drafts of every form and keeps live ones', () => {
    saveFormDraft('expired-form', { a: '1' }, { ttlMs: 1000, now: 1 })
    saveFormDraft('live-form', { b: '2' }, { ttlMs: 1000, now: 10_000 })
    window.localStorage.setItem(getDraftStorageKey('legacy-form'), JSON.stringify({ c: '3' }))
    window.localStorage.setItem('unrelated_key', 'keep')

    purgeStaleFormDrafts({ now: 10_500 })

    expect(window.localStorage.getItem(getDraftStorageKey('expired-form'))).toBeNull()
    expect(window.localStorage.getItem(getDraftStorageKey('legacy-form'))).toBeNull()
    expect(window.localStorage.getItem(getDraftStorageKey('live-form'))).not.toBeNull()
    expect(window.localStorage.getItem('unrelated_key')).toBe('keep')
  })

  it('clears saved drafts from localStorage', () => {
    saveFormDraft(seedSlug, { field: 'value' })
    expect(loadFormDraft(seedSlug)).toEqual({ field: 'value' })

    const cleared = clearFormDraft(seedSlug)
    expect(cleared).toBe(true)
    expect(loadFormDraft(seedSlug)).toBeNull()
  })
})
