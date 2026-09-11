# Idea: Test Harness & Strategia di Testing (Issue 108)

## Visione e Obiettivo
Risolvere il debito tecnico legato all'attuale suite di test e migliorare drasticamente la Developer Experience (DX) per gli sviluppatori di BeechCMS. L'obiettivo è sostituire l'attuale proliferazione di mock caotici dei repository con un **Test Harness** standardizzato che esegua test di integrazione reali e affidabili.

---

## Il Problema Attuale
1. **Confusione e Disordine:** I test correnti sono spesso "illeggibili" perché confondono unit test e integration test.
2. **Falsi Positivi/Negativi:** Molti test usano `vi.fn()` per creare mock manuali che tentano di simulare il comportamento di un vero database (es. memorizzando dati in array in memoria). Questo porta a logiche di test fragili e fallaci.
3. **Mancanza di Standard:** Non c'è una netta separazione tra test unitari (che dovrebbero validare pure funzioni/schemi senza DB) e test di integrazione (che dovrebbero testare il flusso end-to-end e il routing HTTP).

---

## La Soluzione: `@beechcms/testing` (Test Harness)

Il **Test Harness** funge da *Test Environment Builder*. È una funzione (`createTestHarness`) che maschera la complessità dell'infrastruttura iniettando dipendenze stabili e controllabili. L'Harness non "finge" le query al DB, ma fornisce un DB reale e isolato.

### 1. Database Reale (In-Memory)
Invece di mockare le query tramite funzioni JavaScript, la Harness istanzia un vero database SQLite in-memory (tramite `better-sqlite3` o l'ambiente D1 di `@cloudflare/vitest-pool-workers`).
*   **Vantaggio:** Il test esegue vere query SQL. Vengono testati i vincoli, le foreign keys, le relazioni e l'esatta esecuzione delle Seed (creazione tabelle/indici).

### 2. Dependency Injection per Servizi Instabili
L'Harness si occupa di mockare internamente solo i servizi infrastrutturali collaterali necessari per avere test veloci e deterministici:
*   **`IClock`:** Congela il tempo o lo avanza artificialmente (es. per testare la scadenza dei token o dei task cron).
*   **`ITokenService`:** Evita l'overhead della crittografia vera e propria per generare e validare JWT durante i test.

### 3. Test Client Intelligente
La funzione restituisce un oggetto che contiene l'app configurata e un client helper (es. `.asUser({ role: 'admin' })`). Quest'ultimo avvolge `app.request()` e inietta automaticamente i token fittizi negli header delle richieste HTTP in base all'identità passata, eliminando la necessità di firmare JWT a mano in ogni test.

---

## La Nuova Piramide dei Test

L'introduzione della Test Harness diventa lo standard architettonico per la qualità del codice:

1. **Unit Tests (Puri):** Test isolati, immediati e privi di side-effect per logiche di validazione (es. Zod schemas), utilità ed engine rules. Non coinvolgono istanze Hono né il database in-memory.
2. **Integration / E2E Tests (con Test Harness):** Tutti i test su handler API, flussi core e middleware passano all'uso esclusivo della Harness. Non ci saranno più mock dei Repository: i dati si preparano inserendoli nel DB, si fa la chiamata HTTP e si verifica lo stato nel DB o nella risposta.

---

## Piano di Migrazione Graduale (Boy Scout Rule)

*   **Evitare il Big Bang:** Non riscrivere tutti i 70+ test esistenti in un colpo solo.
*   **Nuovi Sviluppi:** Tutti i nuovi endpoint e le nuove feature devono utilizzare l'Harness per l'integrazione o essere puramente unitari.
*   **Rifattorizzazione Continua:** Ogni volta che si tocca un vecchio endpoint (es. per un bugfix o una nuova feature), i vecchi test confusi basati sui mock vengono eliminati e sostituiti da un test pulito usando la Test Harness.
