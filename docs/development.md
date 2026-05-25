# Development Setup

## Prerequisites

- **Node.js 20+**
- **npm 11+**
- **Docker Desktop** or **Docker Engine** — richiesto per lo storage in sviluppo locale

## Quick Start

```bash
npm run dev:full
```

Questo comando avvia MinIO (storage S3-compatibile), l'API Cloudflare Workers e la Dashboard React in parallelo. È il **comando canonico** per lo sviluppo.

> Se non hai Docker, puoi usare `npm run dev` ma gli upload media non funzioneranno senza MinIO attivo.

## Storage in Development

BeechCMS usa URL presigned per gli upload: il Worker non riceve mai bytes di file, ma restituisce una URL firmata che il client usa per caricare direttamente su R2/MinIO. Questo richiede un endpoint S3-compatibile anche in sviluppo locale.

**MinIO** è un server S3-compatibile open source che replica il comportamento di Cloudflare R2 in locale.

### Comandi storage

| Comando | Descrizione |
|---|---|
| `npm run dev:full` | **Canonico**: avvia MinIO + API + Dashboard |
| `npm run dev:storage` | Avvia solo MinIO (utile se vuoi riavviare API/Dashboard separatamente) |
| `npm run dev:storage:stop` | Ferma i container MinIO |
| `npm run dev:storage:reset` | Elimina i container e i volumi MinIO (reset completo) |
| `npm run dev` | Solo API + Dashboard (richiede MinIO già attivo) |

### Configurazione .dev.vars

Copia il file di esempio e usalo così com'è per lo sviluppo con MinIO:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Le credenziali di default per MinIO locale sono già precompilate nell'esempio.

### MinIO Console

Con MinIO attivo, puoi accedere alla console web su [http://localhost:9001](http://localhost:9001):

- **Username**: `beechdev`
- **Password**: `beechdevsecret`

### CORS in sviluppo

MinIO in sviluppo accetta qualsiasi origine. In produzione con R2 configura `AllowedOrigins` con la lista esplicita dei tuoi domini.

### Reset dello storage

```bash
npm run dev:storage:reset
```

Questo elimina il volume Docker con tutti i file caricati. Utile per testare upload da zero.

## Variabili d'ambiente

Tutte le variabili vengono lette da `apps/api/.dev.vars` durante lo sviluppo (tramite Wrangler).

| Variabile | Default (MinIO) | Descrizione |
|---|---|---|
| `R2_ENDPOINT` | `http://localhost:9000` | Endpoint S3-compatibile |
| `R2_ACCESS_KEY_ID` | `beechdev` | Access key |
| `R2_SECRET_ACCESS_KEY` | `beechdevsecret` | Secret key |
| `R2_BUCKET_NAME` | `beech-media` | Nome del bucket |
| `MAX_UPLOAD_BYTES` | `52428800` (50 MB) | Limite dimensione upload |

In produzione configura le stesse variabili come wrangler secret:

```bash
wrangler secret put R2_ENDPOINT
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME
```
