## ── Sprint 12: Developer Testing Harness & Mocking ──

### Problema
Quando uno sviluppatore implementa logiche custom complesse (come middleware di cifratura, hook sincroni di validazione o elaborazioni su code), ha bisogno di poterle testare in modo rapido e automatico tramite unit test locali. Tuttavia, configurare un test environment per Cloudflare Workers (inizializzare D1 locale, creare le tabelle dei seed, configurare il token service, firmare JWT di prova e simulare richieste Hono) richiede una quantità enorme di boilerplate e configurazioni manuali (es. configurare Miniflare o wrangler runner).

### Soluzione proposta: `@beechcms/testing` (Harness di Test)
Fornire un'infrastruttura di testing preconfezionata che permetta di testare l'applicazione in isolamento locale, riducendo a zero il setup iniziale.

#### 1. Utilizzo dell'Harness nei Test
Lo sviluppatore importa il modulo di testing per simulare l'app e le sessioni:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestHarness } from '@beechcms/testing'
import myAppConfig from './worker' // Configurazione del worker Beech del progetto

describe('Rotte Custom & Hook', () => {
  let harness: ReturnType<typeof createTestHarness>;

  beforeEach(async () => {
    // Inizializza un database SQLite in-memory, crea le tabelle dei seed e avvia l'app
    harness = await createTestHarness(myAppConfig);
  });

  it('dovrebbe impedire la creazione di post senza titolo (beforeCreate hook)', async () => {
    // client autenticato con un ruolo specifico
    const client = harness.asUser({ role: 'admin' });

    const res = await client.request('/api/content/posts', {
      method: 'POST',
      body: JSON.stringify({ body: 'Contenuto valido' })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('titolo è obbligatorio');
  });
});
```

### Checklist di Implementazione (Sprint 12)
- [ ] Creare il modulo `@beechcms/testing` (può essere integrato come esportazione secondaria in `@beechcms/api/testing`).
- [ ] Fornire una funzione `createTestHarness(config)` che:
  - Istanzia un D1 mockato in-memory (utilizzando una connessione SQLite in-memory o Miniflare).
  - Popola automaticamente il database con le tabelle e gli indici previsti dai Seed registrati.
  - Genera istanze mockate di `ITokenService` e `IClock` controllabili per testare la scadenza di token o password.
- [ ] Implementare un client di richiesta HTTP fittizio che simula chiamate verso l'app Hono iniettando gli header Bearer JWT corretti basati sui ruoli passati in `.asUser()`.
- [ ] Aggiornare lo scaffolding del progetto per generare un file `vitest.config.ts` e un test di esempio funzionante.
