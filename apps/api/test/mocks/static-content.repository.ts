// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import {
  ContentRepository,
  EntryNotFoundError,
  RepositoryError,
  SlugConflictError,
  type BulkFieldUpdate,
  type BatchWrite,
  type RepositoryOptions,
  Seed,
  SelectOptions,
  DraftSummary,
} from '@beechcms/core'

type Entry = Record<string, any>

export class StaticContentRepository implements ContentRepository {
  private readonly tables = new Map<string, Entry[]>()
  private readonly drafts = new Map<string, Map<string, Entry>>()

  constructor(seeds: Seed[]) {
    for (const seed of seeds) {
      this.tables.set(seed.slug, [])
      if (seed.allowDrafts) {
        this.drafts.set(seed.slug, new Map())
      }
    }
  }

  load(seedSlug: string, entries: Entry[]): void {
    this.tables.set(seedSlug, [...entries])
  }

  private getTable(slug: string): Entry[] {
    if (!this.tables.has(slug)) {
      throw new RepositoryError(`Seed "${slug}" not registered in StaticContentRepository`)
    }
    return this.tables.get(slug)!
  }

  async findMany(seed: Seed, options: SelectOptions): Promise<{ items: Entry[]; total: number }> {
    let items = [...this.getTable(seed.slug)]

    if (options.status) {
      items = items.filter((e) => e.status === options.status)
    }

    if (options.filters) {
      for (const filter of options.filters) {
        for (const cond of filter.conditions) {
          items = items.filter((e) => {
            const val = e[filter.column]
            switch (cond.op) {
              case 'eq': return val === cond.value
              case 'neq': return val !== cond.value
              case 'gt': return val > (cond.value as number)
              case 'gte': return val >= (cond.value as number)
              case 'lt': return val < (cond.value as number)
              case 'lte': return val <= (cond.value as number)
              case 'contains': return typeof val === 'string' && val.includes(String(cond.value))
              case 'not_contains': return typeof val === 'string' && !val.includes(String(cond.value))
              case 'starts_with': return typeof val === 'string' && val.startsWith(String(cond.value))
              case 'ends_with': return typeof val === 'string' && val.endsWith(String(cond.value))
              case 'is_empty': return val === null || val === undefined || val === ''
              case 'is_not_empty': return val !== null && val !== undefined && val !== ''
              case 'in': return Array.isArray(cond.value) && (cond.value as any[]).includes(val)
              case 'not_in': return Array.isArray(cond.value) && !(cond.value as any[]).includes(val)
              case 'has_tag': return Array.isArray(val) && val.includes(cond.value)
              case 'has_any_tag': return Array.isArray(val) && Array.isArray(cond.value) && (cond.value as any[]).some((t) => val.includes(t))
              case 'has_all_tags': return Array.isArray(val) && Array.isArray(cond.value) && (cond.value as any[]).every((t) => val.includes(t))
              default: return true
            }
          })
        }
      }
    }

    if (options.search) {
      const q = options.search.toLowerCase()
      items = items.filter((e) =>
        seed.branches.some((b) => typeof e[b.alias] === 'string' && e[b.alias].toLowerCase().includes(q))
      )
    }

    if (options.orderBy) {
      const { column, dir } = options.orderBy
      items.sort((a, b) => {
        const av = a[column]
        const bv = b[column]
        if (av === bv) return 0
        const cmp = av < bv ? -1 : 1
        return dir === 'ASC' ? cmp : -cmp
      })
    }

    const total = items.length

    if (options.pagination) {
      const { limit, offset } = options.pagination
      items = items.slice(offset, offset + limit)
    }

    return { items, total }
  }

  async findById(seed: Seed, id: string): Promise<Entry> {
    const entry = this.getTable(seed.slug).find((e) => e.id === id)
    if (!entry) throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
    return { ...entry }
  }

  async findBySlug(seed: Seed, slug: string): Promise<Entry> {
    const entry = this.getTable(seed.slug).find((e) => e.slug === slug)
    if (!entry) throw new EntryNotFoundError(`Entry with slug "${slug}" not found in ${seed.slug}`)
    return { ...entry }
  }

