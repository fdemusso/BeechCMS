import { createBeechApp } from './factory'

/**
 * Entry point per lo sviluppo locale del monorepo.
 * In produzione (progetto utente), viene usato worker.ts che importa createBeechApp.
 */
const app = createBeechApp({ seeds: [] })

app.get('/', (c) => c.text('Beech API is running (Production Ready Mode)'))

export default app
