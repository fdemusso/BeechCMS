// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AutomationAction, ContentRepository, Seed, IIdGenerator } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
import { executeWebhook }      from './webhook.executor'
import { executeSendMail }     from './send-mail.executor'
import { executeEditField }    from './edit-field.executor'
import { executeCreateEntry }  from './create-entry.executor'
import { executeSetVariable }  from './set-variable.executor'

export interface ActionContext {
  entry: Record<string, unknown>
  env: Record<string, string | undefined>
  repository: ContentRepository
  getSeed: (slug: string) => Seed | null
  seed: Seed
  idGenerator: IIdGenerator
  context: ResolvedContext
  variables: Record<string, unknown>
  // TODO Sprint 8: context will also power evaluateWhen() for per-action when-guards
}

export async function executeAction(action: AutomationAction, ctx: ActionContext): Promise<void> {
  switch (action.type) {
    case 'set_variable':  return executeSetVariable(action, ctx)
    case 'webhook':       return executeWebhook(action, ctx.context, ctx.env)
    case 'send_mail':     return executeSendMail(action, ctx.context, ctx.env)
    case 'edit_field':    return executeEditField(action, ctx.entry, ctx.context, ctx.repository, ctx.seed)
    case 'create_entry':  return executeCreateEntry(action, ctx.entry, ctx.repository, ctx.getSeed, ctx.idGenerator)
    default: {
      const _exhaustive: never = action
      throw new Error(`unknown action type: ${(action as { type: string }).type}`)
    }
  }
}