  async getFacets(seed: Seed): Promise<{ statuses: Record<string, number>; tagsByColumn: Record<string, string[]> }> {
    const items = this.getTable(seed.slug)

    const statuses: Record<string, number> = {}
    for (const e of items) {
      statuses[e.status] = (statuses[e.status] || 0) + 1
    }

    const tagsByColumn: Record<string, string[]> = {}
    for (const branch of seed.branches.filter((b) => b.type === 'tags')) {
      const tags = new Set<string>()
      for (const e of items) {
        const val = e[branch.alias]
        if (Array.isArray(val)) val.forEach((t) => tags.add(t))
      }
      tagsByColumn[branch.alias] = [...tags]
    }

    return { statuses, tagsByColumn }
  }

  async existsSlug(seed: Seed, slug: string, excludeId?: string): Promise<boolean> {
    return this.getTable(seed.slug).some((e) => e.slug === slug && e.id !== excludeId)
  }

  async create(seed: Seed, id: string, slug: string, status: string, data: Record<string, any>, _options?: RepositoryOptions): Promise<void> {
    if (await this.existsSlug(seed, slug)) {
      throw new SlugConflictError(`Slug "${slug}" already exists for ${seed.slug}`)
    }
    const now = Math.floor(Date.now() / 1000)
    this.getTable(seed.slug).push({ id, slug, status, created_at: now, updated_at: now, ...data })
  }

  async update(seed: Seed, id: string, data: Record<string, any>, status?: string, _options?: RepositoryOptions): Promise<void> {
    const table = this.getTable(seed.slug)
    const idx = table.findIndex((e) => e.id === id)
    if (idx === -1) throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
    table[idx] = {
      ...table[idx],
      ...data,
      ...(status ? { status } : {}),
      updated_at: Math.floor(Date.now() / 1000),
    }
  }

  async delete(seed: Seed, id: string, _options?: RepositoryOptions): Promise<{ row: Entry }> {
    const table = this.getTable(seed.slug)
    const idx = table.findIndex((e) => e.id === id)
    if (idx === -1) throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
    const [row] = table.splice(idx, 1)
    return { row }
  }

  async mutateField(
    seed: Seed,
    id: string,
    fieldName: string,
    operation: { type: 'increment' | 'decrement'; value: number },
    options?: { min?: number; max?: number }
  ): Promise<{ newValue: number }> {
    const branch = seed.branches.find((b) => b.alias === fieldName)
    if (!branch || branch.type !== 'number') {
      throw new RepositoryError(`mutateField: '${fieldName}' non e un campo numerico di ${seed.slug}`)
    }

    const table = this.getTable(seed.slug)
    const idx = table.findIndex((e) => e.id === id)
    if (idx === -1) throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)

    const delta = operation.type === 'increment' ? operation.value : -operation.value
    const current = Number(table[idx][fieldName] ?? 0)
    const newValue = current + delta

    if (options?.min !== undefined && newValue < options.min) {
      throw new RepositoryError(`Operazione atomica fallita: record non trovato o limite superato per ${fieldName}`)
    }
    if (options?.max !== undefined && newValue > options.max) {
      throw new RepositoryError(`Operazione atomica fallita: record non trovato o limite superato per ${fieldName}`)
    }

