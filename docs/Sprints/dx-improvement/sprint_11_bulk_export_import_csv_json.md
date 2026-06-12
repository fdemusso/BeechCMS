## ── Sprint 11: Bulk Export & Import (CSV/JSON) ──

### Problema
Gli sviluppatori o i clienti commerciali che usano Beech hanno spesso necessità di fare migrazioni massive di dati (es. importare 2000 prodotti da un vecchio e-commerce, scaricare la lista dei messaggi clienti in formato CSV per analizzarla su Excel). Scrivere script custom per ciascun cliente peggiora notevolmente la DX.

### Soluzione proposta: Endpoint Bulk standard e validati
Fornire percorsi nativi e standardizzati per l'importazione ed esportazione di massa di ciascun tipo di contenuto, con validazione rigida.

#### 1. Esportazione
`GET /api/content/:slug/export?format=csv|json` genera uno stream del database serializzato.
La risposta viene impaginata ed emessa come stream per evitare limiti di memoria.

#### 2. Importazione
`POST /api/content/:slug/import` accetta un file di payload (CSV o JSON).
Beech esegue il parsing del file riga per riga, applica la validazione del Botanical Engine, inserisce i record validi in transazione su D1 e restituisce un report riassuntivo (es. *198 inseriti, 2 falliti a causa di campi obbligatori mancanti nella riga 45 e 120*).

### Checklist di Implementazione (Sprint 11)
- [ ] Creare helper in `@beechcms/core` per serializzare e deserializzare dati tabellari da/a formato CSV.
- [ ] Implementare gli endpoint `/export` e `/import` nel modulo di content feature.
- [ ] Integrare un report dettagliato degli errori nell'importazione bulk per permettere una facile correzione.
- [ ] Scrivere unit test per verificarlo (es. rollback o report di inserimento parziale).
