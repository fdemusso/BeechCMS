import type {
  IAutomationRepository,
  Automation,
  AutomationAction,
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
  created_at: number
  updated_at: number
}

export class D1AutomationRepository implements IAutomationRepository {
  constructor(private readonly db: D1Database) {}

  async findActive(seedSlug: string, event: AutomationTriggerEvent): Promise<Automation[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM automations
         WHERE seed_slug = ? AND trigger_event = ? AND enabled = 1`,
      )
      .bind(seedSlug, event)
      .all<AutomationRow>()
    return (result.results ?? []).map(rowToAutomation)
  }

  list(_seedSlug: string): Promise<Automation[]>          { throw new Error('not implemented in sprint 08') }
  findById(_id: string): Promise<Automation | null>       { throw new Error('not implemented in sprint 08') }
  create(_input: CreateAutomationInput): Promise<string>  { throw new Error('not implemented in sprint 08') }
  update(_id: string, _input: UpdateAutomationInput): Promise<void> { throw new Error('not implemented in sprint 08') }
  toggle(_id: string, _enabled: boolean): Promise<void>  { throw new Error('not implemented in sprint 08') }
  delete(_id: string): Promise<void>                      { throw new Error('not implemented in sprint 08') }
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
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}
