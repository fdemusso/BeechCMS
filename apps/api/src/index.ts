import { createBeechApp } from './factory'
import { SeedRegistry, SystemIdGenerator } from '@beechcms/core'
import { runCronAutomations, AutomationRunner } from './features/automations'
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
  fetch: app.fetch,

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (!env.DB) {
      console.warn('[cron] D1 binding missing. Skipping cron automations.')
      return
    }

    const automationRepository = new D1AutomationRepository(env.DB)
    const contentRepository = new D1ContentRepository(env.DB)
    const idGenerator = SystemIdGenerator
    const registry = new SeedRegistry(validSeeds)
    const getSeed = (slug: string) => registry.get(slug) ?? null

    const runner = new AutomationRunner({
      automationRepository,
      contentRepository,
      getSeed,
      idGenerator,
      env: env as unknown as Record<string, string | undefined>,
    })

    ctx.waitUntil(
      runCronAutomations(
        { automationRepository, runner, contentRepository, getSeed },
        controller.scheduledTime,
      ),
    )
  },
} satisfies ExportedHandler<Env>
