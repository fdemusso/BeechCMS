// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, beforeEach } from 'vitest'
import {
  getDraftStorageKey,
  saveFormDraft,
  loadFormDraft,
  clearFormDraft,
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

  it('clears saved drafts from localStorage', () => {
    saveFormDraft(seedSlug, { field: 'value' })
    expect(loadFormDraft(seedSlug)).toEqual({ field: 'value' })

    const cleared = clearFormDraft(seedSlug)
    expect(cleared).toBe(true)
    expect(loadFormDraft(seedSlug)).toBeNull()
  })
})