    table[idx] = { ...table[idx], [fieldName]: newValue, updated_at: Math.floor(Date.now() / 1000) }
    return { newValue }
  }

  async updateWithKanbanPosition(
    seed: Seed,
    id: string,
    patch: Record<string, unknown> | null,
    _position: string,
    _axisBranchId: string,
    _ctx: { actor: string },
  ): Promise<{ success: boolean }> {
    if (patch) await this.update(seed, id, patch as Record<string, any>)
    return { success: true }
  }

  async runBatch(operations: BatchWrite[]): Promise<void> {
    for (const op of operations) {
      if (op.kind === 'create') {
        await this.create(op.seed, op.id, op.slug, op.status, op.data)
      } else if (op.kind === 'update') {
        await this.update(op.seed, op.id, op.data, op.status)
      } else if (op.kind === 'mutateField') {
        await this.mutateField(op.seed, op.id, op.fieldName, op.operation, op.options)
      }
    }
  }

  async saveDraft(seed: Seed, entryId: string, data: Record<string, any>): Promise<void> {
    if (!seed.allowDrafts) throw new RepositoryError(`Drafts not allowed for ${seed.slug}`)
    this.drafts.get(seed.slug)!.set(entryId, { ...data, updated_at: Math.floor(Date.now() / 1000) })
  }

  async getDraft(seed: Seed, entryId: string): Promise<Entry | null> {
    if (!seed.allowDrafts) return null
    return this.drafts.get(seed.slug)?.get(entryId) ?? null
  }

  async hasDraft(seed: Seed, entryId: string): Promise<boolean> {
    if (!seed.allowDrafts) return false
    return this.drafts.get(seed.slug)?.has(entryId) ?? false
  }

  async publishDraft(seed: Seed, entryId: string): Promise<void> {
    if (!seed.allowDrafts) return
    const draftMap = this.drafts.get(seed.slug)!
    const draft = draftMap.get(entryId)
    if (!draft) throw new EntryNotFoundError(`No draft found for ${entryId} in ${seed.slug}`)
    await this.update(seed, entryId, draft)
    draftMap.delete(entryId)
  }

  async deleteDraft(seed: Seed, entryId: string): Promise<void> {
    if (!seed.allowDrafts) return
    this.drafts.get(seed.slug)?.delete(entryId)
  }

  async bulkUpdate(
    seed: Seed,
    ids: string[],
    fields: Record<string, BulkFieldUpdate>,
  ): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }> {
    const table = this.tables.get(seed.slug)
    if (!table) return { updated: 0, failed: ids.map((id) => ({ id, reason: 'seed-not-found' })) }

    let updated = 0
    const failed: Array<{ id: string; reason: string }> = []

    for (const id of ids) {
      const idx = table.findIndex((e) => e.id === id)
      if (idx === -1) { failed.push({ id, reason: 'not-found' }); continue }

      const patch: Record<string, unknown> = {}
      for (const [alias, update] of Object.entries(fields)) {
        if (update.kind === 'set') {
          patch[alias] = update.value
        } else if (update.kind === 'array_replace') {
          patch[alias] = update.value
        } else if (update.kind === 'array_add') {
          const existing = (table[idx][alias] as string[]) ?? []
          patch[alias] = [...new Set([...existing, ...update.value])]
        } else if (update.kind === 'array_remove') {
          const existing = (table[idx][alias] as string[]) ?? []
          patch[alias] = existing.filter((v) => !update.value.includes(v))
        }
      }
      table[idx] = { ...table[idx], ...patch, updated_at: Math.floor(Date.now() / 1000) }
      updated++
    }

    return { updated, failed }
  }

  async findPendingDrafts(seeds: Seed[]): Promise<DraftSummary[]> {
    const list: DraftSummary[] = []
    for (const seed of seeds) {
      const draftMap = this.drafts.get(seed.slug)
      if (!draftMap) continue
      
      const seedLabel = seed.labelPlural ?? seed.label
      const titleCol = seed.displayNameAlias
      const liveEntries = this.tables.get(seed.slug) ?? []

      for (const [entryId, draft] of draftMap.entries()) {
        const liveEntry = liveEntries.find(e => e.id === entryId)
        const title = draft[titleCol] ?? liveEntry?.[titleCol] ?? entryId
        
        list.push({
          id: entryId,
          seedSlug: seed.slug,
          seedLabel,
          title: title != null && String(title).trim() ? String(title) : entryId,
          updatedAt: draft.updated_at ?? Math.floor(Date.now() / 1000),
          lastModifiedBy: {
            name: 'Mock Admin',
            email: 'admin@example.com',
          },
        })
      }
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
