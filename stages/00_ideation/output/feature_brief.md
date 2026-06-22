## ── Sprint 5: Type-Safe Client SDK & Webhook Verifier ──

### Problema
Anche dopo aver autogenerato i tipi TypeScript (Sprint 3), gli sviluppatori che creano frontend (es. un sito in Next.js, un'app mobile) devono comunque effettuare chiamate HTTP grezze (`fetch` o `axios`) verso l'API di Beech. Questo significa:
1. Scrivere manualmente l'URL degli endpoint (es. `/api/v1/public/articoli`).
2. Configurare gli header di autorizzazione (`X-API-Key` o `Authorization`) in ogni richiesta.
3. Gestire manualmente il parsing e l'associazione dei tipi TypeScript.
4. Non avere un'interfaccia flessibile e unificata per filtri, ordinamento e paginazione.

Inoltre, per i webhook in uscita, altri microservizi che ricevono eventi da Beech hanno bisogno di validare la firma crittografica del payload per evitare attacchi di spoofing.

### Soluzione proposta: `@beechcms/client` (Isomorphic JS/TS SDK)
Creare un nuovo pacchetto leggero e agnostico rispetto al runtime (funziona su Node.js, browser, edge workers) che funga da client ufficiale.

#### 1. Utilizzo del Client Tipizzato nel Frontend
Il client consuma i tipi generati nello Sprint 3 per offrire l'autocompletamento totale dei seed e dei campi:

```typescript
import { createBeechClient } from '@beechcms/client'
import type { SeedRegistryTypes } from './beech-types' // Generati da CLI Codegen

const beech = createBeechClient<SeedRegistryTypes>({
  baseUrl: 'https://api.miobeech.com',
  apiKey: 'public-read-key-xyz',
})

// Autocompleta 'articoli' e sa che restituisce un array di Articolo!
const { data, error } = await beech.content('articoli').list({
  filter: {
    status: 'published',
    price: { gt: 10 }
  },
  sort: { created_at: 'desc' },
  limit: 10
})
```

#### 2. Integrazione Webhook Verifier per Servizi Esterni
Fornire una utility integrata per validare le richieste in entrata da Beech in altri server Node/Next.js:

```typescript
import { verifyBeechSignature } from '@beechcms/client'

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('X-Beech-Signature');
  const secret = process.env.BEECH_WEBHOOK_SECRET;

  const isValid = await verifyBeechSignature(body, signature, secret);
  if (!isValid) {
    return new Response('Unauthorized Signature', { status: 401 });
  }

  // Esegui la logica di business...
}
```

### Checklist di Implementazione (Sprint 5)
- [ ] Creare un nuovo pacchetto `packages/client/` nel monorepo.
- [ ] Implementare `createBeechClient` con supporto a:
  - Richieste autenticate via API Key.
  - Query builder per filtri complessi (mappando l'oggetto filter di TypeScript nei parametri FTS/D1 di Beech).
  - Paginazione trasparente e gestione degli errori standard.
- [ ] Integrare e testare l'algoritmo di validazione HMAC-SHA256 (`verifyBeechSignature`) riutilizzando le logiche crittografiche sicure di `@beechcms/core`.
- [ ] Scrivere unit test per il client mockando le risposte delle API.
