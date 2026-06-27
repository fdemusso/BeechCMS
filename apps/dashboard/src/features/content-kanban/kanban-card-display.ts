import type { Branch } from '@beechcms/core'
import type { ContentEntry } from '@/lib/dynamic-columns'
import type { KanbanCardDisplayModel } from './types'

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

/** Build a KanbanCardDisplayModel from an entry (KB-S18). Computed once at fetch time. */
export function buildKanbanCardDisplayModel(
  entry: ContentEntry,
  axisBranch: Branch,
  columnValue: string | null,
): KanbanCardDisplayModel {
  const data = entry.data as Record<string, unknown>
  const titleBranch = Object.keys(data).find(k => !SYSTEM_KEYS.has(k) && typeof data[k] === 'string' && data[k] !== '')
  const title = titleBranch ? toPlainText(data[titleBranch]) : entry.id

  const fileBranch = Object.keys(data).find(k => {
    const v = data[k]; return typeof v === 'string' && (v.includes('/') || v.startsWith('http'))
  })
  const imageUrl = fileBranch ? resolveImageUrl(data[fileBranch]) : undefined

  const pos = (entry as unknown as Record<string, unknown>).position
  const position = typeof pos === 'string' ? pos : null

  return {
    entryId: entry.id,
    title,
    statusBadge: entry.status !== 'published' ? entry.status : undefined,
    imageUrl,
    axisValue: columnValue,
    position,
  }
}
