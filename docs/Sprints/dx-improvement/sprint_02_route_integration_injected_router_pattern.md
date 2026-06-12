## ── Sprint 2: Route Integration & Injected Router Pattern ──

### Problema
Esportare pubblicamente i middleware di autenticazione (`authMiddleware`) e di database (`repositoryMiddleware`) per farli utilizzare direttamente agli sviluppatori presenta diversi rischi:
1. **Accoppiamento Forte (Tight Coupling):** Gli sviluppatori si legano all'esatto framework di routing (Hono) e all'ordine di applicazione dei middleware interni.
2. **Rischi di Sicurezza (Security Invariants):** Uno sviluppatore potrebbe dimenticare di applicare `authMiddleware()` su una rotta custom privata, oppure configurarlo in modo errato (es. dopo i gestori anziché prima), esponendo dati protetti.
3. **Mancanza di Incapsulamento:** Se in futuro Beech cambia il meccanismo di autenticazione (es. da JWT Bearer token a cookie HTTP-only o chiavi API esterne), tutti i file degli sviluppatori che importano `authMiddleware` si romperebbero.

### Soluzione proposta: Injected Routers (IoC / Dependency Injection)
Invece di esportare i singoli middleware, Beech gestisce internamente la sicurezza dei percorsi e passa agli sviluppatori due istanze pre-configurate di router: una **pubblica** e una **protetta** (autenticata).

#### 1. Configurazione di `BeechConfig` e tipi in `@beechcms/api`
Aggiornare `packages/api/src/index.ts` per esportare solo i tipi di configurazione e di ambiente, senza esportare i middleware interni:

```typescript
// packages/api/src/index.ts
export { createBeechApp } from './factory'
export type { BeechConfig } from './factory'
export type { Env, Variables } from './types'
```

#### 2. Definizione del Callback in `apps/api/src/factory.ts`
Permettere di passare una funzione che accetta i router pronti all'uso:

```typescript
// apps/api/src/factory.ts
import { Hono } from 'hono'

export interface BeechConfig {
  seeds: Seed[];
  // Iniezione di istanze pre-configurate e pre-protette
  customRoutes?: (routers: {
    publicRouter: Hono<{ Bindings: Env; Variables: Variables }>;
    protectedRouter: Hono<{ Bindings: Env; Variables: Variables }>;
  }) => void;
  // ... altri campi esistenti
}

export function createBeechApp(config: BeechConfig) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  
  // ... setup middleware globali (database, rate limit, ecc.) ...

  // Creazione dei router dedicati per lo sviluppatore
  const publicRouter = new Hono<{ Bindings: Env; Variables: Variables }>();
  const protectedRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

  // Applichiamo AUTOMATICAMENTE l'autenticazione solo sul router protetto
  protectedRouter.use('*', authMiddleware());

  // Registrazione delle rotte da parte dello sviluppatore
  if (config.customRoutes) {
    config.customRoutes({ publicRouter, protectedRouter });
  }

  // Montiamo i router custom sotto namespace sicuri
  app.route('/api/custom/public', publicRouter);
  app.route('/api/custom', protectedRouter); // Eredita il path /api/custom/* protetto

  // ... setup rotte standard Beech ...
  return app;
}
```

#### 3. Esempio d'uso DX definitivo per lo sviluppatore (Sicuro al 100%)
Lo sviluppatore non importa alcun middleware di Beech. Deve solo agganciare i suoi endpoint al router corretto:

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
      const repo = c.get('repository'); // Tipizzato ed esistente!
      const activeEntries = await repo.findMany('articoli', { filters: [] });
      return c.json({ count: activeEntries.length });
    });
  }
});
```

### Checklist di Implementazione (Sprint 2)
- [ ] Modificare la firma di `BeechConfig` per supportare `customRoutes` con l'oggetto `{ publicRouter, protectedRouter }`.
- [ ] Implementare l'inizializzazione e il montaggio dei router all'interno del factory di `apps/api`.
- [ ] Verificare che il contesto (`Env` e `Variables`) sia propagato correttamente in entrambi i router custom per mantenere l'autocompletamento dei repository.
- [ ] Scrivere test di integrazione per garantire che qualsiasi richiesta a `protectedRouter` senza Bearer token valido restituisca immediatamente `401 Unauthorized` senza invocare il codice del gestore dello sviluppatore.
