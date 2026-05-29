import re

with open('apps/api/src/shared/content.repository.d1.ts', 'r') as f:
    content = f.read()

# 1. Insert helpers before create
helpers = """
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
          value: typeof value === 'object' ? JSON.stringify(value) : String(value),
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
        const stmts: D1PreparedStatement[] = []

        const setClauses: string[] = ['updated_at = (unixepoch())']
        const setBindings: unknown[] = []

        for (const [alias, update] of Object.entries(fields)) {
          if (update.kind === 'set') {
            setClauses.unshift(`${alias} = ?`)
            setBindings.push(update.value)
          }
        }

        stmts.push(
          this.database
            .prepare(`UPDATE ${tableName} SET ${setClauses.join(', ')} WHERE id = ?`)
            .bind(...setBindings, id),
        )

        for (const [alias, update] of Object.entries(fields)) {
          const jt = jTable(seedSlug, alias)

          if (update.kind === 'array_replace') {
            stmts.push(this.database.prepare(`DELETE FROM ${jt} WHERE parent_id = ?`).bind(id))
            stmts.push(...update.value.map((v, i) => 
              this.database.prepare(`INSERT INTO ${jt} (parent_id, target_id, position) VALUES (?, ?, ?)`).bind(id, v, i)
            ))
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
        }

        const results = await this.database.batch(stmts)
        if ((results[0].meta?.changes ?? 0) === 0) {
          failed.push({ id, reason: 'not-found' })
        } else {
          updated++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const isFk = /FOREIGN KEY constraint failed/i.test(msg)
        failed.push({ id, reason: isFk ? `relation-target-not-found:${id}` : `error:${msg}` })
      }
    }
    return { updated, failed }
  }

  async create("""

content = re.sub(r'  async create\(', helpers, content, count=1)

create_method = """  async create(
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

      const batchStmts: D1PreparedStatement[] = [
        this.buildCreateMainStmt(seed, id, slug, status, data),
      ]

      for (const branch of multiRelBranches(seed)) {
        const value = data[branch.alias]
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
  }"""

content = re.sub(r'  async create\([\s\S]*?async update\(', create_method + '\n\n  async update(', content, count=1)

update_method = """  async update(
    seed: Seed,
    id: string,
    data: Record<string, any>,
    status?: string
  ): Promise<void> {
    try {
      const { stmt, junctionUpdates } = this.buildUpdateMainStmt(seed, id, data, status)
      
      if (!stmt && junctionUpdates.length === 0) return

      const batchStmts: D1PreparedStatement[] = []
      if (stmt) batchStmts.push(stmt)

      for (const branch of junctionUpdates) {
        const jt = jTable(seed.slug, branch.alias)
        const value = (data[branch.alias] ?? []) as string[]
        batchStmts.push(this.database.prepare(`DELETE FROM ${jt} WHERE parent_id = ?`).bind(id))
        batchStmts.push(...this.buildJunctionInserts(seed.slug, id, branch.alias, value))
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
  }"""

content = re.sub(r'  async update\([\s\S]*?async delete\(', update_method + '\n\n  async delete(', content, count=1)


publish_draft = """  async publishDraft(seed: Seed, entryId: string): Promise<void> {
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
        )
        batchStmts.push(...this.buildJunctionInserts(seed.slug, entryId, branch.alias, targetIds))
      }

      await this.database.batch(batchStmts)
    } catch (error) {
      if (error instanceof EntryNotFoundError) throw error
      if (error instanceof RelationTargetNotFoundError) throw error
      throw this.mapError(error, `publishDraft(${seed.slug}, ${entryId})`)
    }
  }"""

content = re.sub(r'  async publishDraft\([\s\S]*?async bulkUpdate\(', publish_draft + '\n\n  async bulkUpdate(', content, count=1)


bulk_update = """  async bulkUpdate(
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
  }"""

content = re.sub(r'  async bulkUpdate\([\s\S]*?async deleteDraft\(', bulk_update + '\n\n  async deleteDraft(', content, count=1)

with open('apps/api/src/shared/content.repository.d1.ts', 'w') as f:
    f.write(content)
