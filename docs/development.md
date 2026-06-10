# Development Setup

## Prerequisites

- **Node.js 20+**
- **npm 11+**
- **Docker Desktop** or **Docker Engine** — richiesto per l'intero stack di sviluppo locale

## Quick Start

```bash
npm run dev:full
```

Questo comando avvia **l'intero stack Docker** (MinIO, Mailpit, SQLite Web, webhook-tester, cloudflared tunnel), esegue il bootstrap del database D1 locale se necessario, e poi avvia l'API Cloudflare Workers e la Dashboard React in parallelo. È il **comando canonico e unico** per lo sviluppo.

> Docker è un prerequisito non negoziabile. Non esiste una modalità "senza Docker" né uno stack parziale. Chi non può usare Docker non può sviluppare su Beech.

### Dev CLI (TUI)

Quando l'output è un terminale interattivo (TTY), `npm run dev:full` apre una TUI a schermo intero (Ink) con:

- **Status** (`1`) — stato di Docker/tunnel/bootstrap/core/api/dashboard, sotto-container Docker e URL dei servizi (MinIO Console, Mailpit, SQLite Web, webhook-tester, tunnel).
- **API Logs** (`2`) e **Dashboard Logs** (`3`) — log filtrati per servizio, con indicatore `● live` / `⏸ scroll`.
- **Endpoints** (`4`) — elenco delle rotte API esposte, raggruppate per feature.
- **Versions** (`5`) — versione del monorepo e versioni rilevate di Wrangler/Vite, più eventuali notifiche di aggiornamento.

Una barra errori compatta in alto mostra gli errori recenti (`[sorgente] codice`); selezionali con le frecce, `d` per espandere/comprimere lo stack trace, `x` per rimuoverli.

**Tasti**: `1`-`5` per i tab, `Tab` / `Shift+Tab` o `←`/`→` per ciclare, `↑`/`↓`/`PgUp`/`PgDn` per scorrere i log o navigare gli errori, `q` o `Ctrl+C` per uscire (shutdown pulito di tutti i processi e container).

Se l'output non è un TTY (es. CI, log rediretti su file) o è impostata `BEECH_DEV_PLAIN=1`, viene usato l'output flat tradizionale — equivalente a `npm run dev:plain`.

---

## Strumenti di Sviluppo Docker

`npm run dev:full` orchestra l'intero stack locale:

| Servizio | Porta host | URL / Console | Scopo |
|---|---|---|---|
| MinIO (S3) | 9000 / 9001 | http://localhost:9001 (`beechdev` / `beechdevsecret`) | Storage R2-compatibile per upload presigned |
| Mailpit | 1025 (SMTP) / 8025 (HTTP) | http://localhost:8025 | Inbox locale per email transazionali (reset password, automation `send_mail`) |
| SQLite Web | 8080 | http://localhost:8080 | Ispezione read-only del database D1 locale |
| webhook-tester | 8084 | http://localhost:8084 | Endpoint locale per testare automation `webhook` |
| Cloudflared Tunnel | n/a | URL `*.trycloudflare.com` da `npm run dev:tunnel-url` | Esporre l'API locale a internet per webhook in ingresso da terzi |

### Comandi

Beech ha **un solo modo** di avviare l'ambiente di sviluppo: `npm run dev:full`. Non esiste una modalità "senza Docker" né uno stack parziale. Docker è prerequisito non negoziabile.

| Comando | Effetto |
|---|---|
| `npm run dev:full` | Avvia stack Docker completo + API + Dashboard, con TUI a schermo intero su TTY (comando canonico) |
| `npm run dev` | Alias di `dev:full` |
| `npm run dev:plain` | Come `dev:full` ma con output flat (no TUI) — equivalente a `BEECH_DEV_PLAIN=1 npm run dev:full` |
| `npm run dev:tunnel-url` | Stampa la URL pubblica del tunnel Cloudflare |
| `npm run dev:mailpit:reset` | Svuota la inbox Mailpit |
| `npm run dev:logs:mailpit` | Stream log di Mailpit |
| `npm run dev:logs:sqlite` | Stream log di SQLite Web |
| `npm run dev:logs:tunnel` | Stream log del tunnel Cloudflared |
| `npm run dev:logs:minio` | Stream log di MinIO |
| `npm run dev:stop` | Stop di tutti i container (mantiene i volumi) |
| `npm run dev:reset` | Stop + rimuove tutti i volumi (reset completo) |

### Switching provider email

In dev, `apps/api/.dev.vars` ha `EMAIL_PROVIDER=smtp` → tutte le email finiscono in Mailpit su http://localhost:8025.
Per testare il path Resend in locale: imposta `EMAIL_PROVIDER=resend` e `RESEND_API_KEY=<your-key>`.

### SQLite Web

Con lo stack attivo, http://localhost:8080 espone il database D1 locale in sola lettura. Utile per ispezionare tabelle, verificare seed e controllare lo stato dopo le migrazioni. Per modificare il DB usa `wrangler d1 execute --local`.

> Se non hai ancora applicato le migrazioni (`npm run db:migrate:local`), il container logga un avviso e rimane in attesa — non crasha.

### Webhook tester

Crea sessioni UUID via `POST http://localhost:8084` o usa l'helper `newBucket()` da `test/helpers/webhook-tester-client.ts`. Le automation `webhook` configurate con `WEBHOOK_TESTER_URL` invieranno i payload a questo container invece che a servizi esterni.

### Cloudflared Tunnel

Il container `tunnel` espone l'API locale (porta 8789) su una URL pubblica `*.trycloudflare.com`. Necessario per testare webhook **entranti** da servizi di terze parti (Stripe, GitHub, ecc.) e per le notifiche QStash (vedi sotto). La URL cambia a ogni restart; usa `npm run dev:tunnel-url` per leggerla.

