/// <reference types="@cloudflare/workers-types" />
import {
  ContentRepository,
  EntryNotFoundError,
  RepositoryError,
  SlugConflictError,
  Seed,
  SelectOptions,
  buildSelectQuery,
  deserializeFromDb,
  serializeForDb,
} from '@beechcms/core'
import { BaseD1Repository } from './base.repository.d1'

export class D1ContentRepository extends BaseD1Repository implements ContentRepository {
  /**
   * Helper to deserialize a DB row using the Seed's branch definitions.
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
      if (Object.hasOwn(row, branch.alias)) {
        data[branch.alias] = deserializeFromDb(branch, row[branch.alias])
      }
    }

    return data
  }

  async findMany(
    seed: Seed,
    options: SelectOptions
  ): Promise<{ items: Record<string, any>[]; total: number }> {
    try {
      const { sql, bindings } = buildSelectQuery(seed, options)
      
      // We need the total count for pagination. 
      // We build a count query by replacing the SELECT part.
      // Note: buildSelectQuery might have joins and where clauses.
      const countSql = sql
        .replace(/SELECT .* FROM/, 'SELECT COUNT(*) as total FROM')
        .replace(/ ORDER BY .*$/, '')
        .replace(/ LIMIT \? OFFSET \?$/, '')
      
      const countBindings = bindings.slice(0, bindings.length - (options.pagination ? 2 : 0))

      const [results, countResult] = await this.db.batch([
        this.db.prepare(sql).bind(...bindings),
        this.db.prepare(countSql).bind(...countBindings)
      ])

      const items = (results.results || []).map((row) => this.rowToData(seed, row))
      const total = (countResult.results?.[0] as any)?.total || 0

      return { items, total }
    } catch (error) {
      throw this.mapError(error, `findMany(${seed.slug})`)
    }
  }

  async findById(seed: Seed, id: string): Promise<Record<string, any>> {
    try {
      const table = this.getTableName(seed.slug)
      const row = await this.db
        .prepare(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`)
        .bind(id)
        .first()

      if (!row) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }

      return this.rowToData(seed, row)
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `findById(${seed.slug}, ${id})`)
    }
  }

  async findBySlug(seed: Seed, slug: string): Promise<Record<string, any>> {
    try {
      const table = this.getTableName(seed.slug)
      const row = await this.db
        .prepare(`SELECT * FROM ${table} WHERE slug = ? LIMIT 1`)
        .bind(slug)
        .first()

      if (!row) {
        throw new EntryNotFoundError(`Entry with slug "${slug}" not found in ${seed.slug}`)
      }

      return this.rowToData(seed, row)
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
      const table = this.getTableName(seed.slug)
      
      // Status counts
      const statusResults = await this.db
        .prepare(`SELECT status, COUNT(*) as count FROM ${table} GROUP BY status`)
        .all()
      
      const statuses: Record<string, number> = {}
      for (const row of statusResults.results || []) {
        statuses[row.status as string] = row.count as number
      }

      // Tags facets (for branches of type 'tags')
      const tagsByColumn: Record<string, string[]> = {}
      const tagBranches = seed.branches.filter(b => b.type === 'tags')
      
      for (const branch of tagBranches) {
        // SQLite json_each for tags stored as JSON arrays
        const tagResults = await this.db
          .prepare(`SELECT DISTINCT value FROM ${table}, json_each(${table}.${branch.alias}) WHERE value IS NOT NULL`)
          .all()
        tagsByColumn[branch.alias] = (tagResults.results || []).map(r => r.value as string)
      }

      return { statuses, tagsByColumn }
    } catch (error) {
      throw this.mapError(error, `getFacets(${seed.slug})`)
    }
  }

  async existsSlug(seed: Seed, slug: string, excludeId?: string): Promise<boolean> {
    try {
      const table = this.getTableName(seed.slug)
      let sql = `SELECT 1 FROM ${table} WHERE slug = ?`
      const bindings: any[] = [slug]
      
      if (excludeId) {
        sql += ` AND id != ?`
        bindings.push(excludeId)
      }
      
      const row = await this.db.prepare(sql).bind(...bindings).first()
      return row !== null
    } catch (error) {
      throw this.mapError(error, `existsSlug(${seed.slug}, ${slug})`)
    }
  }

  async create(
    seed: Seed,
    id: string,
    slug: string,
    status: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      if (await this.existsSlug(seed, slug)) {
        throw new SlugConflictError(`Slug "${slug}" already exists for ${seed.slug}`)
      }

      const table = this.getTableName(seed.slug)
      const cols = ['id', 'slug', 'status']
      const placeholders = ['?', '?', '?']
      const bindings: any[] = [id, slug, status]

      for (const branch of seed.branches) {
        if (Object.hasOwn(data, branch.alias)) {
          cols.push(branch.alias)
          placeholders.push('?')
          bindings.push(serializeForDb(branch, data[branch.alias]))
        }
      }

      const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`
      await this.db.prepare(sql).bind(...bindings).run()
    } catch (error) {
      if (error instanceof SlugConflictError) throw error
      throw this.mapError(error, `create(${seed.slug})`)
    }
  }

  async update(
    seed: Seed,
    id: string,
    data: Record<string, any>,
    status?: string
  ): Promise<void> {
    try {
      const table = this.getTableName(seed.slug)
      const setParts: string[] = []
      const bindings: any[] = []

      if (status) {
        setParts.push('status = ?')
        bindings.push(status)
      }

      for (const branch of seed.branches) {
        if (Object.hasOwn(data, branch.alias)) {
          setParts.push(`${branch.alias} = ?`)
          bindings.push(serializeForDb(branch, data[branch.alias]))
        }
      }

      if (setParts.length === 0) return

      setParts.push('updated_at = (unixepoch())')
      
      const sql = `UPDATE ${table} SET ${setParts.join(', ')} WHERE id = ?`
      bindings.push(id)

      const result = await this.db.prepare(sql).bind(...bindings).run()
      if (result.meta.changes === 0) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `update(${seed.slug}, ${id})`)
    }
  }

  async delete(seed: Seed, id: string): Promise<{ row: Record<string, any> }> {
    try {
      const table = this.getTableName(seed.slug)
      
      // We need to return the row for R2 cleanup
      const row = await this.db
        .prepare(`SELECT * FROM ${table} WHERE id = ?`)
        .bind(id)
        .first()

      if (!row) {
        throw new EntryNotFoundError(`Entry ${id} not found in ${seed.slug}`)
      }

      await this.db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()

      return { row: this.rowToData(seed, row) }
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `delete(${seed.slug}, ${id})`)
    }
  }

  async saveDraft(seed: Seed, entryId: string, data: Record<string, any>): Promise<void> {
    try {
      if (!seed.allowDrafts) {
        throw new RepositoryError(`Drafts not allowed for ${seed.slug}`)
      }

      const table = this.getTableName(seed.slug, true)
      const cols = ['entry_id']
      const placeholders = ['?']
      const bindings: any[] = [entryId]
      const updateParts: string[] = []

      for (const branch of seed.branches) {
        if (Object.hasOwn(data, branch.alias)) {
          const val = serializeForDb(branch, data[branch.alias])
          cols.push(branch.alias)
          placeholders.push('?')
          bindings.push(val)
          updateParts.push(`${branch.alias} = EXCLUDED.${branch.alias}`)
        }
      }

      updateParts.push('updated_at = (unixepoch())')

      const sql = `
        INSERT INTO ${table} (${cols.join(', ')}) 
        VALUES (${placeholders.join(', ')})
        ON CONFLICT(entry_id) DO UPDATE SET ${updateParts.join(', ')}
      `
      await this.db.prepare(sql).bind(...bindings).run()
    } catch (error) {
      throw this.mapError(error, `saveDraft(${seed.slug}, ${entryId})`)
    }
  }

  async getDraft(seed: Seed, entryId: string): Promise<Record<string, any> | null> {
    try {
      if (!seed.allowDrafts) return null

      const table = this.getTableName(seed.slug, true)
      const row = await this.db
        .prepare(`SELECT * FROM ${table} WHERE entry_id = ?`)
        .bind(entryId)
        .first()

      if (!row) return null

      // Filter out nulls from draft row (only include provided fields)
      const data: Record<string, any> = {}
      for (const branch of seed.branches) {
        if (row[branch.alias] !== null) {
          data[branch.alias] = deserializeFromDb(branch, row[branch.alias])
        }
      }

      return data
    } catch (error) {
      throw this.mapError(error, `getDraft(${seed.slug}, ${entryId})`)
    }
  }

  async hasDraft(seed: Seed, entryId: string): Promise<boolean> {
    try {
      if (!seed.allowDrafts) return false
      const table = this.getTableName(seed.slug, true)
      const row = await this.db
        .prepare(`SELECT 1 FROM ${table} WHERE entry_id = ? LIMIT 1`)
        .bind(entryId)
        .first()
      return row !== null
    } catch (error) {
      throw this.mapError(error, `hasDraft(${seed.slug}, ${entryId})`)
    }
  }

  async publishDraft(seed: Seed, entryId: string): Promise<void> {
    try {
      if (!seed.allowDrafts) return

      const draftTable = this.getTableName(seed.slug, true)
      const liveTable = this.getTableName(seed.slug)

      const draftRow = await this.db
        .prepare(`SELECT * FROM ${draftTable} WHERE entry_id = ?`)
        .bind(entryId)
        .first()

      if (!draftRow) {
        throw new EntryNotFoundError(`No draft found for ${entryId} in ${seed.slug}`)
      }

      // Build UPDATE for live table
      const setParts: string[] = []
      const bindings: any[] = []

      for (const branch of seed.branches) {
        if (draftRow[branch.alias] !== null) {
          setParts.push(`${branch.alias} = ?`)
          bindings.push(draftRow[branch.alias])
        }
      }

      setParts.push('updated_at = (unixepoch())')
      
      const updateSql = `UPDATE ${liveTable} SET ${setParts.join(', ')} WHERE id = ?`
      bindings.push(entryId)

      // Atomic batch
      await this.db.batch([
        this.db.prepare(updateSql).bind(...bindings),
        this.db.prepare(`DELETE FROM ${draftTable} WHERE entry_id = ?`).bind(entryId)
      ])
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      throw this.mapError(error, `publishDraft(${seed.slug}, ${entryId})`)
    }
  }

  async deleteDraft(seed: Seed, entryId: string): Promise<void> {
    try {
      if (!seed.allowDrafts) return
      const table = this.getTableName(seed.slug, true)
      await this.db.prepare(`DELETE FROM ${table} WHERE entry_id = ?`).bind(entryId).run()
    } catch (error) {
      throw this.mapError(error, `deleteDraft(${seed.slug}, ${entryId})`)
    }
  }
}
