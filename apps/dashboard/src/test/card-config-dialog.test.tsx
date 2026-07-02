// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CardConfigDialog } from '@/features/content-kanban/card-config/card-config-dialog'
import { METADATA_SLOT_CAP } from '@beechcms/core'
import type { Seed } from '@beechcms/core'

const eligibleBranch = (id: string, alias: string, label: string, type = 'text') =>
  ({ id, alias, label, type, policies: {} }) as any

const seed: Seed = {
  slug: 'articles',
  label: 'Articles',
  labelPlural: 'Articles',
  allowDrafts: false,
  branches: [
    eligibleBranch('br_01', 'title', 'Title'),
    eligibleBranch('br_02', 'cover', 'Cover', 'file'),
    eligibleBranch('br_03', 'category', 'Category', 'text'),
    eligibleBranch('br_04', 'tags', 'Tags', 'text'),
    { id: 'br_rt', alias: 'body', label: 'Body', type: 'richtext', policies: {} } as any,
    { id: 'br_js', alias: 'meta', label: 'Meta', type: 'json', policies: {} } as any,
    { id: 'br_rp', alias: 'items', label: 'Items', type: 'repeater', policies: {} } as any,
  ],
} as any

function renderDialog(onSave = vi.fn()) {
  return render(
    <CardConfigDialog open onClose={vi.fn()} seed={seed} config={undefined} onSave={onSave} />,
  )
}

describe('CardConfigDialog', () => {
  it('does not list richtext/json/repeater branches in slot pickers', () => {
    renderDialog()
    expect(screen.queryByText('Body')).toBeNull()
    expect(screen.queryByText('Meta')).toBeNull()
    expect(screen.queryByText('Items')).toBeNull()
  })

  it('lists eligible branches in metadata toggles', () => {
    renderDialog()
    expect(screen.getByText('Title')).toBeTruthy()
    expect(screen.getByText('Cover')).toBeTruthy()
    expect(screen.getByText('Category')).toBeTruthy()
    expect(screen.getByText('Tags')).toBeTruthy()
  })

  it('metadata multi-select stops adding past METADATA_SLOT_CAP', () => {
    renderDialog()
    const branchLabels = ['Title', 'Cover', 'Category', 'Tags']
    const buttons = branchLabels.map(label =>
      screen.getAllByRole('button').find(b => b.textContent === label)!,
    )
    // Click up to the cap
    for (let i = 0; i < METADATA_SLOT_CAP; i++) {
      if (buttons[i]) fireEvent.click(buttons[i]!)
    }
    // The next button beyond cap should be disabled
    const beyond = buttons[METADATA_SLOT_CAP]
    if (beyond) expect(beyond).toBeDisabled()
  })

  it('onSave called with correct KanbanCardConfig shape', () => {
    const onSave = vi.fn()
    render(
      <CardConfigDialog open onClose={vi.fn()} seed={seed} config={undefined} onSave={onSave} />,
    )
    const saveBtn = screen.getByText('Save')
    fireEvent.click(saveBtn)
    expect(onSave).toHaveBeenCalledOnce()
    const [arg] = onSave.mock.calls[0]
    expect(arg).toMatchObject({ version: 1, metadata: expect.any(Array) })
  })
})
