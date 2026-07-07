# Idea: hardening + refactor di `packages/core/src/engine/validation.ts`

Questo documento definisce la strategia per il refactoring e il rafforzamento (hardening) del motore di convalida.

---

## Analisi Architetturale: Perché l'Opzione 3 è la scelta corretta

Abbiamo valutato tre approcci di design per la gestione e convalida delle strutture dati in BeechCMS:

### Perché l'Opzione 1 (Rich Domain Model / OOP) è stata scartata:
1. **Violazione delle Invarianti del Codice**: Il file `types.ts` dichiara esplicitamente (riga 8): *"Pure data shapes — no runtime logic lives here."* L'inserimento di classi con metodi viola direttamente questo principio strutturale.
2. **Schema Dinamico a Runtime vs. Classi Statiche a Compile-time**: In un CMS, gli schemi (Seed) arrivano da D1 (tramite `SeedRegistry` con cache a livello di isolate e TTL di 5 secondi). Poiché l'utente può aggiungere o rimuovere rami (branch) dal pannello a runtime, non esiste una classe statica definibile a tempo di compilazione. Generare classi dinamicamente (es. via `new Function()`) introdurrebbe una complessità immensa e vanificherebbe la type safety statica.
3. **Persistenza Row-Based in D1**: D1 memorizza righe (row), non oggetti attivi. Usare istanze di classi comporterebbe un doppio overhead di idratazione e deidratazione (parse payload -> valida -> istanzia classe -> appiattisci di nuovo a POJO per i bind di INSERT/UPDATE) senza alcun beneficio reale al confine di persistenza.

### Perché l'Opzione 2 (Smart Constructor + Readonly POJO) è stata scartata:
* Zod svolge già questo ruolo tramite `schema.safeParse()` e `.transform()`. L'uso di `Readonly<T>` è un'aggiunta puramente di tipo a compile-time, non un cambio di paradigma.
* In accordo con il principio del *thin handler* (sezione 4 di `vertical-slice.md`), i comportamenti logici (es. `isPublished(entry)`) non devono vivere come metodi dell'oggetto dati, ma come funzioni pure esterne negli strati `features/` o `shared/`.

### Verdetto: Opzione 3 (Schema-driven Validation + Fingerprint)
La validazione tramite schemi Zod compilati dinamicamente e memorizzati in cache è l'approccio corretto. Il bug di cache collision precedentemente risolto non era un difetto strutturale dell'architettura, ma un sintomo locale dovuto a un fingerprint incompleto (mancanza di `numberOptions` dei sotto-campi).

---

## Dettagli dell'Architettura della Cache a Due Livelli

Il runtime di Cloudflare Workers (isolates stateless con warm reuse) e il ciclo di vita del `SeedRegistry` (TTL 5 secondi) impongono un design di caching specifico:

1. **Eviction dei dati (Punto 4)**: La Map globale `seedSchemaCache` non necessita di logiche LRU o TTL complesse. La memoria degli isolate di Cloudflare viene riciclata frequentemente a livello infrastrutturale, ponendo un limite naturale alla crescita della Map.
2. **La cache a due livelli (Punto 5)**: 
   * **Problema**: `buildSeedFingerprint` esegue `JSON.stringify` sull'intera struttura del seed ad ogni validazione, anche in caso di cache hit.
   * **Perché WeakMap da sola fallisce**: Se usassimo solo `WeakMap<Seed, compiledSchema>`, avremmo cache miss ogni 5 secondi, poiché alla scadenza del TTL del `SeedRegistry` il riferimento dell'oggetto `Seed` viene ricreato da zero, anche se la sua struttura branch è identica.
   * **Soluzione Ottimale (Due Livelli)**:
     1. **L1: `WeakMap<Seed, string>` (Object Identity)**: Mappa l'istanza dell'oggetto `Seed` alla stringa del suo fingerprint precalcolato. Questo evita il costo di `JSON.stringify` per richieste ripetute sullo stesso riferimento dello stesso isolate all'interno della finestra di 5 secondi.
     2. **L2: `Map<string, z.ZodObject>` (Content Identity)**: Mappa la stringa del fingerprint allo schema Zod compilato. Questa cache sopravvive alla scadenza del riferimento dell'oggetto `Seed` ogni 5 secondi, poiché la stringa del fingerprint strutturale rimane identica.

---

## Opportunità di Hardening e Refactoring Identificate

### Sicurezza
1. **Gestione Errori in `relationSchema`**: Convertire il `throw Error` (in caso di `idGenerator` mancante) in un `ValidationDetail` strutturato restituito nel risultato, in modo da rispettare il contratto di non sollevare mai eccezioni a runtime.
2. **Hardening dei Protocolli XSS**: Estendere `DANGEROUS_PROTOCOL_REGEX` in `richtext.ts` / `validation.ts` per bloccare non solo `javascript:`, ma anche `data:` e `vbscript:`.
3. **Protezione da Stack Overflow (DoS)**: Introdurre un limite di profondità di ricorsione (es. max 50 livelli) all'interno di `walkRichtextNode` e `gatherRichtextText` per evitar crash degli isolate su payload RichText ricorsivi malevoli.

### Efficienza
4. **WeakMap + Map Cache**: Implementare il modello a due livelli descritto sopra.
5. **Caching Granulare per Relazioni (Punto 6)**: Valutare se compilare separatamente la parte statica dello schema (cacheabile) e i campi di tipo `relation` (che catturano l'istanza dinamica di `idGenerator`), evitando di invalidare l'intera cache del seed per una sola relazione.
6. **Validazione URL File (Punto 7)**: Eliminare la doppia validazione ridondante degli URL per gli asset-list in `fileSchema`.

### Leggibilità & Manutenibilità
7. **Split del Monolito (Punto 8)**: Suddividere il file in moduli dedicati all'interno di una cartella `packages/core/src/engine/validation/`:
   * `richtext-sanitizer.ts`
   * `file-branch.ts`
   * `schema-builders.ts`
   * `cache.ts`
   * `index.ts` (esportazioni pubbliche)
8. **Typesafety in `flattenZodIssues`**: Sostituire il cast `(issue as any).errors` con le definizioni fornali fornite da Zod per le unioni non valide.
9. **Correzione Step Number (Notazione Scientifica)**: Correggere il controllo del passo numerico per supportare la notazione scientifica (es. `1e-7`) al fine di evitare fallimenti silenti su numeri molto piccoli.
10. **Test di Completezza del Fingerprint**: Aggiungere un test automatico (es. tramite snapshot o introspezione delle chiavi di `Branch`) che garantisca che l'aggiunta di una qualsiasi nuova proprietà a `Branch` o alle sue interfacce correlate provochi il fallimento dei test se non inclusa in `buildBranchFingerprint`.
