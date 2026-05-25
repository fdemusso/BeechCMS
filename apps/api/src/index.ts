import { createBeechApp } from './factory'
import { SeedRegistry, SystemIdGenerator } from '@beechcms/core'
import { runCronAutomations } from './features/automations'
import { D1AutomationRepository } from './shared/automations.repository.d1'
import { D1ContentRepository } from './shared/content.repository.d1'
import type { Env } from './types'

let seeds: any[] = []

try {
  // @ts-ignore
  const mod = await import('../seed.ts')
  const registry = mod.default || mod.SEED_REGISTRY || mod
  seeds = (typeof registry === 'object' && !Array.isArray(registry))
    ? Object.values(registry)
    : registry
} catch (e) {
  // Fallback se seed.ts non esiste
}

const app = createBeechApp({ seeds })

app.get('/', (c) => c.text('Beech API is running (Local Dev Mode)'))

const validSeeds = seeds.filter((s: any) => s && typeof s === 'object' && 'slug' in s)

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (env.ENV === 'development' && env.R2_ENDPOINT) {
      fetch(env.R2_ENDPOINT + '/minio/health/live').catch(() => {
        console.warn(
          '\n⚠️  STORAGE NON RAGGIUNGIBILE su ' + env.R2_ENDPOINT + '\n' +
          '   Gli upload media falliranno. Avvia MinIO con:\n' +
          '     npm run dev:storage    (oppure usa "npm run dev:full" la prossima volta)\n'
        )
      })
    }
    return app.fetch(request, env, ctx)
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const scheduledTime = controller?.scheduledTime ?? Date.now()

    if (!env.DB) {
      console.warn('[cron] D1 binding missing. Skipping cron automations.')
      return
    }

    const automationRepository = new D1AutomationRepository(env.DB)
    const contentRepository = new D1ContentRepository(env.DB)
    const registry = new SeedRegistry(validSeeds)
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
