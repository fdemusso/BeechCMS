import { createBeechApp } from './factory'

/**
 * Entry point per lo sviluppo locale del monorepo.
 * Carica dinamicamente seed.ts o seeds.ts dalla root di apps/api se presenti.
 */
let seeds: any = []

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

export default app
