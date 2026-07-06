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

/** Returns the seed's `relation` branches configured for multiple targets (array-valued, stored in junction tables). */
function multiRelBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b => b.type === 'relation' && b.multiple === true)
}

/** Returns the seed's `relation` branches configured for a single target (stored inline as a column). */
function singleRelBranches(seed: Seed): Branch[] {
  return seed.branches.filter(b => b.type === 'relation' && !b.multiple)
}

/** Builds the junction table name for a live (published) multi-relation branch, e.g. `rel_posts_tags`. */
function jTable(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}`
}

/** Builds the junction table name for a draft multi-relation branch, e.g. `rel_posts_tags_drafts`. */
function jDraftTable(seedSlug: string, branchAlias: string): string {
  return `rel_${seedSlug}_${branchAlias}_drafts`
}

/**
 * D1 (Cloudflare SQLite) implementation of {@link ContentRepository}.
 *
 * Persists each seed's entries in a dedicated `content_{slug}` table, with multi-relation
 * branches stored in separate junction tables (`rel_{slug}_{alias}`) rather than as columns,
 * since D1/SQLite has no native array column type. Draft data mirrors this shape in
 * `content_{slug}_drafts` and `rel_{slug}_{alias}_drafts` tables.
 *
 * Lifecycle hooks ({@link BeechHooks}) fire around create/update/delete: `before*` hooks run
 * inside the try block and may transform the payload or abort by throwing; `after*` hooks run
 * once the write has already committed and therefore cannot roll back the mutation.
 */
export class D1ContentRepository extends BaseD1Repository implements ContentRepository {
  constructor(database: D1Database, private readonly hooks?: BeechHooks) {
    super(database)
  }

  /** Assembles the {@link HookContext} passed to every lifecycle hook invocation. */
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

    // Present only when the query joins kanban_positions (kanbanOrder mode)
    if (row.position !== undefined) data.position = row.position

    return data
  }

  /**
   * Fetches multi-relation arrays for a single entry and attaches them to `data`.
   *
   * @param seed The seed schema definition.
   * @param entryId Id of the entry to fetch relation targets for.
   * @param data Mutated in place: one array property per multi-relation branch alias.
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
   * One query per multi-relation branch (O(R) queries, R = branch count), each query
   * spanning all entries via `parent_id IN (...)`.
   *
   * @param seed The seed schema definition.
   * @param entries Mutated in place: one array property per multi-relation branch alias, per entry.
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

  /**
   * Finds multiple entries for a given seed table based on the provided query options.
   * Generates and executes two separate parameterized queries in a batch request:
   * 1. A selection query to retrieve the items for the current page (with columns, limits, offsets, and ordering).
   * 2. A count query (using `isCount: true`) to retrieve the total number of matched items matching the same filters.
   * 
   * @param seed The seed schema definition.
   * @param options Filtering, search, ordering, and pagination options.
   * @returns An object containing the list of serialized entries and the total count of matched items.
   * @throws RepositoryError if the database batch execution fails.
   */
  async findMany(
    seed: Seed,
    options: SelectOptions
  ): Promise<{ items: Record<string, any>[]; total: number }> {
    try {
      const { sql, bindings } = buildSelectQuery(seed, options)
      const { sql: countSql, bindings: countBindings } = buildSelectQuery(seed, {
        ...options,
        isCount: true,
      })

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

  /**
   * Fetches a single entry by id, including its multi-relation arrays.
   * @throws EntryNotFoundError if no row with `id` exists in the seed's table.
   * @throws RepositoryError on any other database failure.
   */
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

  /**
   * Fetches a single entry by its unique `slug`, including its multi-relation arrays.
   * @throws EntryNotFoundError if no row with `slug` exists in the seed's table.
   * @throws RepositoryError on any other database failure.
   */
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

  /**
   * Computes aggregate facets for a seed: entry counts per `status`, and the distinct set
   * of tag values present across all entries for each `tags`-typed branch (via `json_each`
   * over the JSON-serialized tag column).
   */
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

  /**
   * Checks whether `slug` is already taken in the seed's table.
   * @param excludeId When provided (e.g. during an update), excludes that entry's own row from the check.
   */
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


  /**
   * Builds the `INSERT` statement for an entry's main table row. Multi-relation branch
   * values are skipped (they're written as separate junction-table inserts by the caller).
   */
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

  /**
   * Builds the `UPDATE` statement for an entry's main table row from whichever branch
   * aliases are present in `data` (partial update — absent keys are left untouched).
   * Multi-relation branches present in `data` are returned as `junctionUpdates` instead
   * of being included in the SQL, since they require separate delete+insert statements.
   *
   * @returns `stmt: null` when there is nothing to update on the main row (no scalar
   *   fields and no `status` change) even if junction updates are still needed.
   */
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

  /** Builds one `INSERT` per target id into a live multi-relation junction table, preserving array order via `position`. */
  private buildJunctionInserts(seedSlug: string, parentId: string, branchAlias: string, targetIds: string[]): D1PreparedStatement[] {
    const jt = jTable(seedSlug, branchAlias)
    return targetIds.map((targetId, i) =>
      this.database
        .prepare(`INSERT INTO ${jt} (parent_id, target_id, position) VALUES (?, ?, ?)`)
        .bind(parentId, targetId, i),
    )
  }

  /** Builds one `INSERT` per target id into a draft multi-relation junction table, preserving array order via `position`. */
  private buildDraftJunctionInserts(seedSlug: string, entryId: string, branchAlias: string, targetIds: string[]): D1PreparedStatement[] {
    const jdt = jDraftTable(seedSlug, branchAlias)
    return targetIds.map((targetId, i) =>
      this.database
        .prepare(`INSERT INTO ${jdt} (entry_id, target_id, position) VALUES (?, ?, ?)`)
        .bind(entryId, targetId, i),
    )
  }

  /**
   * Validates that every relation target referenced by a draft still exists before publish,
   * for both single-relation columns and multi-relation draft junction rows.
   *
   * @throws RelationTargetNotFoundError if any referenced target id is missing from its target seed's table.
   * @returns The multi-relation branches and their resolved (validated) draft target ids,
   *   so the caller can reuse them without re-querying the draft junction tables.
   */
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

  /**
   * Builds the junction-table statements for one array-typed {@link BulkFieldUpdate}:
   * `array_replace` (delete-all + reinsert), `array_add` (append via `INSERT OR IGNORE`
   * with position computed from current max), or `array_remove` (targeted delete).
   * Returns an empty array for a no-op (e.g. `array_remove` with an empty value list).
   */
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

  /**
   * Applies a bulk field update to a single entry as one batch: a main-table `UPDATE` for
   * `set`-kind fields plus any junction statements for array-kind fields.
   * @throws Error('not-found') if the main `UPDATE` affects zero rows (id doesn't exist).
   */
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
        setClauses.push(`${alias} = ?`)
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

  /**
   * Sequentially applies a bulk field update to each id in `chunk`, isolating per-id
   * failures (not-found, FK violation, or other error) into the `failed` list rather than
   * aborting the whole chunk.
   */
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

  /**
   * Creates a new entry: runs `beforeCreate` (which may transform the payload), inserts the
   * main row plus any multi-relation junction rows as a single batch, then runs `afterCreate`.
   *
   * @throws SlugConflictError if `slug` already exists for this seed.
   * @throws RepositoryError on any other database failure.
   * @remarks `afterCreate` runs after the batch has committed, so it cannot roll back the write.
   */
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

  /**
   * Partially updates an existing entry: runs `beforeUpdate`, applies main-row and
   * junction-table changes as a batch, then runs `afterUpdate`. A no-op payload (no scalar
   * fields, no multi-relation fields, no status change) returns without touching the database.
   *
   * @throws EntryNotFoundError if the main-row `UPDATE` affects zero rows.
   * @throws RepositoryError on any other database failure.
   * @remarks `afterUpdate` runs after the batch has committed, so it cannot roll back the write.
   */
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

  /**
   * Deletes an entry: runs `beforeDelete`, reads the row (for the return value), deletes it,
   * then runs `afterDelete`. Relies on database-level `ON DELETE CASCADE` for junction rows.
   *
   * @returns The deserialized row as it existed immediately before deletion.
   * @throws EntryNotFoundError if no row with `id` exists.
   * @remarks `afterDelete` runs after the delete has committed, so it cannot roll back the write.
   */
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

  /**
   * Atomically increments/decrements a numeric field in a single conditional `UPDATE`
   * (guarded by optional `min`/`max` bounds evaluated against the new value), avoiding
   * read-modify-write races.
   *
   * @throws RepositoryError if `fieldName` isn't a `number`-typed branch on `seed`, or if
   *   the conditional `UPDATE` affects zero rows (entry not found, or bound exceeded).
   */
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

  /**
   * Executes a heterogeneous list of {@link BatchWrite} operations (create/update/mutateField)
   * as a single atomic `database.batch` call. Does not invoke lifecycle hooks — callers needing
   * hook side effects should use {@link create}/{@link update}/{@link mutateField} instead.
   *
   * @throws RepositoryError if any operation references a non-numeric field for `mutateField`,
   *   or on any other database failure.
   */
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

  /**
   * Upserts a draft row for `entryId` (`INSERT ... ON CONFLICT DO UPDATE` keyed on `entry_id`)
   * plus a full delete+reinsert of each multi-relation branch's draft junction rows.
   * @throws RepositoryError if `seed.allowDrafts` is false, or on any database failure.
   */
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

  /**
   * Fetches the draft row for `entryId`, if any, merged with its multi-relation draft arrays.
   * @returns `null` if `seed.allowDrafts` is false or no draft row exists.
   */
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

  /** Checks whether a draft row exists for `entryId`. Always `false` if `seed.allowDrafts` is false. */
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

  /**
   * Promotes a draft to the live entry: validates all relation targets referenced by the
   * draft still exist, copies the draft's scalar fields into the live row, replaces the
   * live junction rows with the draft's, and deletes the draft — all as one batch.
   * A no-op if `seed.allowDrafts` is false.
   *
   * @throws EntryNotFoundError if no draft row exists for `entryId`.
   * @throws RelationTargetNotFoundError if any relation the draft references no longer exists.
   */
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

  /**
   * Applies the same set of field updates across many entries, chunked at 50 ids per batch
   * to bound per-call payload size. Per-id failures are collected rather than aborting the
   * whole operation — see {@link processBulkUpdateSingle} for failure classification.
   */
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

  /** Deletes the draft row for `entryId`, if any. A no-op if `seed.allowDrafts` is false. */
  async deleteDraft(seed: Seed, entryId: string): Promise<void> {
    try {
      if (!seed.allowDrafts) return
      const draftTableName = this.getTableName(seed.slug, true)
      await this.database.prepare(`DELETE FROM ${draftTableName} WHERE entry_id = ?`).bind(entryId).run()
    } catch (error) {
      throw this.mapError(error, `deleteDraft(${seed.slug}, ${entryId})`)
    }
  }

  /**
   * Finds every pending draft across the given seeds, `UNION ALL`-ing one query per seed
   * so results span heterogeneous `content_{slug}_drafts` tables, then left-joins each
   * against `activity_logs` to attribute the most recent "draft saved" action.
   *
   * @param seeds Seeds to search; drafts are looked up per-seed since draft tables aren't unified.
   * @returns Draft summaries ordered by most-recently-updated first. `title` falls back to the
   *   draft's own `id` if the display-name column is blank on both the draft and its live counterpart.
   */
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

  /**
   * Updates an entry's field values (optional) and its kanban board position atomically in one
   * batch: an optional main-row/junction update via {@link buildUpdateMainStmt}, plus an upsert
   * into `kanban_positions` keyed on `(seed_slug, entry_id, axis_branch_id)`.
   *
   * @param patch Field changes to apply alongside the drag/drop, or `null` if only position changed.
   * @param position Opaque fractional-index (or similar) position value used for ordering within the axis bucket.
   * @param axisBranchId Identifies which branch/column axis this position is relative to (e.g. status column).
   * @remarks Unlike {@link create}/{@link update}, this method does not invoke `beforeUpdate`/`afterUpdate`
   *   lifecycle hooks — the `_ctx.actor` parameter is currently unused. Kanban drag-and-drop writes
   *   therefore bypass hook-based side effects (e.g. audit logging) that `update()` would trigger.
   */
  async updateWithKanbanPosition(
    seed: Seed,
    id: string,
    patch: Record<string, unknown> | null,
    position: string,
    axisBranchId: string,
    _ctx: { actor: string },
  ): Promise<{ success: boolean }> {
    try {
      const stmts: D1PreparedStatement[] = []

      if (patch) {
        const { stmt, junctionUpdates } = this.buildUpdateMainStmt(seed, id, patch as Record<string, any>)
        if (stmt) stmts.push(stmt)
        for (const branch of junctionUpdates) {
          const jt = jTable(seed.slug, branch.alias)
          const value = ((patch as Record<string, any>)[branch.alias] ?? []) as string[]
          stmts.push(this.database.prepare(`DELETE FROM ${jt} WHERE parent_id = ?`).bind(id))
          stmts.push(...this.buildJunctionInserts(seed.slug, id, branch.alias, value))
        }
      }

      stmts.push(
        this.database.prepare(`
          INSERT INTO kanban_positions (seed_slug, entry_id, axis_branch_id, position, updated_at)
          VALUES (?, ?, ?, ?, unixepoch())
          ON CONFLICT(seed_slug, entry_id, axis_branch_id)
            DO UPDATE SET position = excluded.position, updated_at = excluded.updated_at
        `).bind(seed.slug, id, axisBranchId, position),
      )

      await this.database.batch(stmts)
      return { success: true }
    } catch (error) {
      throw this.mapError(error, `updateWithKanbanPosition(${seed.slug}, ${id})`)
    }
  }
}
