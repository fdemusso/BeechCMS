## ── Sprint 2: Route Integration & Injected Router Pattern ──

### Problema
Esportare pubblicamente i middleware di autenticazione (`authMiddleware`) e di database (`repositoryMiddleware`) per farli utilizzare direttamente agli sviluppatori presenta diversi rischi:
1. **Accoppiamento Forte (Tight Coupling):** Gli sviluppatori si legano all'esatto framework di routing (Hono) e all'ordine di applicazione dei middleware interni.
2. **Rischi di Sicurezza (Security Invariants):** Uno sviluppatore potrebbe dimenticare di applicare `authMiddleware()` su una rotta custom privata, oppure configurarlo in modo errato (es. dopo i gestori anziché prima), esponendo dati protetti.
3. **Mancanza di Incapsulamento:** Se in futuro Beech cambia il meccanismo di autenticazione (es. da JWT Bearer token a cookie HTTP-only o chiavi API esterne), tutti i file degli sviluppatori che importano `authMiddleware` si romperebbero.

### Soluzione proposta: Injected Routers (IoC / Dependency Injection)
Invece di esportare i singoli middleware, Beech gestisce internamente la sicurezza dei percorsi e passa agli sviluppatori due istanze pre-configurate di router: una **pubblica** e una **protetta** (autenticata).

#### 1. Configurazione di `BeechConfig` e tipi in `@beechcms/api`
Aggiornare [factory.ts](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/api/src/factory.ts) (che funge da entrypoint del package `@beechcms/api`) per esportare i tipi di configurazione, ambiente e contesti necessari, senza esportare i middleware interni:

```typescript
// Aggiungere in apps/api/src/factory.ts
export type { Env, Variables, AppEnv } from './types'
```

#### 2. Definizione del Callback in `apps/api/src/factory.ts`
Permettere di passare una funzione che accetta i router pronti all'uso. I router custom dello sviluppatore devono essere registrati nel router principale **prima** di montare `apiProtected` per evitare problemi di shadowing del percorso `/api`, e nell'ordine specificato per evitare conflitti di prefix matching:

```typescript
// apps/api/src/factory.ts
import { Hono } from 'hono'
import type { AppEnv } from './types'

export interface BeechConfig {
  seeds: Seed[] | Record<string, Seed>;
  repository?: ContentRepository;
  idempotencyRepository?: IdempotencyRepository;
  bucket?: BeechBucket;
  mediaRepository?: MediaRepository;
  systemStatsRepository?: SystemStatsRepository;
  seedRepository?: ISeedRepository;
  hooks?: BeechHooks;

  // Iniezione di istanze pre-configurate e pre-protette
  customRoutes?: (routers: {
    publicRouter: Hono<AppEnv>;
    protectedRouter: Hono<AppEnv>;
  }) => void;
}

export function createBeechApp(config: BeechConfig) {
  const app = new Hono<AppEnv>();
  
  // ... setup middleware globali (database, rate limit, ecc.) ...

  // Montaggio dei router custom dello sviluppatore (prima di apiProtected per evitare shadowing)
  if (config.customRoutes) {
    const publicRouter = new Hono<AppEnv>();
    const protectedRouter = new Hono<AppEnv>();

    // Applichiamo AUTOMATICAMENTE l'autenticazione solo sul router protetto
    protectedRouter.use('*', authMiddleware());

    // Registrazione delle rotte da parte dello sviluppatore
    config.customRoutes({ publicRouter, protectedRouter });

    // Montiamo i router custom sotto namespace sicuri (ordine critico per Hono prefix matching)
    app.route('/api/custom/public', publicRouter);
    app.route('/api/custom', protectedRouter); // Eredita il path /api/custom/* protetto
  }

  // ... setup rotte standard Beech (es. app.route('/api', apiProtected)) ...
  return app;
}
```

#### 3. Esempio d'uso DX definitivo per lo sviluppatore (Sicuro al 100%)
Lo sviluppatore non importa alcun middleware di Beech. Deve solo agganciare i suoi endpoint al router corretto. Per accedere al repository, lo sviluppatore ricava il `Seed` usando l'helper `getSeed` e destruttura il campo `items` restituito da `findMany`:

```typescript
// worker.ts nel progetto dello sviluppatore
import { createBeechApp } from '@beechcms/api'
import { SEED_REGISTRY } from './seeds'

export default createBeechApp({
  seeds: Object.values(SEED_REGISTRY),
  customRoutes: ({ publicRouter, protectedRouter }) => {
    // 1. Questa rotta è pubblica e non richiede auth
    publicRouter.get('/hello', (c) => c.text('Hello World'));

    // 2. Questa rotta è protetta nativamente! Nessun middleware da importare.
    protectedRouter.get('/stats-summary', async (c) => {
      const getSeed = c.get('getSeed');
      const seed = getSeed('articoli');
      if (!seed) {
        return c.json({ error: 'Seed articoli non trovato' }, 404);
      }

      const repo = c.get('repository'); // Tipizzato ed esistente!
      const { items } = await repo.findMany(seed, { filters: [] });
      return c.json({ count: items.length });
    });
  }
});
```

### Checklist di Implementazione (Sprint 2)
- [ ] Modificare la firma di `BeechConfig` in `apps/api/src/factory.ts` per supportare `customRoutes` con l'oggetto `{ publicRouter, protectedRouter }`.
- [ ] Implementare l'inizializzazione e il montaggio ordinato dei router all'interno del factory di `apps/api/src/factory.ts` prima di `apiProtected`.
- [ ] Esportare `Env`, `Variables` e `AppEnv` da `apps/api/src/factory.ts`.
- [ ] Verificare che il contesto (`Env`, `Variables`, `AppEnv`) sia propagato correttamente in entrambi i router custom per mantenere l'autocompletamento dei repository.
- [ ] Scrivere test di integrazione per garantire che qualsiasi richiesta a `protectedRouter` senza Bearer token valido restituisca immediatamente `401 Unauthorized` senza invocare il codice del gestore dello sviluppatore.
- [ ] Scrivere test di integrazione per verificare che le rotte su `publicRouter` siano accessibili senza autenticazione e che non vengano intercettate dal middleware di `/api`.

