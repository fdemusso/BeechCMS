## ── Sprint 13: Multi-Language & Field Localization (i18n) ──

### Problema
Nelle applicazioni reali (siti vetrina commerciali, e-commerce internazionali), supportare più lingue è un requisito standard. Senza supporto nativo all'internazionalizzazione (i18n), i programmatori sono costretti a creare campi duplicati (es. `title_it`, `title_en`) che inquinano lo schema e rovinano la DX del pannello di amministrazione, oppure a duplicare i record compromettendo la coerenza del magazzino e delle analytics.

### Soluzione proposta: Localizzazione a livello di Branch
Permettere di marcare specifiche colonne come localizzate nella definizione del Seed. Il database salverà le traduzioni come dizionari JSON ed il server si occuperà della negoziazione della lingua.

#### 1. Definizione nel Seed
Lo sviluppatore abilita la localizzazione su campi di testo:

```typescript
export const PRODOTTO_SEED: Seed = {
  slug: 'prodotti',
  branches: [
    { alias: 'name', type: 'text', localized: true }, // Campo localizzato!
    { alias: 'price', type: 'number' } // Campo comune
  ]
}
```

#### 2. Negoziazione e Query API
A runtime, Beech memorizza il campo in D1 come JSON (es. `{"it": "Scarpa", "en": "Shoe"}`).
Nelle richieste API pubbliche (`GET /api/v1/public/prodotti`):
- Se il client invia il parametro query `?lang=en` o l'header `Accept-Language: en`, Beech estrae automaticamente la lingua richiesta e restituisce l'oggetto piatto: `{ name: "Shoe", price: 10 }`.
- Se non specificato, restituisce il valore del locale di fallback globale.

### Checklist di Implementazione (Sprint 13)
- [ ] Aggiungere la proprietà `localized` al tipo `Branch` in core.
- [ ] Aggiornare il Botanical Engine per compilare i campi localizzati come tipo `TEXT` (SQLite JSON) ed estrarre i valori tramite la funzione `json_extract(fieldName, '$.' || lang)` nelle query SELECT se viene richiesta una lingua.
- [ ] Aggiornare la Dashboard per generare controlli di input multilingua (es. tab o selettori di lingua a fianco dell'input) per ogni campo contrassegnato con `localized: true`.
- [ ] Scrivere unit test per verificare il corretto fallback delle lingue e il parsing del dizionario JSON.
