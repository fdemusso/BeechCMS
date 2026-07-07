import type { Seed, Branch, KanbanCardConfig } from '@beechcms/core'
import { findBranchById } from '@beechcms/core'
import type { ContentEntry } from '@/lib/dynamic-columns'
import type { KanbanCardDisplayModel, KanbanCardSlots, ResolvedSlotField } from '../types'

function resolveImageUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    try { const p = JSON.parse(value) as unknown; if (p && typeof p === 'object') return resolveImageUrl(p) } catch {}
    return value.trim()
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const url = [obj.url, obj.src, obj.path].find((v): v is string => typeof v === 'string' && v.trim().length > 0)
    return url?.trim()
  }
  return undefined
}

function toPlainText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(toPlainText).join(' ').trim()
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).map(toPlainText).join(' ').trim()
  return ''
}

const SYSTEM_KEYS = new Set(['id', 'slug', 'status', 'created_at', 'updated_at'])

/** Build a KanbanCardDisplayModel from an entry. When card config is present, resolves slots;
 *  otherwise falls back to the legacy heuristic (title/image). */
export function buildKanbanCardDisplayModel(
  entry: ContentEntry,
  axisBranch: Branch,
  columnValue: string | null,
  seed?: Seed,
  card?: KanbanCardConfig,
): KanbanCardDisplayModel {
  const data = entry.data as Record<string, unknown>

  const pos = (entry as unknown as Record<string, unknown>).position
  const position = typeof pos === 'string' ? pos : null

  // Legacy heuristic (backwards compat when no card config)
  const titleBranch = Object.keys(data).find(k => !SYSTEM_KEYS.has(k) && typeof data[k] === 'string' && data[k] !== '')
  const title = titleBranch ? toPlainText(data[titleBranch]) : entry.id

  const fileBranch = Object.keys(data).find(k => {
    const v = data[k]; return typeof v === 'string' && (v.includes('/') || v.startsWith('http'))
  })
  const imageUrl = fileBranch ? resolveImageUrl(data[fileBranch]) : undefined

  let slots: KanbanCardSlots | undefined
  if (card && seed) {
    const resolve = (f?: { branchId: string } | null): ResolvedSlotField | undefined => {
      if (!f) return undefined
      const branch = findBranchById(seed, f.branchId)
      if (!branch) return undefined
      return { branch, value: data[branch.alias] }
    }
    slots = {
      media: resolve(card.media),
      header: resolve(card.header),
      subtitle: resolve(card.subtitle),
      metadata: (card.metadata ?? []).map(resolve).filter((x): x is ResolvedSlotField => x !== undefined),
    }
  }

  return {
    entryId: entry.id,
    title,
    statusBadge: entry.status !== 'published' ? entry.status : undefined,
    imageUrl,
    axisValue: columnValue,
    position,
    slots,
  }
}
