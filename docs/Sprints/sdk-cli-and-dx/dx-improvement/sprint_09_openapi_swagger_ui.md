## ── Sprint 9: OpenAPI & Swagger UI ──

### Problema
Senza documentazione interattiva aggiornata, gli sviluppatori che integrano Beech in altre applicazioni (es. frontend web, app native iOS/Android, o script esterni) faticano a comprendere quali campi siano opzionali, quali tipi di dato siano supportati o quali siano i payloads corretti per ciascun Seed. La documentazione scritta a mano invecchia rapidamente e rischia di andare fuori sincrono con le modifiche dello schema.

### Soluzione proposta: Generazione OpenAPI da Hono
Integrare il modulo `@hono/zod-openapi` nel core di Beech per generare in modo completamente dinamico e trasparente le specifiche OpenAPI a runtime.

#### 1. Registrazione degli Schemi
Il Botanical Engine compilerà i Seed non solo in tabelle SQL ma anche in schemi Zod conformi a OpenAPI.
All'avvio dell'applicazione, Beech esporrà:
- `GET /api/docs/openapi.json` $\rightarrow$ Restituisce il file JSON conforme a OpenAPI v3.
- `GET /api/docs/swagger` $\rightarrow$ Serve una pagina HTML statica con **Swagger UI** o **Scalar** per consentire agli sviluppatori di testare le chiamate API direttamente dal browser.

### Checklist di Implementazione (Sprint 9)
- [ ] Aggiungere `@hono/zod-openapi` alle dipendenze di `apps/api`.
- [ ] Configurare il generatore di schemi in core per tradurre la lista di `Branch[]` in un oggetto `z.object` compatibile con OpenAPI.
- [ ] Creare gli endpoint `/api/docs/openapi.json` e `/api/docs/swagger` nel factory principale.
- [ ] Scrivere unit test per verificare la correttezza formale della specifica OpenAPI generata.
