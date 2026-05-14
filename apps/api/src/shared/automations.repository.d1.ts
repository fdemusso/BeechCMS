import type {
  IAutomationRepository,
  Automation,
  AutomationAction,
  AutomationContextLoad,
  TriggerCondition,
  AutomationTriggerEvent,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@beechcms/core'

interface AutomationRow {
  id: string
  seed_slug: string
  name: string
  enabled: number
  trigger_event: AutomationTriggerEvent
  trigger_cron: string | null
  trigger_conditions: string | null
  actions: string
  context: string | null
  created_at: number
  updated_at: number
}

export class D1AutomationRepository implements IAutomationRepository {
  constructor(private readonly db: D1Database) {}

  async findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]> {
    const result = seedSlug === '*'
      ? await this.db
          .prepare(`SELECT * FROM automations WHERE trigger_event = ? AND enabled = 1`)
          .bind(event)
          .all<AutomationRow>()
      : await this.db
          .prepare(`SELECT * FROM automations WHERE seed_slug = ? AND trigger_event = ? AND enabled = 1`)
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
           (id, seed_slug, name, enabled, trigger_event, trigger_cron,
            trigger_conditions, actions, context, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.seed_slug,
        input.name,
        input.trigger_event,
        input.trigger_cron ?? null,
        input.trigger_conditions ? JSON.stringify(input.trigger_conditions) : null,
        JSON.stringify(input.actions),
        input.context ? JSON.stringify(input.context) : null,
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
      trigger_event: input.trigger_event,
      trigger_cron: input.trigger_cron,
      trigger_conditions:
        input.trigger_conditions !== undefined
          ? input.trigger_conditions === null
            ? null
            : JSON.stringify(input.trigger_conditions)
          : undefined,
      actions: input.actions !== undefined ? JSON.stringify(input.actions) : undefined,
      context:
        input.context !== undefined
          ? input.context === null
            ? null
            : JSON.stringify(input.context)
          : undefined,
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
    trigger_event: row.trigger_event,
    trigger_cron: row.trigger_cron,
    trigger_conditions: row.trigger_conditions
      ? (JSON.parse(row.trigger_conditions) as TriggerCondition[])
      : null,
    actions: JSON.parse(row.actions) as AutomationAction[],
    context: row.context
      ? (JSON.parse(row.context) as AutomationContextLoad[])
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
