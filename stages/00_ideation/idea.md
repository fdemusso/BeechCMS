# BeechPal (Cmd+K 2.0) — La Command Palette Universale di BeechCMS
> **Ispirazione diretta**: Microsoft PowerToys CmdPal (DevPal) & Raycast  
> **Ruolo**: Hub primario di navigazione, operatività, calcolo e controllo di BeechCMS.

---

## 1. Visione del Prodotto

Attualmente la Command Palette (`Cmd+K`) di BeechCMS funge da semplice switcher di pagine e schemi. L'obiettivo è trasformarla in **BeechPal**: la superficie operativa e di navigazione principale del CMS, ispirata alla UX e all'architettura modulare di **Microsoft PowerToys CmdPal (`src/modules/cmdpal`)**.

L'utente non deve più navigare tra menu annidati o aprire tab esterne per compiti veloci: tramite la palette esegue query ibride (lessicali e semantiche), lancia comandi di sistema, calcola dati in-line, converte unità e valute, prende appunti al volo e manipola contenuti da tastiera.

---

## 2. Pilastri Chiave Ispirati a PowerToys CmdPal

### A. UI a Doppio Pannello (Master-Detail / Inspector)
* **CmdPal Pattern**: Elementi con metadati ricchi mostrano a destra un pannello di dettaglio (`Details` / `Inspector`).
* **In BeechCMS**:
  * **Record / Contenuto**: anteprima del record, stato (bozza/pubblicato), autore, data ultima modifica, excerpt con highlight.
  * **Media**: anteprima visiva, dimensioni, peso in KB, MIME type, copy URL pubblico.
  * **Impostazione**: spiegazione del parametro, stato attuale (es. "SMTP: Configurato"), badge di permessi richiesti.
  * **Calcolatrice / Conversione**: scomposizione formula, valori alternativi (percentuale, formattazione valuta, float puro).
  * **Quick Notes**: anteprima dell'appunto locale salvato con conteggio caratteri e timestamp.

### B. Barra delle Azioni Secondarie (Action Bar & Modifiers)
* **CmdPal Pattern**: Ogni elemento ha azioni secondarie contestuali accessibili via tastiera:
  * `Enter`: Azione primaria (apri / naviga / applica).
  * `Cmd+Enter` / `Ctrl+Enter`: Azione secondaria (es. apri in nuova scheda, oppure modifica schema invece di aprire lista).
  * `Cmd+C` / `Ctrl+C`: Copia negli appunti (ID record, slug, URL media, o risultato del calcolo).
  * `Tab` o `Cmd+J`: Apre il sotto-menu delle azioni disponibili per l'elemento evidenziato.

### C. Prefissi di Routing & Provider Modulari
* **CmdPal Pattern**: Ricerca universale unificata di default, con attivazione mirata di provider tramite prefissi:
  * `>` : **Comandi di Sistema & Sviluppo** (es. svuota cache locale, toggle theme, audit schema, diagnostica Worker/D1).
  * `=` : **Calcolatrice & Matematica** (es. `= 120 * 1.22`, `= 1024 / 8`).
  * `$` o `~` : **Conversioni Rapide** (valute es. `150 eur to usd`, unità es. `16px to rem`, `5GB to MB`).
  * `#` : **Ricerca Ibrida Contenuti** (alimentata da `@beechcms/search-client`).
  * `@` : **Utenti, Ruoli & Permessi**.
  * `!` o `note:` : **Quick Notes** (scratchpad locale istantaneo).
  * `?` : **Guida & Scorciatoie**.

### D. Pinned / Quick-Access Shelf (Preferiti & Frequenti)
* Sezione fissa o in cima alla vista `root` per le 3-5 azioni o viste più usate dall'utente (salvate in `localStorage`), con possibilità di aggiungere azioni ai preferiti (Pin).

---

## 3. Strumenti In-line Integrati (Built-in Quick Tools)

