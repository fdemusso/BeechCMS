// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KanbanCard } from '@/features/content-kanban/components/kanban-card'
import type { KanbanCardDisplayModel } from '@/features/content-kanban/types'

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
    fireEvent.click(screen.getByRole('article'))
    expect(onEdit).toHaveBeenCalledWith('e-1')
  })

  it('does not call onEdit when isDragging', () => {
    const onEdit = vi.fn()
    render(
      <KanbanCard model={baseModel} canEdit sortActive={false} onEdit={onEdit} isDragging />,
    )
    fireEvent.click(screen.getByRole('article'))
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
    expect(container.querySelector('article')?.className).toContain('opacity-60')
  })
})
