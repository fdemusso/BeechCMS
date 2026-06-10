## ── Sprint 10: Realtime Updates via Server-Sent Events (SSE) ──

### Problema
Molti backend moderni richiedono aggiornamenti in tempo reale (es. aggiornare una Dashboard live, notificare l'arrivo di un nuovo messaggio o l'aggiornamento di uno stato). Costringere i client a effettuare continui polling consuma inutilmente risorse di CPU e banda, oltre a offrire una DX scarsa.

### Soluzione proposta: SSE Isomorphic Stream
Implementare un canale di streaming edge-native basato su **Server-Sent Events (SSE)** integrato in Hono.

#### 1. Abbonamento dal Client SDK
Lo sviluppatore può abbonarsi agli eventi di mutazione di un determinato Seed:

```typescript
// Sotto la scocca usa EventSource / SSE
const subscription = beech.content('articoli').subscribe((event) => {
  console.log(`Evento ${event.type} su articolo:`, event.data);
});

// Per disiscriversi
subscription.unsubscribe();
```

#### 2. Triggers del Canale Realtime
All'interno dei lifecycle hooks o dell'esecuzione del repository, Beech pubblicherà gli eventi di mutazione (`create`, `update`, `delete`) verso i flussi SSE attivi, inviando il payload aggiornato in tempo reale.

### Checklist di Implementazione (Sprint 10)
- [ ] Creare l'endpoint `GET /api/content/:slug/subscribe` che tiene aperta la connessione HTTP con il client utilizzando lo streaming nativo di Hono (`hono/streaming`).
- [ ] Implementare un meccanismo leggero di pub-sub in-memory (per singolo isolate) e tracciare le connessioni attive.
- [ ] Estendere il `@beechcms/client` per connettersi all'endpoint SSE tramite la classe nativa del browser `EventSource` (o polyfill per Node.js).
- [ ] Scrivere test di integrazione per verificare che un inserimento su un Seed propaghi correttamente il messaggio a un client connesso in streaming.
