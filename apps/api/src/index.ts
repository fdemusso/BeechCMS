// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createBeechApp } from './factory'
import { SeedRegistry, SystemIdGenerator } from '@beechcms/core'
import type { QueueMessage } from '@beechcms/core'
import { runCronAutomations } from './features/automations/engine/cron-runner'
import { D1AutomationRepository } from './shared/db/repositories/automations.repository.d1'
import { D1ContentRepository } from './shared/db/repositories/content.repository.d1'
import { D1SeedRepository } from './shared/db/repositories/seed.repository.d1'
import { dispatchQueueBatch } from './shared/jobs/queue-consumer'
import { semanticSearchHooks, semanticSearchJobs } from './features/search'
import type { Env } from './types'

const jobs = { ...semanticSearchJobs }

const app = createBeechApp({ seeds: [], jobs, hooks: semanticSearchHooks })

// // TODO: remove debug log endpoints
// const globalLogs: any[] = []
// app.post('/auth/kanban-debug-log', async (c) => {
//   try {
//     const body = await c.req.json()
//     globalLogs.push({
//       timestamp: new Date().toISOString(),
//       message: body.message,
//       data: body.data
//     })
//     if (globalLogs.length > 200) globalLogs.shift()
//     return c.json({ success: true })
//   } catch (err) {
//     return c.json({ error: String(err) }, 500)
//   }
// })
// 
// app.get('/auth/kanban-debug-log', (c) => {
//   return c.json(globalLogs)
// })
// 
// app.delete('/auth/kanban-debug-log', (c) => {
//   globalLogs.length = 0
//   return c.json({ success: true })
// })

app.get('/', (c) => c.text('Beech API is running'))

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (env.ENV === 'development') {
      const checks: Array<{ name: string; url: string }> = [
        { name: 'MinIO',   url: (env.R2_ENDPOINT ?? 'http://localhost:9000') + '/minio/health/live' },
        { name: 'Mailpit', url: `http://${env.SMTP_HOST ?? 'localhost'}:${env.SMTP_PORT ?? '8025'}/livez` },
      ]
      for (const c of checks) {
        fetch(c.url).catch(() => {
          console.warn(
            `\n⚠️  ${c.name} non raggiungibile su ${c.url}\n` +
            `   Beech in dev richiede lo stack Docker completo.\n` +
            `   Avvialo con: pnpm dev:full\n`
          )
        })
      }
    }
    return app.fetch(request, env, ctx)
  },

  async queue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
    if (!env.DB) {
      console.warn('[queue] D1 binding missing. Acking batch without processing.')
      for (const m of batch.messages) m.ack()
      return
    }
    await dispatchQueueBatch(batch as MessageBatch<QueueMessage>, env, ctx, jobs)
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const scheduledTime = controller?.scheduledTime ?? Date.now()

    if (!env.DB) {
      console.warn('[cron] D1 binding missing. Skipping cron automations.')
      return
    }

    const automationRepository = new D1AutomationRepository(env.DB)
    const contentRepository = new D1ContentRepository(env.DB)
    const seedRepository = new D1SeedRepository(env.DB)
    const seeds = await seedRepository.listActive()
    const registry = new SeedRegistry(seeds)
    const getSeed = (slug: string) => registry.get(slug) ?? null

    ctx.waitUntil(
      runCronAutomations(
        {
          automationRepository,
          contentRepository,
          getSeed,
          env: env as unknown as Record<string, string | undefined>,
          idGenerator: SystemIdGenerator,
        },
        scheduledTime,
      ),
    )
  },
} satisfies ExportedHandler<Env>
