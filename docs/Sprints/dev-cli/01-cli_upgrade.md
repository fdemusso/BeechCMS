# Sprint: Dev CLI interattiva con Ink

> Sostituzione dell'output disordinato di `npm run dev:full` con un pannello TUI (Terminal UI) a tutto schermo, interattivo e navigabile, costruito con **Ink** (React per CLI).

**Stato**: 📋 Pianificato
**File coinvolti**: `scripts/dev.mjs`, `package.json`, nuova cartella `scripts/dev-cli/`

---

## 1. Problema attuale

`scripts/dev.mjs` oggi:

1. Alloca le porte e aggiorna `apps/api/.dev.vars`.
2. Avvia `docker compose up -d` con `stdio: 'inherit'` → output Docker grezzo nel terminale.
3. Esegue il polling dei log del container `tunnel` per la URL Quick Tunnel.
4. Esegue `bootstrap-d1.mjs` con `stdio: 'inherit'` → log di ogni migrazione applicata.
5. Avvia `npx turbo run dev` con `stdio: 'inherit'` → flusso misto e interlacciato di:
   - log di Wrangler (API, porta 8789) inclusi gli avvisi di aggiornamento versione;
   - log di Vite (Dashboard, porta 5173);
   - log di `tsc -w` (`packages/core`);
   - banner e avvisi di aggiornamento di Turborepo;
   - log delle chiamate API (`GET /api/... 200 OK`) che scorrono di continuo.

Il risultato è un terminale caotico in cui le informazioni utili (URL del tunnel, stato dei servizi, errori reali) annegano nel rumore.

---

## 2. Obiettivo

Un'unica schermata TUI che mostra:

```
┌─ BeechCMS Dev ──────────────────────────────── v0.6.0-preview.1 ─┐
│ SERVICES                                                         │
│  ✔ Docker Compose   minio ✔  mailpit ✔  sqlite-web ✔  webhook ✔  │
│  ✔ Quick Tunnel     https://xyz-abc.trycloudflare.com            │
│  ✔ DB Bootstrap     34 migrations · 0 applied (no-op)            │
│  ✔ API (wrangler)   http://127.0.0.1:8789                        │
│  ⠋ Dashboard (vite) starting…                                    │
│                                                                  │
│ RECENT ERRORS                                                    │
│  ▸ [API] D1_ERROR no such table: content_posts   (d = details)   │
│                                                                  │
│ ── active tab content area ───────────────────────────────────── │
│                                                                  │
└ [1] Status  [2] API Logs  [3] Dashboard Logs  [4] Endpoints  [5] Versions   q: quit ┘
```

- **Lingua**: L'interfaccia CLI (etichette, stati, messaggi di caricamento, menu, bottoni, controlli) deve essere interamente in **lingua inglese**.
- Tutti i processi figli girano con `stdio: 'pipe'`: nessuna riga raggiunge direttamente il terminale.
- I log vengono filtrati, classificati per sorgente e bufferizzati in memoria.
- Navigazione a schede via tastiera (tasti numerici `1`–`5`, `Tab`/`Shift+Tab`, frecce).
- Errori mostrati in forma compatta (codice + sorgente); `d` espande lo stack trace completo.
- `q` / `Ctrl+C` → shutdown ordinato di tutto lo stack (dev server + container Docker).

---

## 3. Librerie aggiuntive

Da aggiungere alle `devDependencies` del **root** `package.json`:

| Pacchetto | Scopo | Note |
|---|---|---|
| `ink` (^6) | Renderer React per il terminale | Richiede React come peer dependency |
| `react` (^19) | Runtime componenti | Solo a livello root per la CLI; non interferisce con `apps/dashboard` (workspace separato) |
| `ink-spinner` | Spinner di stato per servizi in avvio | Piccolo, zero config |
| `tsx` | Esecuzione diretta di file `.tsx` in Node senza build step | Permette di scrivere i componenti Ink in JSX/TypeScript |
| `execa` (^9) | Spawn dei processi figli | Gestione robusta di pipe, kill del process tree su Windows, `AbortSignal` |
| `strip-ansi` | Pulizia delle sequenze ANSI dai log pipe-ati | Wrangler/Vite/Turbo emettono colori che vanno normalizzati prima del parsing |

