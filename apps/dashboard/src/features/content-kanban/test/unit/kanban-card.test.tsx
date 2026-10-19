// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KanbanCard } from '@/features/content-kanban/components/kanban-card'
import type { KanbanCardDisplayModel } from '@/features/content-kanban/types'
import { getConditionalFormatCardClass } from '@/lib/conditional-format'
import type { Branch } from '@beechcms/core'

const baseModel: KanbanCardDisplayModel = {
  entryId: 'e-1',
  title: 'Test card',
  axisValue: 'open',
  position: null,
}

describe('KanbanCard — legacy render (no slots)', () => {
  it('renders card title', () => {
    render(
      <KanbanCard model={baseModel} canEdit sortActive={false} onEdit={vi.fn()} />,
    )
    expect(screen.getByText('Test card')).toBeTruthy()
  })

  it('calls onEdit when clicked', () => {
    const onEdit = vi.fn()
    render(
      <KanbanCard model={baseModel} canEdit sortActive={false} onEdit={onEdit} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Test card' }))
    expect(onEdit).toHaveBeenCalledWith('e-1')
  })

  it('calls onEdit when clicked in read-only mode (canEdit=false)', () => {
    const onEdit = vi.fn()
    render(
      <KanbanCard model={baseModel} canEdit={false} sortActive={false} onEdit={onEdit} />,
    )
    const button = screen.getByRole('button', { name: 'Test card' })
    expect(button).not.toBeDisabled()
    fireEvent.click(button)
    expect(onEdit).toHaveBeenCalledWith('e-1')
  })

  it('does not call onEdit when isDragging', () => {
    const onEdit = vi.fn()
    render(
      <KanbanCard model={baseModel} canEdit sortActive={false} onEdit={onEdit} isDragging />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Test card' }))
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('renders statusBadge when present', () => {
    const model = { ...baseModel, statusBadge: 'draft' }
    render(
      <KanbanCard model={model} canEdit sortActive={false} onEdit={vi.fn()} />,
    )
    expect(screen.getByText('draft')).toBeTruthy()
  })

  it('disables button and applies opacity class when isPending', () => {
    const onEdit = vi.fn()
    const model = { ...baseModel, isPending: true }
    const { container } = render(
      <KanbanCard model={model} canEdit sortActive={false} onEdit={onEdit} />,
    )
    const button = container.querySelector('button')
    expect(button?.className).toContain('opacity-60')
    expect(button).toBeDisabled()
    expect(button?.getAttribute('aria-disabled')).toBe('true')
    if (button) fireEvent.click(button)
    expect(onEdit).not.toHaveBeenCalled()
  })

  it("puts the tone's card border class on the button when elementStyle is set", () => {
    const model = { ...baseModel, elementStyle: { tone: 'danger' as const, textStyles: [] } }
    const { container } = render(
      <KanbanCard model={model} canEdit sortActive={false} onEdit={vi.fn()} />,
    )

    const button = container.querySelector('button')
    for (const cls of getConditionalFormatCardClass('danger', []).split(' ')) {
      expect(button?.className).toContain(cls)
    }
  })

  it("puts the tone's cell text class on the header line when the header slot carries a style", () => {
    const branch: Branch = { id: 'br_02', alias: 'title', type: 'text', label: 'Title' } as Branch
    const model: KanbanCardDisplayModel = {
      ...baseModel,
      slots: {
        header: { branch, value: 'Header value', style: { tone: 'info', textStyles: [] } },
        metadata: [],
      },
    }
    render(<KanbanCard model={model} canEdit sortActive={false} onEdit={vi.fn()} />)

    const header = screen.getByText('Header value')
    expect(header.closest('p')?.className).toContain('text-sky-800')
  })
})