### QStash in locale

`npm run dev:full` rileva automaticamente l'URL del tunnel Cloudflare e lo scrive in `apps/api/.dev.vars` come `QSTASH_CALLBACK_URL` — non serve installare ngrok né configurare nulla a mano. Per attivare le notifiche via QStash basta impostare `QSTASH_TOKEN` (e opzionalmente `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY`) in `.dev.vars`.

> `QSTASH_CALLBACK_URL` è distinto da `APP_URL`: `APP_URL` è l'URL del dashboard (usato nei link delle email, es. reset password) e in dev resta `http://localhost:5173`. `QSTASH_CALLBACK_URL` è l'URL pubblico tramite cui QStash richiama il webhook `/api/webhooks/qstash` del Worker.

### Note sicurezza

- Tutti i container hanno bind su `127.0.0.1` — nessuna porta è esposta sulla LAN.
- `sqlite-web` è in **sola lettura**: per modificare il DB usa `wrangler d1 execute --local`.
- Mailpit accetta qualsiasi credenziale SMTP — è pensato esclusivamente per dev/test, mai per traffico reale.

---

## Configurazione .dev.vars

Copia il file di esempio e usalo così com'è per lo sviluppo locale:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Le credenziali di default per MinIO e Mailpit sono già precompilate nell'esempio. Variabili principali:

| Variabile | Default (dev locale) | Descrizione |
|---|---|---|
| `R2_ENDPOINT` | `http://localhost:9000` | Endpoint S3-compatibile (MinIO) |
| `R2_ACCESS_KEY_ID` | `beechdev` | Access key MinIO |
| `R2_SECRET_ACCESS_KEY` | `beechdevsecret` | Secret key MinIO |
| `R2_BUCKET_NAME` | `beech-media` | Nome del bucket |
| `EMAIL_PROVIDER` | `smtp` | Provider email (`smtp` per Mailpit, `resend` per produzione) |
| `SMTP_HOST` | `localhost` | Host Mailpit |
| `SMTP_PORT` | `8025` | Porta HTTP API Mailpit |
| `EMAIL_FROM` | `Beech CMS <dev@beech.local>` | Mittente email |
| `WEBHOOK_TESTER_URL` | `http://localhost:8084` | URL webhook-tester locale |
| `MAX_UPLOAD_BYTES` | `52428800` (50 MB) | Limite dimensione upload |

In produzione configura le variabili sensibili come wrangler secret:

```bash
wrangler secret put EMAIL_PROVIDER   # "resend"
wrangler secret put RESEND_API_KEY
wrangler secret put R2_ENDPOINT
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME
```

---

## Bootstrap database D1 locale

`npm run dev:full` esegue automaticamente `apps/api/scripts/bootstrap-d1.mjs`, che applica tutte le migrazioni `0000 → ultima` se il database locale non esiste ancora. È idempotente: se il DB è già inizializzato, il log mostra `bootstrap-d1: DB already initialized — skipping`.

Per repartire da zero solo sul DB:

```bash
cd apps/api && npm run db:reset:local
cd ../..
npm run dev:full
```

---

## Development with Runtime Seeds

In BeechCMS, content types (Seeds) are database-resident. The D1 `seeds` table is the canonical source of truth at runtime.

### Local Provisioning & Bootstrapping
When developing locally, you can load definitions from `seeds.ts` into the local D1 instance.
To reset your local database and onboard seed definitions from scratch, run:

```bash
npx beech onboard --local --yes
```

This runs the file checklist, initializes the system tables, applies migrations, and loads all seeds defined in `seeds.ts` into the `seeds` system table.

### Dynamic Updates during Development
If you modify content schemas in code (`seeds.ts`), run:

```bash
npx beech seed:load --local
```

This pushes the new definitions to D1, triggers the Botanical Engine to adjust local SQL columns, and invalidates the cached registry (`seed_meta.registry_version`) so the running API server updates instantly.

If you edit content types directly inside the dashboard's **Settings → Content Types** (Seed Builder) tab, DDL changes are applied at runtime directly to D1.

---

## Testing

I test `apps/api` richiedono lo stack Docker attivo (stesso stack di `npm run dev:full`). Il setup Vitest (`test/global-setup.ts`) verifica MinIO, Mailpit e webhook-tester prima di partire e crea un bucket MinIO effimero per il run.

```bash
npm run dev:full           # avvia lo stack completo (tienilo aperto in un terminale)
cd apps/api && npm test    # esegue la suite contro i container reali
```

Se i container non sono attivi, i test falliscono immediatamente con un messaggio che indica quali servizi mancano e come avviarli. **Non esistono fallback su `vi.mock`** per email, R2 o webhook — i test usano gli stessi servizi che girano in dev.

### Strategia test

| Layer | Approccio |
|---|---|
| Funzioni pure, validatori | Unit test senza Docker — veloci, nessuna dipendenza esterna |
| Email transazionali | Integration test contro Mailpit reale |
| Upload R2 | Test contro MinIO reale con bucket effimero `beech-media-test-<pid>` |
| Webhook automation | Test contro webhook-tester reale |
| Database D1 | `D1TestDatabase` (better-sqlite3 in-memory) — stessa semantica SQLite/FTS5 di D1, isolamento per test |

> Il DB resta in-memory per i test (via `D1TestDatabase`) perché ogni test deve partire da uno stato pulito. I layer di integrazione esterna (R2, email, webhook) usano invece container reali — la distinzione è intenzionale.

### Windows — prerequisito per better-sqlite3

`better-sqlite3` è un binding nativo. Su Windows è necessario avere installato **Visual Studio Build Tools 2022** (o Visual Studio con il workload "Desktop development with C++"). In CI Linux non è richiesto nulla di extra.