**Esclusi deliberatamente**: `ink-table` (poco manutenuto — la tabella di stato si costruisce con `<Box>`/`<Text>` nativi), `blessed`/`neo-blessed` (stack alternativo, non React).

> ⚠️ **Vincolo Windows**: Ink richiede un TTY con raw mode. Windows Terminal e PowerShell moderni sono supportati. Serve comunque un **fallback non-TTY** (vedi §6.5) per CI o terminali pipe-ati: se `!process.stdout.isTTY`, si mantiene il comportamento attuale a log piatti.

---

## 4. Architettura

### 4.1 Struttura file

```
scripts/
  dev.mjs                     # entry point: pre-check Docker + dispatch TTY/non-TTY
  dev-cli/
    index.tsx                 # bootstrap Ink: render(<DevApp />)
    orchestrator.ts           # ciclo di vita dei processi (nessuna dipendenza da Ink)
    log-store.ts              # buffer circolari dei log + classificazione errori
    log-filters.ts            # regole di filtraggio del rumore (pure functions)
    endpoints.ts              # estrazione/elenco statico degli endpoint API
    components/
      DevApp.tsx              # layout root, routing schede, useInput globale
      StatusPanel.tsx         # tabella di stato dei servizi (scheda 1)
      LogView.tsx             # viewer log scrollabile (schede 2 e 3, parametrizzato)
      EndpointsView.tsx       # elenco endpoint (scheda 4)
      VersionsView.tsx        # avvisi versione + stato release (scheda 5)
      ErrorBar.tsx            # barra errori compatta + espansione con "d"
      TabBar.tsx              # menu di navigazione in basso
    legacy-runner.mjs         # fallback non-TTY (comportamento attuale, estratto da dev.mjs)
```

**Separazione chiave**: `orchestrator.ts` e `log-store.ts` non importano nulla di Ink. Sono testabili in isolamento e comunicano con la UI tramite un `EventEmitter` tipizzato (o un piccolo store osservabile). I componenti Ink si sottoscrivono via hook (`useSyncExternalStore` o `useEffect` + `useState`).

### 4.2 Modello dei servizi (orchestrator)

Ogni servizio è descritto da un oggetto:

```ts
interface ManagedService {
  id: 'docker' | 'tunnel' | 'bootstrap' | 'api' | 'dashboard' | 'core'
  label: string
  status: 'pending' | 'starting' | 'ready' | 'error' | 'stopped'
  detail?: string          // es. URL tunnel, porta, conteggio migrazioni
  readyMatcher?: RegExp    // pattern sull'output che segna il servizio "ready"
}
```

Pipeline di avvio (stessa sequenza logica di oggi, ma con stato osservabile):

1. **Porte + .dev.vars** — riuso invariato di `checkPort`/`getAvailablePort`/`updateDevVars` (estratti in `orchestrator.ts`). Nessun output: i risultati popolano `detail` dei servizi.
2. **Docker Compose** — `execa('docker', ['compose', 'up', '-d'])` con pipe. Stato `ready` quando il comando esce con 0; lo stato dei singoli container (minio, mailpit, sqlite-web, webhook-tester) viene verificato con `docker compose ps --format json` (poll ogni 5s, aggiorna i check ✔/✖ della riga Docker).
3. **Quick Tunnel** — riuso del polling esistente su `docker compose logs tunnel` (asincrono, non bloccante: la UI mostra spinner finché la URL non appare). All'arrivo: aggiorna `detail` e `QSTASH_CALLBACK_URL` in `.dev.vars` come oggi.
4. **DB Bootstrap** — `execa('node', ['apps/api/scripts/bootstrap-d1.mjs'])` con pipe. L'output `[bootstrap-d1] applying XXXX_...` viene parsato per popolare `detail` con il conteggio migrazioni. Errore → stato `error` con output negli errori recenti, **senza** `process.exit` immediato (l'utente vede l'errore nella TUI e decide se uscire).
5. **Dev server** — vedi §4.3.

