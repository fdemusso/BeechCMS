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

  // Regression guard: read-only users (lacking content:update) must still inspect entries.
  // The card button must not be disabled by canEdit=false.
  it('calls onEdit when clicked while canEdit is false', () => {
    const onEdit = vi.fn()
    render(
      <KanbanCard model={baseModel} canEdit={false} sortActive={false} onEdit={onEdit} />,
    )
    const button = screen.getByRole('button', { name: 'Test card' })

    fireEvent.click(button)

    expect(button).not.toBeDisabled()
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

  it('applies opacity class when isPending', () => {
    const model = { ...baseModel, isPending: true }
    const { container } = render(
      <KanbanCard model={model} canEdit sortActive={false} onEdit={vi.fn()} />,
    )

    expect(container.querySelector('button')?.className).toContain('opacity-60')
  })

  it('disables the button and ignores clicks when isPending is true', () => {
    const onEdit = vi.fn()
    const model = { ...baseModel, isPending: true }
    render(
      <KanbanCard model={model} canEdit sortActive={false} onEdit={onEdit} />,
    )
    const button = screen.getByRole('button', { name: 'Test card' })

    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(button.getAttribute('aria-disabled')).toBe('true')
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
    expect(header.closest('[class*="text-sky-800"]')).not.toBeNull()
  })

  // Regression guard: FieldDisplay renders a <div>, which is not valid inside <p>;
  // the browser parser closes the paragraph early and React logs a hydration warning.
  it('renders header, subtitle and metadata slots without block elements inside a paragraph', () => {
    const branch: Branch = { id: 'br_02', alias: 'title', type: 'text', label: 'Title' } as Branch
    const model: KanbanCardDisplayModel = {
      ...baseModel,
      slots: {
        header: { branch, value: 'Header value' },
        subtitle: { branch, value: 'Subtitle value' },
        metadata: [{ branch, value: 'Metadata value' }],
      },
    }
    const { container } = render(<KanbanCard model={model} canEdit sortActive={false} onEdit={vi.fn()} />)

    expect(container.querySelector('p div, span div')).toBeNull()
  })
})
