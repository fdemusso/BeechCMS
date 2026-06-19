// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import {
  ContentRepository,
  EntryNotFoundError,
  RepositoryError,
  SlugConflictError,
  RelationTargetNotFoundError,
  type BulkFieldUpdate,
  type BatchWrite,
  type DraftSummary,
  type Seed,
  type Branch,
  type SelectOptions,
  type RepositoryOptions,
  type BeechHooks,
  type HookActor,
  type HookContext,
  buildSelectQuery,
  deserializeFromDb,
  serializeForDb,
} from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1'

// ── Private helpers ───────────────────────────────────────────────────────────

function multiRelBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b => b.type === 'relation' && b.multiple === true)
}

function singleRelBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b => b.type === 'relation' && !b.multiple)
}

function jTable(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}`
}

function jDraftTable(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}_drafts`
}

export class D1ContentRepository extends BaseD1Repository implements ContentRepository {
  constructor(database: D1Database, private readonly hooks?: BeechHooks) {
    super(database)
  }

  private hookCtx(seed: Seed, actor?: HookActor): HookContext {
    return { seed, repository: this, actor, db: this.database }
  }

  /**
   * Deserializes a DB row using the Seed's branch definitions.
   * Skips multi-relation branches — their values come from junction tables.
   */
  private rowToData(seed: Seed, row: any): Record<string, any> {
    const data: Record<string, any> = {
      id: row.id,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }

    for (const branch of seed.branches) {
      // Multi-relation values live in junction tables, not as columns on this table
      if (branch.type === 'relation' && branch.multiple === true) continue
      if (Object.hasOwn(row, branch.alias)) {
        data[branch.alias] = deserializeFromDb(branch, row[branch.alias])
      }
    }

    return data
  }

  /**
   * Fetches multi-relation arrays for a single entry and attaches them to `data`.
   */
  private async attachMultiRelations(
    seed: Seed,
    entryId: string,
    data: Record<string, any>,
  ): Promise<void> {
    const branches = multiRelBranches(seed)
    if (branches.length === 0) return

    const stmts = branches.map(b =>
      this.database
        .prepare(`SELECT target_id FROM ${jTable(seed.slug, b.alias)} WHERE parent_id = ? ORDER BY position ASC`)
        .bind(entryId),
    )

    const results = await this.database.batch(stmts)
    for (let i = 0; i < branches.length; i++) {
      data[branches[i].alias] = (results[i].results ?? []).map((r: any) => r.target_id)
    }
  }

