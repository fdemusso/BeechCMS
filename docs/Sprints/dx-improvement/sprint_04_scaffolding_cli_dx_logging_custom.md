## ── Sprint 4: Scaffolding, CLI DX & Logging Custom ──

### Problema
Quando uno sviluppatore crea un nuovo progetto Beech usando `npm create beechcms@latest`, ottiene una configurazione vuota. Non ci sono esempi pratici di rotte custom, middleware o hook sincroni. Inoltre, i log delle rotte custom create dagli sviluppatori non compaiono nel sistema di monitoraggio locale di Beech (`dev-cli` TUI).

### Soluzione proposta
Migliorare lo scaffolding e l'integrazione del logging.

#### 1. Template Completo in `bin/create.mjs`
Modificare lo script di creazione [create.mjs](file:///c:/Users/flavi/Desktop/beech-cms/bin/create.mjs) per generare:
- Un file `seeds.ts` con schemi commentati.
- Un file `worker.ts` che implementa una rotta custom e un hook di esempio (es. logica di validazione prima di creare un utente o invio notifica sincrona).

```typescript
// template generato in worker.ts
import { createBeechApp } from '@beechcms/api'
import { SEED_REGISTRY } from './seeds'

export default createBeechApp({
  seeds: Object.values(SEED_REGISTRY),
  hooks: {
    beforeCreate: async (entry, { seedSlug }) => {
      console.log(`[Lifecycle Hook] Creazione di un nuovo record in: ${seedSlug}`);
      if (seedSlug === 'posts' && !entry.title) {
        throw new Error('Il titolo è obbligatorio per pubblicare un post.');
      }
    }
  },
  customRoutes: (app) => {
    app.get('/api/custom-health', (c) => c.json({ status: 'ok', time: Date.now() }));
  }
});
```

#### 2. Logging delle rotte custom in `dev-cli`
Garantire che l'interfaccia interattiva del terminale (`dev-cli`) intercetti e formatti correttamente le chiamate verso le rotte custom, mostrando chiaramente i log di debug dello sviluppatore con etichette chiare.

### Checklist di Implementazione (Sprint 4)
- [ ] Aggiornare i template di scaffolding in `bin/templates/` per includere esempi pratici di custom routes e hooks.
- [ ] Aggiornare `bin/create.mjs` per inserire la configurazione `hooks` e `customRoutes` base commentata.
- [ ] Testare lo scaffolding interattivo in locale garantendo che un progetto appena generato superi i controlli e si avvii senza errori.
- [ ] Aggiornare la documentazione di sviluppo (`docs/development.md`) con una sezione intitolata "Creare API Custom e Utilizzare gli Hook di Ciclo di Vita".