### 4.3 Demultiplexing dei log: bypassare Turbo

Oggi `turbo run dev` interlaccia tre stream con prefissi (`@beechcms/core:dev:`, `@beechcms/api:dev:`, `@beechcms/dashboard:dev:`). Due opzioni:

- **(A) Mantenere Turbo** e demultiplexare via parsing dei prefissi di riga.
- **(B) Spawnare i tre processi direttamente** dall'orchestrator:
  - `npm run dev -w packages/core` (tsc -w)
  - `npm run dev -w apps/api` (wrangler dev --port 8789)
  - `npm run dev -w apps/dashboard` (vite)

**Scelta: (B)**. Motivi: stream nativamente separati per scheda (niente parsing fragile dei prefissi Turbo, che cambiano formato tra versioni); elimina alla radice il banner e gli avvisi di update di Turborepo; controllo individuale del ciclo di vita (es. riavviare solo l'API in futuro). L'ordine di avvio rispetta la dipendenza: `core` (tsc -w) parte per primo; API e Dashboard partono subito dopo (come fa già Turbo, che non attende il watch mode).

Readiness detection sull'output pipe-ato:

| Servizio | Pattern "ready" |
|---|---|
| API | `/Ready on https?:\/\/[^ ]+/` (output Wrangler) |
| Dashboard | `/Local:\s+https?:\/\/localhost:\d+/` (output Vite) |
| Core | primo `/Watching for file changes/` o `/Found 0 errors/` (tsc -w) |

### 4.4 Log store e filtri

`log-store.ts` mantiene un **buffer circolare per sorgente** (default 2000 righe ciascuno: `api`, `dashboard`, `core`, `docker`, `bootstrap`, `system`). Ogni riga è:

```ts
interface LogLine {
  source: LogSource
  timestamp: number
  level: 'info' | 'warn' | 'error'
  text: string        // già passata per strip-ansi
}
```

`log-filters.ts` esporta una lista ordinata di regole pure (`(line: string) => 'drop' | 'error' | 'pass'`). Regole iniziali di **drop** (rumore):

- Avvisi update Wrangler: `/wrangler \d+\.\d+\.\d+ is now available/`, `/Run npm install.*wrangler/`, banner `▲ [WARNING]` relativi alla versione.
- Banner/update Turbo (difensivo, anche se con l'opzione B non dovrebbero più apparire).
- Righe di access-log dell'API a basso valore: `/^\[wrangler:info\] (GET|POST|PUT|PATCH|DELETE) .* 2\d\d/` (le 4xx/5xx invece **passano** e vengono classificate `warn`/`error`).
- Heartbeat/righe vuote ripetute di Vite (`hmr update` può restare, è utile).

Regole di classificazione **errore**: righe contenenti `✘ [ERROR]`, `Error:`, `D1_ERROR`, stack trace (` at ...`). Le righe contigue di uno stack vengono **aggregate in un unico `ErrorEntry`**:

```ts
interface ErrorEntry {
  source: LogSource
  code: string        // prima riga / codice errore estratto
  fullText: string    // stack trace completo
  timestamp: number
  expanded: boolean
}
```

L'`ErrorBar` mostra solo `[source] code`; il tasto `d` espande/comprime il `fullText` dell'errore selezionato (frecce ↑/↓ per selezionare tra gli errori recenti, `x` per dismetterli).

### 4.5 Componenti Ink e navigazione

- **`DevApp`** — usa `useApp()` e `useInput()` per la gestione globale dei tasti:
  - `1`–`5`: selezione scheda diretta; `Tab`/`Shift+Tab` e `←`/`→`: scheda precedente/successiva;
  - `↑`/`↓`/`PgUp`/`PgDn`: scroll nella scheda log attiva (o selezione errore nella scheda 1);
  - `d`: toggle dettagli errore selezionato; `x`: dismetti errore;
  - `q` / `Ctrl+C`: shutdown (vedi §5).
  - Render full-screen: entra in *alternate screen buffer* (`\x1b[?1049h` all'avvio, `\x1b[?1049l` all'uscita) così il terminale dell'utente torna pulito alla chiusura.
- **`StatusPanel`** (scheda 1) — tabella servizi con icone: `✔` ready (verde), `⠋` spinner (starting), `✖` error (rosso), `·` pending. Riga Docker con sotto-check per container. Mostra le URL utili (tunnel, MinIO console, Mailpit UI, sqlite-web, webhook-tester) con le porte effettivamente allocate.
- **`LogView`** (schede 2–3) — viewport scrollabile sul buffer della sorgente (`api` o `dashboard`): calcola le righe visibili da `process.stdout.rows`, mantiene un offset di scroll, auto-follow quando l'offset è in fondo (con indicatore `● live` / `⏸ scroll`). Ink **non** ha scrolling nativo: si implementa come slice del buffer (pattern standard, nessuna libreria extra).
- **`EndpointsView`** (scheda 4) — elenco endpoint raggruppati per area (Auth, Content, Drafts, Media, Public API, Webhooks, Search, …). Fonte dati: vedi §4.6.
- **`VersionsView`** (scheda 5) — versione corrente del monorepo (da `package.json` root), avvisi di aggiornamento **catturati** dai filtri (invece di buttarli, le righe droppate di tipo "update available" vengono archiviate qui), e versioni degli strumenti rilevate dall'output di avvio (Wrangler, Vite).
- **`TabBar`** — footer fisso con le 5 schede, evidenziazione della scheda attiva, hint tasti contestuali.

### 4.6 Sorgente dati per l'elenco endpoint (scheda 4)

L'app Hono gira dentro workerd: non è importabile da Node per introspezione diretta. Strategia a due livelli:

1. **Parsing statico all'avvio**: una funzione in `endpoints.ts` legge `apps/api/src/factory.ts` e i file `*.routes.ts` delle feature slice con regex su `app.get|post|put|patch|delete('path', ...)` e sui mount `app.route('/api', ...)`, componendo i path completi. È best-effort ma sempre aggiornato col codice.
2. **Fallback curato**: se il parsing fallisce (refactor del factory), si mostra un elenco statico minimo + rimando a `docs/api-reference.md`.

In una iterazione successiva si può valutare un endpoint di debug `GET /api/__routes` (solo dev) che usa `app.routes` di Hono — fuori scope per questo sprint.

---

## 5. Ciclo di vita e shutdown

Requisito: chiusura pulita di **tutti** i processi e container in ogni scenario (q, Ctrl+C, SIGINT, SIGTERM, crash della TUI).

1. **Spawn con `execa`** e senza `shell: true` dove possibile (`npm run dev -w ...` su Windows richiede `npm.cmd` o `execa` con `preferLocal`; execa gestisce il caso). Ogni processo riceve un `AbortSignal` da un `AbortController` centrale.
2. **Sequenza di shutdown** (funzione `shutdown()` idempotente, guard `cleaningUp` come oggi):
   1. La UI passa allo stato "Shutting down..." (la TUI resta visibile durante lo shutdown).
   2. `controller.abort()` → execa termina i figli; su Windows execa usa `taskkill /T` per uccidere l'intero albero (cruciale: `wrangler dev` e `vite` spawnano sotto-processi che con il vecchio `spawn(..., {shell: true})` potevano sopravvivere).
   3. Attesa exit dei figli con timeout 5s; oltre il timeout → kill forzato.
   4. `docker compose stop` (sincrono, output catturato e mostrato nella TUI).
   5. Uscita dall'alternate screen, `unmount()` di Ink, stampa di un riepilogo finale di una riga, `process.exit(0)`.
3. **Trap**: `process.on('SIGINT'|'SIGTERM', shutdown)`; in più `useInput` intercetta `q` e `Ctrl+C` (con raw mode attivo, Ctrl+C arriva come input, non come SIGINT — va gestito esplicitamente). Handler `exit` come ultima rete di sicurezza per `docker compose stop` (come oggi).
4. **Crash dei figli**: se API o Dashboard escono inaspettatamente, lo stato del servizio passa a `error` con l'exit code negli errori recenti; la TUI **resta aperta** (l'utente può leggere l'errore), a differenza di oggi dove l'exit di turbo trascina giù tutto.

---

## 6. Modifiche a `scripts/dev.mjs` e `package.json`

### 6.1 `scripts/dev.mjs` (entry point, resta `.mjs`)

Si riduce a:

```js
// 1. Pre-check Docker (logica attuale, invariata: messaggi chiari pre-TUI)
// 2. Dispatch:
if (process.stdout.isTTY && !process.env.BEECH_DEV_PLAIN) {
  // TUI: delega a tsx per il supporto JSX/TS
  await import('tsx/esm/api').then(...)  // oppure spawn di `tsx scripts/dev-cli/index.tsx`
} else {
  await import('./dev-cli/legacy-runner.mjs')  // comportamento attuale
}
```

- La logica di porte, `.dev.vars`, polling tunnel e bootstrap viene **spostata** in `orchestrator.ts` (condivisa) — `legacy-runner.mjs` la consuma in modalità log-piatti.
- Variabile di escape `BEECH_DEV_PLAIN=1` per forzare il vecchio comportamento (debug, CI, terminali problematici).

### 6.2 `package.json` (root)

```jsonc
"scripts": {
  "dev": "node scripts/dev.mjs",
  "dev:full": "node scripts/dev.mjs",
  "dev:plain": "cross-env BEECH_DEV_PLAIN=1 node scripts/dev.mjs",  // o set inline su PS
  // ... invariati: dev:tunnel-url, dev:logs:*, dev:stop, dev:reset
}
```

- `devDependencies` aggiunte: `ink`, `react`, `ink-spinner`, `tsx`, `execa`, `strip-ansi` (e opzionalmente `cross-env`).
- Gli script `dev:logs:*` restano: utili quando si vuole il raw stream di un container fuori dalla TUI.

### 6.3 Nessuna modifica a

`docker-compose.yml`, `apps/api/scripts/bootstrap-d1.mjs`, gli script `dev` dei singoli workspace (`wrangler dev`, `vite`, `tsc -w`): vengono solo invocati diversamente.

### 6.4 Compatibilità

- `turbo run dev` resta funzionante per chi lo invoca direttamente; semplicemente `dev:full` non passa più da Turbo per il task `dev`.
- `vite.config.ts` continua a proxy-are verso `127.0.0.1:8789`: l'ordine di avvio è garantito dall'orchestrator come oggi.

### 6.5 Fallback non-TTY

`legacy-runner.mjs` replica l'output attuale (estrazione 1:1 della parte finale di `dev.mjs` odierno). Criterio di attivazione: `!process.stdout.isTTY || BEECH_DEV_PLAIN=1`.

---

## 7. Piano di lavoro (fasi)

| Fase | Contenuto | Output verificabile |
|---|---|---|
| **1. Estrazione orchestrator** | Spostare porte/.dev.vars/docker/tunnel/bootstrap in `orchestrator.ts` con modello `ManagedService` + eventi; creare `legacy-runner.mjs` che lo consuma con output identico a oggi | `npm run dev:full` funziona come prima (zero regressioni), ma su architettura nuova |
| **2. Log store + filtri** | `log-store.ts`, `log-filters.ts`, switch dei dev server da Turbo a spawn diretti con `stdio: 'pipe'` | Unit test dei filtri verdi; legacy-runner stampa i log già filtrati |
| **3. TUI base** | `index.tsx`, `DevApp`, `StatusPanel`, `TabBar`; schede 2–3 con `LogView` scrollabile | Avvio TUI completo: stato servizi live, log navigabili |
| **4. Errori + schede 4–5** | `ErrorBar` con tasto `d`, `EndpointsView` (parsing statico), `VersionsView` | Demo: errore D1 indotto → visibile compatto → `d` espande lo stack |
| **5. Shutdown robusto** | AbortController + taskkill tree, alternate screen, gestione crash figli | Ctrl+C / q / chiusura finestra: `docker compose ps` vuoto, nessun processo node/workerd orfano |
| **6. Rifinitura** | Fallback non-TTY testato, resize del terminale, docs (`docs/development.md` aggiornata) | Review finale |

Le fasi 1–2 sono pura ristrutturazione senza UI e possono essere mergiate indipendentemente.

---

## 8. Strategia di test

### 8.1 Unit test (Vitest, root o `scripts/__tests__/`)

- **`log-filters.test.ts`** — fixture di righe reali (avviso update Wrangler, access log 200, errore D1 con stack, output Vite HMR) → asserzioni su `drop`/`pass`/`error`. È il cuore della feature: ogni nuova regola di filtro nasce con la sua fixture.
- **`log-store.test.ts`** — buffer circolare (overflow a 2000 righe), aggregazione stack trace multi-riga in un singolo `ErrorEntry`, classificazione per sorgente.
- **`orchestrator.test.ts`** — transizioni di stato dei servizi con processi finti (mock di execa): pending → starting → ready via `readyMatcher`; exit inatteso → error; abort → stopped.
- **`endpoints.test.ts`** — parsing di un frammento di `factory.ts` reale → elenco endpoint atteso; fallback su input non parsabile.

### 8.2 Test dei componenti (ink-testing-library)

`ink-testing-library` (`render` + `lastFrame()` + `stdin.write()`):

- `TabBar`: pressione `2` → scheda attiva cambia nel frame.
- `ErrorBar`: errore presente → frame contiene forma compatta; `stdin.write('d')` → frame contiene lo stack.
- `StatusPanel`: dato un set di `ManagedService`, il frame contiene i simboli/URL attesi.
- `LogView`: buffer di 50 righe in viewport da 10 → slice corretta; scroll up disattiva il follow.

### 8.3 Smoke test manuali (checklist di fase 5–6)

1. `npm run dev:full` su Windows Terminal: tutte le spunte verdi, tunnel URL visibile.
2. Indurre un errore (es. fermare manualmente il container minio) → riga Docker passa a ✖, errore compatto in scheda 1.
3. `q` e `Ctrl+C`: verificare `docker compose ps` vuoto e assenza di processi `workerd`/`node` orfani in Task Manager.
4. `BEECH_DEV_PLAIN=1 npm run dev:full` e `npm run dev:full | Tee-Object log.txt` (non-TTY) → fallback a log piatti.
5. Resize del terminale durante l'esecuzione → layout si riadatta senza artefatti.

---

## 9. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Raw mode non disponibile (CI, pipe, terminali legacy) | Fallback `legacy-runner.mjs` automatico su `!isTTY` + escape `BEECH_DEV_PLAIN` |
| Processi orfani su Windows (wrangler/vite spawnano alberi) | `execa` con kill del process tree (`taskkill /T /F`); smoke test dedicato in fase 5 |
| Pattern "ready" che cambiano con gli update di Wrangler/Vite | Pattern in costanti centralizzate con timeout: se il pattern non matcha entro 60s ma il processo è vivo e la porta risponde, lo stato passa comunque a `ready` (probe TCP sulla porta come fonte di verità secondaria) |
| Filtri troppo aggressivi che nascondono errori reali | I filtri droppano solo pattern espliciti allow-listed; tutto il resto passa. Le righe droppate restano comunque consultabili (scheda 5 per gli update notice) |
| Parsing endpoint fragile | Best-effort con fallback statico; non blocca mai l'avvio |
| Conflitto versioni React (root vs dashboard) | npm workspaces isola le dipendenze; `react` root usato solo da `tsx`/Ink, mai importato dai workspace |

---

## 10. Fuori scope (esplicito)

- Riavvio selettivo di un singolo servizio dalla TUI (tasto `r`) — buona estensione futura, non in questo sprint.
- Endpoint `GET /api/__routes` di introspezione Hono.
- Persistenza dei log su file (`--log-file`).
- Ricerca/filtro testuale interattivo dentro i log.
