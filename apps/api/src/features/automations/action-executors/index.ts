import type { AutomationAction, ContentRepository, Seed, IIdGenerator } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
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
  context: ResolvedContext
  // TODO Sprint 8: context will also power evaluateWhen() for per-action when-guards
}

export async function executeAction(action: AutomationAction, ctx: ActionContext): Promise<void> {
  switch (action.type) {
    case 'webhook':      return executeWebhook(action, ctx.context)
    case 'send_mail':    return executeSendMail(action, ctx.context, ctx.env)
    case 'edit_field':   return executeEditField(action, ctx.entry, ctx.context, ctx.repository, ctx.seed)
    case 'create_entry': return executeCreateEntry(action, ctx.entry, ctx.repository, ctx.getSeed, ctx.idGenerator)
    default: {
      const _exhaustive: never = action
      throw new Error(`unknown action type: ${(action as { type: string }).type}`)
    }
  }
}