  /**
   * Fetches multi-relation arrays for a list of entries and attaches them.
   * One query per multi-relation branch (O(R) queries, R = branch count).
   */
  private async attachMultiRelationsMany(
    seed: Seed,
    entries: Record<string, any>[],
  ): Promise<void> {
    const branches = multiRelBranches(seed)
    if (branches.length === 0 || entries.length === 0) return

    const ids = entries.map(e => e.id)
    const placeholders = ids.map(() => '?').join(', ')

    const stmts = branches.map(b =>
      this.database
        .prepare(
          `SELECT parent_id, target_id FROM ${jTable(seed.slug, b.alias)}` +
          ` WHERE parent_id IN (${placeholders}) ORDER BY parent_id, position ASC`,
        )
        .bind(...ids),
    )

    const results = await this.database.batch(stmts)
    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i]
      const byParent = new Map<string, string[]>()
      for (const row of results[i].results ?? []) {
        const r = row as Record<string, unknown>
        const pid = r.parent_id as string
        if (!byParent.has(pid)) byParent.set(pid, [])
        byParent.get(pid)!.push(r.target_id as string)
      }
      for (const entry of entries) {
        entry[branch.alias] = byParent.get(entry.id) ?? []
      }
    }
  }

  async findMany(
    seed: Seed,
    options: SelectOptions
  ): Promise<{ items: Record<string, any>[]; total: number }> {
    try {
      const { sql, bindings } = buildSelectQuery(seed, options)

      const countSql = sql
        .replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ ORDER BY .*$/, '')
        .replace(/ LIMIT \? OFFSET \?$/, '')

      const countBindings = bindings.slice(0, bindings.length - (options.pagination ? 2 : 0))

      const [batchResults, totalCountResult] = await this.database.batch([
        this.database.prepare(sql).bind(...bindings),
        this.database.prepare(countSql).bind(...countBindings),
      ])

      const contentEntries = (batchResults.results || []).map(row => this.rowToData(seed, row))
      const totalEntriesCount = (totalCountResult.results?.[0] as any)?.total || 0

      await this.attachMultiRelationsMany(seed, contentEntries)

      return { items: contentEntries, total: totalEntriesCount }
    } catch (error) {
      throw this.mapError(error, `findMany(${seed.slug})`)
    }
  }

  async findById(seed: Seed, id: string): Promise<Record<string, any>> {
    try {
      const tableName = this.getTableName(seed.slug)
      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`)
        .bind(id)
        .first()

      if (!entryRow) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }

      const data = this.rowToData(seed, entryRow)
      await this.attachMultiRelations(seed, id, data)
      return data
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `findById(${seed.slug}, ${id})`)
    }
  }

  async findBySlug(seed: Seed, slug: string): Promise<Record<string, any>> {
    try {
      const tableName = this.getTableName(seed.slug)
      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE slug = ? LIMIT 1`)
        .bind(slug)
        .first()

      if (!entryRow) {
        throw new EntryNotFoundError(`Entry with slug "${slug}" not found in ${seed.slug}`)
      }

      const data = this.rowToData(seed, entryRow)
      await this.attachMultiRelations(seed, entryRow.id as string, data)
      return data
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `findBySlug(${seed.slug}, ${slug})`)
    }
  }

  async getFacets(seed: Seed): Promise<{
    statuses: Record<string, number>
    tagsByColumn: Record<string, string[]>
  }> {
    try {
      const tableName = this.getTableName(seed.slug)

      const statusResults = await this.database
        .prepare(`SELECT status, COUNT(*) as count FROM ${tableName} GROUP BY status`)
        .all()

      const statusesCount: Record<string, number> = {}
      for (const statusRow of statusResults.results || []) {
        statusesCount[statusRow.status as string] = statusRow.count as number
      }

      const tagsByColumn: Record<string, string[]> = {}
      const tagBranches = seed.branches.filter(branch => branch.type === 'tags')

      for (const branch of tagBranches) {
        const tagResults = await this.database
          .prepare(`SELECT DISTINCT value FROM ${tableName}, json_each(${tableName}.${branch.alias}) WHERE value IS NOT NULL`)
          .all()
        tagsByColumn[branch.alias] = (tagResults.results || []).map(row => row.value as string)
      }

      return { statuses: statusesCount, tagsByColumn }
    } catch (error) {
      throw this.mapError(error, `getFacets(${seed.slug})`)
    }
  }

  async existsSlug(seed: Seed, slug: string, excludeId?: string): Promise<boolean> {
    try {
      const tableName = this.getTableName(seed.slug)
      let sql = `SELECT 1 FROM ${tableName} WHERE slug = ?`
      const queryBindings: any[] = [slug]

      if (excludeId) {
        sql += ` AND id != ?`
        queryBindings.push(excludeId)
      }

      const entryExistsResult = await this.database.prepare(sql).bind(...queryBindings).first()
      return entryExistsResult !== null
    } catch (error) {
      throw this.mapError(error, `existsSlug(${seed.slug}, ${slug})`)
    }
  }


  private buildCreateMainStmt(
    seed: Seed,
    id: string,
    slug: string,
    status: string,
    data: Record<string, any>
  ): D1PreparedStatement {
    const tableName = this.getTableName(seed.slug)
    const columnNames = ['id', 'slug', 'status']
    const placeholders = ['?', '?', '?']
    const queryBindings: any[] = [id, slug, status]

    const mRelAliases = new Set(multiRelBranches(seed).map(b => b.alias))

    for (const branch of seed.branches) {
      if (mRelAliases.has(branch.alias)) continue
      if (Object.hasOwn(data, branch.alias)) {
        columnNames.push(branch.alias)
        placeholders.push('?')
        queryBindings.push(serializeForDb(branch, data[branch.alias]))
      }
    }

    const mainSql = `INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (${placeholders.join(', ')})`
    return this.database.prepare(mainSql).bind(...queryBindings)
  }

  private buildUpdateMainStmt(
    seed: Seed,
    id: string,
    data: Record<string, any>,
    status?: string
  ): { stmt: D1PreparedStatement | null; junctionUpdates: any[] } {
    const tableName = this.getTableName(seed.slug)
    const updateClauses: string[] = []
    const queryBindings: any[] = []

    const mRelBranches = multiRelBranches(seed)
    const mRelAliases = new Set(mRelBranches.map(b => b.alias))

    if (status) {
      updateClauses.push('status = ?')
      queryBindings.push(status)
    }

    for (const branch of seed.branches) {
      if (mRelAliases.has(branch.alias)) continue
      if (Object.hasOwn(data, branch.alias)) {
        updateClauses.push(`${branch.alias} = ?`)
        queryBindings.push(serializeForDb(branch, data[branch.alias]))
      }
    }

    const junctionUpdates = mRelBranches.filter(b => Object.hasOwn(data, b.alias))

    if (updateClauses.length === 0 && junctionUpdates.length === 0) {
      return { stmt: null, junctionUpdates: [] }
    }

    updateClauses.push('updated_at = (unixepoch())')

    const mainSql = `UPDATE ${tableName} SET ${updateClauses.join(', ')} WHERE id = ?`
    queryBindings.push(id)

    return {
      stmt: this.database.prepare(mainSql).bind(...queryBindings),
      junctionUpdates
    }
  }

  private buildJunctionInserts(seedSlug: string, parentId: string, branchAlias: string, targetIds: string[]): D1PreparedStatement[] {
    const jt = jTable(seedSlug, branchAlias)
    return targetIds.map((targetId, i) =>
      this.database
        .prepare(`INSERT INTO ${jt} (parent_id, target_id, position) VALUES (?, ?, ?)`)
        .bind(parentId, targetId, i),
    )
  }

  private buildDraftJunctionInserts(seedSlug: string, entryId: string, branchAlias: string, targetIds: string[]): D1PreparedStatement[] {
    const jdt = jDraftTable(seedSlug, branchAlias)
    return targetIds.map((targetId, i) =>
      this.database
        .prepare(`INSERT INTO ${jdt} (entry_id, target_id, position) VALUES (?, ?, ?)`)
        .bind(entryId, targetId, i),
    )
  }

  private async validatePublishDraftRelations(seed: Seed, draftRow: Record<string, unknown>, entryId: string) {
    for (const branch of singleRelBranches(seed)) {
      const value = draftRow[branch.alias]
      if (value == null) continue
      const exists = await this.database
        .prepare(`SELECT 1 FROM content_${branch.targetSeed} WHERE id = ? LIMIT 1`)
        .bind(value)
        .first()
      if (!exists) {
        throw new RelationTargetNotFoundError({
          alias: branch.alias,
          targetSeed: branch.targetSeed!,
          value: typeof value === 'string' ? value : (JSON.stringify(value) ?? 'undefined'),
        })
      }
    }

    const mRelBranches = multiRelBranches(seed)
    const mRelDraftIds = new Map<string, string[]>()

    for (const branch of mRelBranches) {
      const jdt = jDraftTable(seed.slug, branch.alias)
      const rows = await this.database
        .prepare(`SELECT target_id FROM ${jdt} WHERE entry_id = ? ORDER BY position ASC`)
        .bind(entryId)
        .all()
      const targetIds = (rows.results ?? []).map((r: any) => String(r.target_id))

      for (const targetId of targetIds) {
        const exists = await this.database
          .prepare(`SELECT 1 FROM content_${branch.targetSeed} WHERE id = ? LIMIT 1`)
          .bind(targetId)
          .first()
        if (!exists) {
          throw new RelationTargetNotFoundError({
            alias: branch.alias,
            targetSeed: branch.targetSeed!,
            value: targetId,
          })
        }
      }
      mRelDraftIds.set(branch.alias, targetIds)
    }

    return { mRelBranches, mRelDraftIds }
  }

  private getBulkArrayUpdateStmts(seedSlug: string, id: string, alias: string, update: BulkFieldUpdate): D1PreparedStatement[] {
    const jt = jTable(seedSlug, alias)
    const stmts: D1PreparedStatement[] = []

    if (update.kind === 'array_replace') {
      const deleteStmt = this.database.prepare(`DELETE FROM ${jt} WHERE parent_id = ?`).bind(id)
      const insertStmts = update.value.map((v, i) => 
        this.database.prepare(`INSERT INTO ${jt} (parent_id, target_id, position) VALUES (?, ?, ?)`).bind(id, v, i)
      )
      stmts.push(deleteStmt, ...insertStmts)
    } else if (update.kind === 'array_add') {
      for (const targetId of update.value) {
        stmts.push(
          this.database
            .prepare(
              `INSERT OR IGNORE INTO ${jt} (parent_id, target_id, position) VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM ${jt} WHERE parent_id = ?))`,
            )
            .bind(id, targetId, id),
        )
      }
    } else if (update.kind === 'array_remove' && update.value.length > 0) {
      const placeholders = update.value.map(() => '?').join(', ')
      stmts.push(
        this.database
          .prepare(`DELETE FROM ${jt} WHERE parent_id = ? AND target_id IN (${placeholders})`)
          .bind(id, ...update.value),
      )
    }
    return stmts
  }

  private async processBulkUpdateSingle(
    seedSlug: string,
    id: string,
    fields: Record<string, BulkFieldUpdate>,
    tableName: string
  ): Promise<void> {
    const stmts: D1PreparedStatement[] = []

    const setClauses: string[] = ['updated_at = (unixepoch())']
    const setBindings: unknown[] = []

    for (const [alias, update] of Object.entries(fields)) {
      if (update.kind === 'set') {
        setClauses.unshift(`${alias} = ?`)
        setBindings.push(update.value)
      } else {
        stmts.push(...this.getBulkArrayUpdateStmts(seedSlug, id, alias, update))
      }
    }

    stmts.unshift(
      this.database
        .prepare(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = ?`)
        .bind(...setBindings, id),
    )

    const results = await this.database.batch(stmts)
    if ((results[0].meta?.changes ?? 0) === 0) {
      throw new Error('not-found')
    }
  }

  private async processBulkUpdateChunk(
    seedSlug: string,
    chunk: string[],
    fields: Record<string, BulkFieldUpdate>,
    tableName: string
  ): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }> {
    let updated = 0
    const failed: Array<{ id: string; reason: string }> = []
    
    for (const id of chunk) {
      try {
        await this.processBulkUpdateSingle(seedSlug, id, fields, tableName)
        updated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg === 'not-found') {
          failed.push({ id, reason: 'not-found' })
        } else {
          const isFk = /FOREIGN KEY constraint failed/i.test(msg)
          failed.push({ id, reason: isFk ? `relation-target-not-found:${id}` : `error:${msg}` })
        }
      }
    }
    return { updated, failed }
  }

  async create(
    seed: Seed,
    id: string,
    slug: string,
    status: string,
    data: Record<string, any>,
    options?: RepositoryOptions
  ): Promise<void> {
    let payload = data

    if (this.hooks?.beforeCreate) {
      const result = await this.hooks.beforeCreate(payload, this.hookCtx(seed, options?.actor))
      if (result) payload = result
    }

    try {
      if (await this.existsSlug(seed, slug)) {
        throw new SlugConflictError(`Slug "${slug}" already exists for ${seed.slug}`)
      }

      const batchStmts: D1PreparedStatement[] = [
        this.buildCreateMainStmt(seed, id, slug, status, payload),
      ]

      for (const branch of multiRelBranches(seed)) {
        const value = payload[branch.alias]
        if (!Array.isArray(value) || value.length === 0) continue
        batchStmts.push(...this.buildJunctionInserts(seed.slug, id, branch.alias, value))
      }

      if (batchStmts.length === 1) {
        await batchStmts[0].run()
      } else {
        await this.database.batch(batchStmts)
      }
    } catch (error) {
      if (error instanceof SlugConflictError) throw error
      throw this.mapError(error, `create(${seed.slug})`)
    }

    // afterCreate gira DOPO il commit del batch: NON puo fare rollback.
    if (this.hooks?.afterCreate) {
      const entry = { id, slug, status, ...payload }
      await this.hooks.afterCreate(entry, this.hookCtx(seed, options?.actor))
    }
  }

  async update(
    seed: Seed,
    id: string,
    data: Record<string, any>,
    status?: string,
    options?: RepositoryOptions
  ): Promise<void> {
    let payload = data

    if (this.hooks?.beforeUpdate) {
      const result = await this.hooks.beforeUpdate(id, payload, this.hookCtx(seed, options?.actor))
      if (result) payload = result
    }

    try {
      const { stmt, junctionUpdates } = this.buildUpdateMainStmt(seed, id, payload, status)

      if (!stmt && junctionUpdates.length === 0) return

      const batchStmts: D1PreparedStatement[] = []
      if (stmt) batchStmts.push(stmt)

      for (const branch of junctionUpdates) {
        const jt = jTable(seed.slug, branch.alias)
        const value = (payload[branch.alias] ?? []) as string[]
        const deleteStmt = this.database.prepare(`DELETE FROM ${jt} WHERE parent_id = ?`).bind(id)
        batchStmts.push(deleteStmt, ...this.buildJunctionInserts(seed.slug, id, branch.alias, value))
      }

      if (batchStmts.length === 1) {
        const updateResult = await batchStmts[0].run()
        if (updateResult.meta.changes === 0) {
          throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
        }
      } else if (batchStmts.length > 1) {
        const results = await this.database.batch(batchStmts)
        if (stmt && (results[0].meta?.changes ?? 0) === 0) {
          throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
        }
      }
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `update(${seed.slug}, ${id})`)
    }

    // afterUpdate gira DOPO il commit del batch: NON puo fare rollback.
    if (this.hooks?.afterUpdate) {
      const entry = { id, ...payload, ...(status ? { status } : {}) }
      await this.hooks.afterUpdate(entry, this.hookCtx(seed, options?.actor))
    }
  }

  async delete(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }> {
    if (this.hooks?.beforeDelete) {
      await this.hooks.beforeDelete(id, this.hookCtx(seed, options?.actor))
    }

    let row: Record<string, any>
    try {
      const tableName = this.getTableName(seed.slug)

      const entryRow = await this.database
        .prepare(`SELECT * FROM ${tableName} WHERE id = ?`)
        .bind(id)
        .first()

      if (!entryRow) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }

      await this.database.prepare(`DELETE FROM ${tableName} WHERE id = ?`).bind(id).run()

      row = this.rowToData(seed, entryRow)
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `delete(${seed.slug}, ${id})`)
    }

    // afterDelete gira DOPO il commit: NON puo fare rollback.
    if (this.hooks?.afterDelete) {
      await this.hooks.afterDelete(id, this.hookCtx(seed, options?.actor))
    }

    return { row }
  }

  async mutateField(
    seed: Seed,
    id: string,
    fieldName: string,
    operation: { type: 'increment' | 'decrement'; value: number },
    options?: { min?: number; max?: number }
  ): Promise<{ newValue: number }> {
    try {
      const branch = seed.branches.find(b => b.alias === fieldName)
      if (!branch || branch.type !== 'number') {
        throw new RepositoryError(`mutateField: '${fieldName}' non e un campo numerico di ${seed.slug}`)
      }

      const delta = operation.type === 'increment' ? operation.value : -operation.value
      const table = this.getTableName(seed.slug)

      let sql = `UPDATE ${table} SET ${fieldName} = ${fieldName} + ?, updated_at = (unixepoch()) WHERE id = ?`
      const params: any[] = [delta, id]
      if (options?.min !== undefined) { sql += ` AND ${fieldName} + ? >= ?`; params.push(delta, options.min) }
      if (options?.max !== undefined) { sql += ` AND ${fieldName} + ? <= ?`; params.push(delta, options.max) }

      const result = await this.database.prepare(sql).bind(...params).run()
      if (result.meta.changes === 0) {
        throw new RepositoryError(`Operazione atomica fallita: record non trovato o limite superato per ${fieldName}`)
      }

      const updated = await this.database.prepare(`SELECT ${fieldName} AS v FROM ${table} WHERE id = ?`).bind(id).first<{ v: number }>()
      return { newValue: updated!.v }
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw this.mapError(error, `mutateField(${seed.slug}, ${id}, ${fieldName})`)
    }
  }

  async runBatch(operations: BatchWrite[]): Promise<void> {
    if (operations.length === 0) return

    try {
      const stmts: D1PreparedStatement[] = []

      for (const op of operations) {
        if (op.kind === 'create') {
          stmts.push(this.buildCreateMainStmt(op.seed, op.id, op.slug, op.status, op.data))
          for (const branch of multiRelBranches(op.seed)) {
            const value = op.data[branch.alias]
            if (!Array.isArray(value) || value.length === 0) continue
            stmts.push(...this.buildJunctionInserts(op.seed.slug, op.id, branch.alias, value))
          }
        } else if (op.kind === 'update') {
          const { stmt, junctionUpdates } = this.buildUpdateMainStmt(op.seed, op.id, op.data, op.status)
          if (stmt) stmts.push(stmt)
          for (const branch of junctionUpdates) {
            const jt = jTable(op.seed.slug, branch.alias)
            const value = (op.data[branch.alias] ?? []) as string[]
            stmts.push(this.database.prepare(`DELETE FROM ${jt} WHERE parent_id = ?`).bind(op.id))
            stmts.push(...this.buildJunctionInserts(op.seed.slug, op.id, branch.alias, value))
          }
        } else if (op.kind === 'mutateField') {
          const branch = op.seed.branches.find(b => b.alias === op.fieldName)
          if (!branch || branch.type !== 'number') {
            throw new RepositoryError(`runBatch: '${op.fieldName}' non e un campo numerico di ${op.seed.slug}`)
          }
          const delta = op.operation.type === 'increment' ? op.operation.value : -op.operation.value
          const table = this.getTableName(op.seed.slug)
          let sql = `UPDATE ${table} SET ${op.fieldName} = ${op.fieldName} + ?, updated_at = (unixepoch()) WHERE id = ?`
          const params: any[] = [delta, op.id]
          if (op.options?.min !== undefined) { sql += ` AND ${op.fieldName} + ? >= ?`; params.push(delta, op.options.min) }
          if (op.options?.max !== undefined) { sql += ` AND ${op.fieldName} + ? <= ?`; params.push(delta, op.options.max) }
          stmts.push(this.database.prepare(sql).bind(...params))
        }
      }

      if (stmts.length === 1) await stmts[0].run()
      else if (stmts.length > 1) await this.database.batch(stmts)
    } catch (error) {
      if (error instanceof RepositoryError) throw error
      throw this.mapError(error, 'runBatch')
    }
  }

  async saveDraft(seed: Seed, entryId: string, data: Record<string, any>): Promise<void> {
    try {
      if (!seed.allowDrafts) {
        throw new RepositoryError(`Drafts not allowed for ${seed.slug}`)
      }

      const draftTableName = this.getTableName(seed.slug, true)
      const mRelBranches = multiRelBranches(seed)
      const mRelAliases = new Set(mRelBranches.map(b => b.alias))

      const columnNames = ['entry_id']
      const placeholders = ['?']
      const queryBindings: any[] = [entryId]
      const updateClauses: string[] = []

      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (Object.hasOwn(data, branch.alias)) {
          const serializedValue = serializeForDb(branch, data[branch.alias])
          columnNames.push(branch.alias)
          placeholders.push('?')
          queryBindings.push(serializedValue)
          updateClauses.push(`${branch.alias} = EXCLUDED.${branch.alias}`)
        }
      }

      updateClauses.push('updated_at = (unixepoch())')

      const sql = `
        INSERT INTO ${draftTableName} (${columnNames.join(', ')})
        VALUES (${placeholders.join(', ')})
        ON CONFLICT(entry_id) DO UPDATE SET ${updateClauses.join(', ')}
      `

      const junctionUpdates = mRelBranches.filter(b => Object.hasOwn(data, b.alias))

      if (junctionUpdates.length === 0) {
        await this.database.prepare(sql).bind(...queryBindings).run()
        return
      }

      const batchStmts: D1PreparedStatement[] = [
        this.database.prepare(sql).bind(...queryBindings),
      ]

      for (const branch of junctionUpdates) {
        const jdt = jDraftTable(seed.slug, branch.alias)
        const value = (data[branch.alias] ?? []) as string[]
        batchStmts.push(
          this.database.prepare(`DELETE FROM ${jdt} WHERE entry_id = ?`).bind(entryId),
        )
        for (let i = 0; i < value.length; i++) {
          batchStmts.push(
            this.database
              .prepare(`INSERT INTO ${jdt} (entry_id, target_id, position) VALUES (?, ?, ?)`)
              .bind(entryId, value[i], i),
          )
        }
      }

      await this.database.batch(batchStmts)
    } catch (error) {
      throw this.mapError(error, `saveDraft(${seed.slug}, ${entryId})`)
    }
  }

  async getDraft(seed: Seed, entryId: string): Promise<Record<string, any> | null> {
    try {
      if (!seed.allowDrafts) return null

      const draftTableName = this.getTableName(seed.slug, true)
      const draftRow = await this.database
        .prepare(`SELECT * FROM ${draftTableName} WHERE entry_id = ?`)
        .bind(entryId)
        .first()

      if (!draftRow) return null

      const mRelBranches = multiRelBranches(seed)
      const mRelAliases = new Set(mRelBranches.map(b => b.alias))

      const draftData: Record<string, any> = {}
      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (draftRow[branch.alias] !== null) {
          draftData[branch.alias] = deserializeFromDb(branch, draftRow[branch.alias])
        }
      }

      // Fetch multi-relation draft arrays from junction draft tables
      if (mRelBranches.length > 0) {
        const stmts = mRelBranches.map(b =>
          this.database
            .prepare(`SELECT target_id FROM ${jDraftTable(seed.slug, b.alias)} WHERE entry_id = ? ORDER BY position ASC`)
            .bind(entryId),
        )
        const results = await this.database.batch(stmts)
        for (let i = 0; i < mRelBranches.length; i++) {
          const ids = (results[i].results ?? []).map((r: any) => r.target_id as string)
          if (ids.length > 0) {
            draftData[mRelBranches[i].alias] = ids
          }
        }
      }

      return draftData
    } catch (error) {
      throw this.mapError(error, `getDraft(${seed.slug}, ${entryId})`)
    }
  }

  async hasDraft(seed: Seed, entryId: string): Promise<boolean> {
    try {
      if (!seed.allowDrafts) return false
      const draftTableName = this.getTableName(seed.slug, true)
      const draftExistsResult = await this.database
        .prepare(`SELECT 1 FROM ${draftTableName} WHERE entry_id = ? LIMIT 1`)
        .bind(entryId)
        .first()
      return draftExistsResult !== null
    } catch (error) {
      throw this.mapError(error, `hasDraft(${seed.slug}, ${entryId})`)
    }
  }

  async publishDraft(seed: Seed, entryId: string): Promise<void> {
    try {
      if (!seed.allowDrafts) return

      const draftTableName = this.getTableName(seed.slug, true)
      const liveTableName = this.getTableName(seed.slug)

      const draftRow = await this.database
        .prepare(`SELECT * FROM ${draftTableName} WHERE entry_id = ?`)
        .bind(entryId)
        .first<Record<string, unknown>>()

      if (!draftRow) {
        throw new EntryNotFoundError(`No draft found for ${entryId} in ${seed.slug}`)
      }

      const { mRelBranches, mRelDraftIds } = await this.validatePublishDraftRelations(seed, draftRow, entryId)

      const mRelAliases = new Set(mRelBranches.map(b => b.alias))
      const updateClauses: string[] = []
      const queryBindings: any[] = []

      for (const branch of seed.branches) {
        if (mRelAliases.has(branch.alias)) continue
        if (draftRow[branch.alias] !== null) {
          updateClauses.push(`${branch.alias} = ?`)
          queryBindings.push(draftRow[branch.alias])
        }
      }

      updateClauses.push('updated_at = (unixepoch())')
      const updateSql = `UPDATE ${liveTableName} SET ${updateClauses.join(', ')} WHERE id = ?`
      queryBindings.push(entryId)

      const batchStmts: D1PreparedStatement[] = [
        this.database.prepare(updateSql).bind(...queryBindings),
        this.database.prepare(`DELETE FROM ${draftTableName} WHERE entry_id = ?`).bind(entryId),
      ]

      for (const branch of mRelBranches) {
        const lt = jTable(seed.slug, branch.alias)
        const jdt = jDraftTable(seed.slug, branch.alias)
        const targetIds = mRelDraftIds.get(branch.alias) ?? []

        batchStmts.push(
          this.database.prepare(`DELETE FROM ${lt} WHERE parent_id = ?`).bind(entryId),
          this.database.prepare(`DELETE FROM ${jdt} WHERE entry_id = ?`).bind(entryId),
          ...this.buildJunctionInserts(seed.slug, entryId, branch.alias, targetIds)
        )
      }

      await this.database.batch(batchStmts)
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      if (error instanceof RelationTargetNotFoundError) throw error
      throw this.mapError(error, `publishDraft(${seed.slug}, ${entryId})`)
    }
  }

  async bulkUpdate(
    seedSlug: string,
    ids: string[],
    fields: Record<string, BulkFieldUpdate>,
  ): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }> {
    const CHUNK = 50
    const tableName = this.getTableName(seedSlug)
    let updated = 0
    const failed: Array<{ id: string; reason: string }> = []

    for (let offset = 0; offset < ids.length; offset += CHUNK) {
      const chunk = ids.slice(offset, offset + CHUNK)
      const res = await this.processBulkUpdateChunk(seedSlug, chunk, fields, tableName)
      updated += res.updated
      failed.push(...res.failed)
    }

    return { updated, failed }
  }

  async deleteDraft(seed: Seed, entryId: string): Promise<void> {
    try {
      if (!seed.allowDrafts) return
      const draftTableName = this.getTableName(seed.slug, true)
      await this.database.prepare(`DELETE FROM ${draftTableName} WHERE entry_id = ?`).bind(entryId).run()
    } catch (error) {
      throw this.mapError(error, `deleteDraft(${seed.slug}, ${entryId})`)
    }
  }

  async findPendingDrafts(seeds: Seed[]): Promise<DraftSummary[]> {
    try {
      if (seeds.length === 0) return []

      const unionSelects: string[] = []
      const bindings: (string | number)[] = []

      for (const seed of seeds) {
        const draftTable = `content_${seed.slug}_drafts`
        const liveTable = `content_${seed.slug}`
        const titleCol = seed.displayNameAlias
        const seedLabel = seed.labelPlural ?? seed.label

        unionSelects.push(`
          SELECT
            ? AS seed_slug,
            ? AS seed_label,
            d.entry_id AS id,
            d.updated_at AS updated_at,
            COALESCE(d.${titleCol}, l.${titleCol}) AS title
          FROM ${draftTable} d
          LEFT JOIN ${liveTable} l ON l.id = d.entry_id
        `)
        bindings.push(seed.slug, seedLabel)
      }

      const sql = `
        WITH all_drafts AS (
          ${unionSelects.join('\nUNION ALL\n')}
        )
        SELECT
          ad.seed_slug   AS seedSlug,
          ad.seed_label  AS seedLabel,
          ad.id          AS id,
          ad.updated_at  AS updatedAt,
          ad.title       AS title,
          al.user_name   AS lastName,
          al.user_email  AS lastEmail
        FROM all_drafts ad
        LEFT JOIN activity_logs al
          ON al.id = (
            SELECT id FROM activity_logs
            WHERE entity_id = ad.id
              AND entity_slug = ad.seed_slug
              AND action = 'update'
              AND json_extract(details, '$.note') = 'draft saved'
            ORDER BY created_at DESC
            LIMIT 1
          )
        ORDER BY ad.updated_at DESC
      `

      const { results } = await this.database.prepare(sql).bind(...bindings).all()

      return (results ?? []).map((row: any): DraftSummary => ({
        id: String(row.id),
        seedSlug: String(row.seedSlug),
        seedLabel: String(row.seedLabel),
        title: row.title != null && String(row.title).trim() ? String(row.title) : String(row.id),
        updatedAt: Number(row.updatedAt),
        lastModifiedBy: {
          name: row.lastName ?? null,
          email: row.lastEmail ?? '',
        },
      }))
    } catch (error) {
      throw this.mapError(error, 'findPendingDrafts')
    }
  }
}