### 1. Calcolatrice In-line
* Risolve istantaneamente formule matematiche digitate nella barra di ricerca (anche senza prefisso `=` se viene rilevata un'espressione aritmetica).
* Parser AST locale sicuro (senza `eval`).
* Tasto `Enter` copia il risultato negli appunti e chiude la palette con feedback toast.

### 2. Convertitore di Unità (CSS, Storage, Misure)
* **Design & CSS**: `16px to rem`, `1.5rem to px`, conversioni colore (`#ffffff to rgb`).
* **Storage**: `1024MB to GB`, `5000000 bytes to MB`.
* **Tempo & Date**: conversione timestamp Unix (`now to unix`, `timestamp to date`).

### 3. Convertitore di Valuta
* Sintassi: `100 EUR in USD`, `50 GBP to EUR`.
* Caching locale dei tassi di cambio con aggiornamento periodico (degradazione trasparente offline).

### 4. Quick Notes (Scratchpad Locale)
* Una semplice finestra/scheda locale interna alla palette per catturare appunti al volo.
* I dati risiedono puramente in `localStorage`.
* Permette di salvare un appunto al volo (es. digitando `note: Contattare fornitore domani`), visualizzare gli appunti salvati nel pannello di dettaglio, copiarli con `Cmd+C` o eliminarli con `Delete`.

---

## 4. Ricerca Avanzata con `@beechcms/search-client`

* Sostituzione della chiamata monolitica semplice con il client dedicato [`@beechcms/search-client`](file:///C:/Users/flavi/Desktop/beech-cms/packages/search-client).
* **Funzionalità integrate**:
  * **Tier 1 (Lessicale)**: ricerca ultra-rapida locale sui record del manifest (titolo e campi testuali).
  * **Tier 2 (Semantico)**: chiamata embedding asincrona (`/api/v1/public/search/embed`) e calcolo dot-product locale sui vettori memorizzati.
  * **Reciprocal Rank Fusion (RRF)**: combinazione e riordino deterministico dei punteggi lessicali e semantici (`k = 60`).
  * **Debouncing & Cache integrati**: 250ms di debounce nativo e cache fingerprint locale per non saturare la rete.

---

## 5. Accesso Totale e Azioni di Contesto su BeechCMS

### A. Deep Settings & Single-Parameter Jump
* Indicizzazione non solo delle categorie, ma di **tutti i singoli switch e parametri di configurazione** (es. "SMTP", "Turnstile", "Backup D1").
* Possibilità di commutare al volo le impostazioni binarie (es. "Toggle Dark Mode").

### B. Consapevolezza del Contesto (Context-Aware Actions)
* La palette rileva la rotta attiva:
  * **In modifica record (`/content/articles/123`)**:
    * Le prime azioni proposte sono: "Salva come bozza", "Pubblica ora", "Duplica record", "Copia ID (`123`)", "Vedi storico revisioni".
  * **Nella Media Library (`/media`)**:
    * "Carica nuovo asset", "Filtra per immagini", "Svuota cestino".

### C. Developer & System Operations
* "Audit Schemi D1", "Verifica stato Worker", "Esporta Seed in JSON", "Visualizza log automazioni".

---

## 6. Architettura Tecnica e Invarianti

1. **Architettura a Provider Disaccoppiata**:
   ```ts
   export interface PaletteContext {
     currentRoute: string
     theme: string
     permissions: Set<string>
   }

   export interface PaletteProvider {
     id: string
     prefix?: string
     match: (query: string, ctx: PaletteContext) => boolean
     getItems: (query: string, ctx: PaletteContext) => Promise<CommandAction[]> | CommandAction[]
   }
   ```
2. **Zero-Lag Typing & Concurrency**:
   * I provider locali (Calcolatrice, Conversioni, Quick Notes, Comandi statici) rispondono in modo sincrono a 0 ms.
   * Il provider di ricerca [`SearchClient`](file:///C:/Users/flavi/Desktop/beech-cms/packages/search-client/src/client.ts) gira in background con gestione del segnale di annullamento.
3. **Rispetto delle Regole Monorepo (`_config/architecture.md`)**:
   * Nessun accesso diretto SQL; rispetto dei contratti dei permessi e del `SEED_REGISTRY` di `@beechcms/core`.

---

## 7. Out of Scope (Decisioni di Sparring)

* **Workers AI integrato**: *ESCLUSO per ora*. Lasciamo predisposta l'interfaccia a provider, ma non implementiamo feature generative o LLM fino a una valutazione strategica dell'AI in BeechCMS.
* **Sincronizzazione Cloud delle Quick Notes**: *ESCLUSA*. Le note restano strettamente confinate in `localStorage` sul browser dell'utente (zero complessità backend, zero migration D1).
