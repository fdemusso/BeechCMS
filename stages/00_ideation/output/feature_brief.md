## ── Sprint 7: Background Queues & Job Handlers ──

### Problema
Le piattaforme edge-native (come Cloudflare Workers) impongono rigidi limiti di tempo di CPU per singola richiesta. Se uno sviluppatore ha bisogno di svolgere operazioni pesanti o di lunga durata (es. esportare 10.000 record, convertire video, inviare 50 email, sincronizzare periodicamente un CRM), non può farlo all'interno di una rotta HTTP senza rischiare timeout.

### Soluzione proposta: IQueueService & Background Job Registry
Fornire un'astrazione unificata sopra **Cloudflare Queues** o **Upstash QStash** per accodare ed eseguire compiti asincroni.

#### 1. Dichiarazione ed Enqueue all'interno delle rotte custom
Gli sviluppatori possono accodare un lavoro direttamente tramite Hono context:

```typescript
protectedRouter.post('/import-data', async (c) => {
  const { fileKey } = await c.req.json();
  
  // Accoda il lavoro in background. Non blocca l'edge worker.
  await c.get('queue').enqueue('process-csv-job', { fileKey });

  return c.json({ status: 'queued' });
});
```

#### 2. Definizione del Consumer dei Job nel Worker
Abilitare la registrazione dei worker asincroni:

```typescript
export default createBeechApp({
  seeds,
  jobs: {
    'process-csv-job': async (payload, { db, bucket }) => {
      // Codice pesante eseguito asincronamente dall'edge queue worker...
      console.log('Elaborazione del file:', payload.fileKey);
    }
  }
});
```

### Checklist di Implementazione (Sprint 7)
- [ ] Definire l'interfaccia `IQueueService` in `packages/core/src/queue.interface.ts`.
- [ ] Creare l'implementazione basata sul binding `Queue` di Cloudflare ed il fallback in-memory per lo sviluppo locale offline.
- [ ] Aggiornare il file principale di esportazione di Cloudflare Workers (`apps/api/src/index.ts`) per esporre l'handler `queue(batch, env, ctx)` che intercetta i messaggi in arrivo e li dispensa ai job registrati in `createBeechApp`.
- [ ] Aggiungere test integrati simulando il consumo di batch di messaggi di coda.
