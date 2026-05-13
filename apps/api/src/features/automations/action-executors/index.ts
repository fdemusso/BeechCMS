import type { AutomationAction, ContentRepository, Seed, IIdGenerator } from '@beechcms/core'
import { executeWebhook }     from './webhook.executor'
import { executeSendMail }    from './send-mail.executor'
import { executeEditField }   from './edit-field.executor'
import { executeCreateEntry } from './create-entry.executor'

export interface ActionContext {
  entry: Record<string, unknown>
  env: Record<string, string | undefined>
  repository: ContentRepository
  getSeed: (slug: string) => Seed | null
  seed: Seed
  idGenerator: IIdGenerator
}

export async function executeAction(action: AutomationAction, ctx: ActionContext): Promise<void> {
  switch (action.type) {
    case 'webhook':      return executeWebhook(action, ctx.entry)
    case 'send_mail':    return executeSendMail(action, ctx.entry, ctx.env)
    case 'edit_field':   return executeEditField(action, ctx.entry, ctx.repository, ctx.seed)
    case 'create_entry': return executeCreateEntry(action, ctx.entry, ctx.repository, ctx.getSeed, ctx.idGenerator)
    default: {
      const _exhaustive: never = action
      throw new Error(`unknown action type: ${(action as { type: string }).type}`)
    }
  }
}
