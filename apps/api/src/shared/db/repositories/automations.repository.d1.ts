// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type {
  IAutomationRepository,
  Automation,
  AutomationAction,
  AutomationTrigger,
  AutomationTriggerEvent,
  CreateAutomationInput,
  UpdateAutomationInput,
  WhenNode,
} from '@beechcms/core'

interface AutomationRow {
  id: string
  seed_slug: string
  name: string
  enabled: number
  triggers: string
  trigger_conditions: string | null
  actions: string
  created_at: number
  updated_at: number
}

export class D1AutomationRepository implements IAutomationRepository {
  constructor(private readonly db: D1Database) {}

  async findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]> {
    const result = seedSlug === '*'
      ? await this.db
          .prepare(
            `SELECT DISTINCT a.* FROM automations a, json_each(a.triggers) t
             WHERE a.enabled = 1 AND json_extract(t.value, '$.event') = ?`,
          )
          .bind(event)
          .all<AutomationRow>()
      : await this.db
          .prepare(
            `SELECT DISTINCT a.* FROM automations a, json_each(a.triggers) t
             WHERE a.seed_slug = ? AND a.enabled = 1 AND json_extract(t.value, '$.event') = ?`,
          )
          .bind(seedSlug, event)
          .all<AutomationRow>()
    return (result.results ?? []).map(rowToAutomation)
  }

  async list(seedSlug: string): Promise<Automation[]> {
    const result = await this.db
      .prepare(`SELECT * FROM automations WHERE seed_slug = ? ORDER BY created_at DESC`)
      .bind(seedSlug)
      .all<AutomationRow>()
    return (result.results ?? []).map(rowToAutomation)
  }

  async findById(id: string): Promise<Automation | null> {
    const row = await this.db
      .prepare(`SELECT * FROM automations WHERE id = ?`)
      .bind(id)
      .first<AutomationRow>()
    return row ? rowToAutomation(row) : null
  }

  async create(input: CreateAutomationInput): Promise<string> {
    const id = crypto.randomUUID()
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(
        `INSERT INTO automations
           (id, seed_slug, name, enabled, triggers, trigger_conditions, actions, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.seed_slug,
        input.name,
        JSON.stringify(input.triggers),
        input.trigger_conditions ? JSON.stringify(input.trigger_conditions) : null,
        JSON.stringify(input.actions),
        now,
        now,
      )
      .run()
    return id
  }

  async update(id: string, input: UpdateAutomationInput): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    const fields: string[] = []
    const values: unknown[] = []

    const map: Record<string, unknown> = {
      seed_slug: input.seed_slug,
      name: input.name,
      triggers: input.triggers !== undefined ? JSON.stringify(input.triggers) : undefined,
      trigger_conditions:
        input.trigger_conditions !== undefined
          ? input.trigger_conditions === null
            ? null
            : JSON.stringify(input.trigger_conditions)
          : undefined,
      actions: input.actions !== undefined ? JSON.stringify(input.actions) : undefined,
    }

    for (const [column, value] of Object.entries(map)) {
      if (value !== undefined) {
        fields.push(`${column} = ?`)
        values.push(value)
      }
    }

    if (fields.length === 0) return

    values.push(now, id)
    await this.db
      .prepare(`UPDATE automations SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`)
      .bind(...values)
      .run()
  }

  async toggle(id: string, enabled: boolean): Promise<void> {
    const now = Math.floor(Date.now() / 1000)
    await this.db
      .prepare(`UPDATE automations SET enabled = ?, updated_at = ? WHERE id = ?`)
      .bind(enabled ? 1 : 0, now, id)
      .run()
  }

  async delete(id: string): Promise<void> {
    await this.db.prepare(`DELETE FROM automations WHERE id = ?`).bind(id).run()
  }
}

function rowToAutomation(row: AutomationRow): Automation {
  return {
    id: row.id,
    seed_slug: row.seed_slug,
    name: row.name,
    enabled: row.enabled === 1,
    triggers: JSON.parse(row.triggers) as AutomationTrigger[],
    trigger_conditions: row.trigger_conditions
      ? (JSON.parse(row.trigger_conditions) as WhenNode)
      : null,
    actions: JSON.parse(row.actions) as AutomationAction[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
