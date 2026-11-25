# Publishable & Secret Keys — ROADMAP

> Stato: **sprint 01 DONE** (`3ad0b738`, `e280c5bd`, archivio `docs/Sprints/KeyRoleRuntime/`) · **sprint 02 DONE** (review PASS, archivio `docs/Sprints/ScaffoldSecrets/`, non ancora committato) · **sprint 03 DONE** (review PASS, archivio `docs/Sprints/KeysMigrate/`, non ancora committato) · **sprint 04 PLANNED** (`KeyModelDocs.md`) · Data: 2026-11-25 · Base: `api@0.10.1`, `cli@0.10.1`, `cms@0.10.1`,
> `client@0.10.0` · Brief: `stages/00_ideation/output/feature_brief.md` (issue #995, #996, #997)

Sostituisce le due chiavi per metodo (`PUBLIC_READ_API_KEY` / `PUBLIC_WRITE_API_KEY`) con due ruoli di
chiave: **publishable** (`BEECH_PUBLISHABLE_KEY`, sola lettura, browser) e **secret** (`BEECH_SECRET_KEY`,
tutto, solo server). Nessuna compatibilità legacy: i vecchi nomi spariscono, i progetti 0.10.x migrano
con un comando esplicito.

## Decisioni condivise da tutti gli sprint (fissate nello sprint 01, non rinegoziare)

| Cosa | Valore |
|---|---|
| Binding runtime publishable | `BEECH_PUBLISHABLE_KEY` |
| Binding runtime secret | `BEECH_SECRET_KEY` |
| Valori locali | `beech_pk_dev`, `beech_sk_dev` |
| Prefissi generati in produzione | `beech_pk_live_` + 32 hex, `beech_sk_live_` + 32 hex (convenzione, il runtime non li valida) |
| Header | `X-API-Key` (invariato) |
| Config client | browser `{ baseUrl, publishableKey }`, server `{ baseUrl, secretKey }` |
| Comando di migrazione | `beech keys:migrate` (sprint 03) |
| Segreto anti-bot | resta `PUBLIC_TIME_TRAP_SECRET`, cambia solo il file in cui vive |

## Sprint

| # | Slug | Obiettivo | Deliverable | Dipende da |
|---|---|---|---|---|
| 01 | `KeyRoleRuntime` | Il runtime capisce solo i due ruoli: middleware e handler `add` condividono un'unica decisione; i client accettano solo `publishableKey` / `secretKey`. | `apps/api` public slice (risoluzione ruolo, guardia della dev secret key, nuovi problem type), `Env`, `packages/client` (config, validazione, tipi), fixture di test e tutte le suite che usano le chiavi, fix del 500 su add/edit pubblici per seed con relazioni (`sanitize.ts` senza `idGenerator`), config dev del monorepo (`wrangler.jsonc`, `.dev.vars.example`, orchestrator, e2e). | — |
| 02 | `ScaffoldSecrets` | Un progetto nuovo non committa segreti e risponde 200 alla prima richiesta documentata. | `bin/template.mjs` (`vars` senza segreti, `.dev.vars` con `JWT_SECRET`, `BEECH_SECRET_KEY`, `PUBLIC_TIME_TRAP_SECRET`, `PRIVACY_MASTER_KEY`), `bin/create.mjs` (riepilogo senza secret key, comandi `wrangler secret put`), test sul contenuto del primo commit, `scripts/smoke-release.mjs` (lettura `beech_pk_dev` 200, scrittura `beech_sk_dev` 201, scrittura `beech_pk_dev` 403), `beech init` (publishable in chiaro, della secret key solo la presenza, `.dev.vars` obbligatorio in locale), template di `beech forms` senza chiave, `beech setup:cloudflare` che fonde le credenziali R2 in `.dev.vars` invece di sovrascriverlo (aggiunto in pianificazione: altrimenti cancella `JWT_SECRET`, `BEECH_SECRET_KEY` e `PRIVACY_MASTER_KEY`), helper `packages/cli/src/lib/dev-vars.ts`. | 01 (i nomi e il comportamento del runtime) |
| 03 | `KeysMigrate` | Un progetto 0.10.x passa al nuovo modello con un comando unico, idempotente, che ruota i segreti esposti. | `packages/cli` comando `keys:migrate` (sposta e ruota `JWT_SECRET` e `PUBLIC_TIME_TRAP_SECRET`, sostituisce le due chiavi, non tocca mai `PRIVACY_MASTER_KEY`, si ferma senza scrivere se un file manca, stampa i comandi `wrangler secret put` e l'avviso sulla history git; riusa `parseDevVars`/`upsertDevVars` dello sprint 02), `beech init` segnala i nomi legacy e rimanda a `beech keys:migrate`, voce in `bin/beech.mjs` e in `docs/build/cli-workflows.md` (parity test). Aggiunto in pianificazione: `lib/key-model.ts` (nomi legacy condivisi da `init` e `keys:migrate`), `findTopLevelObjectSpan` in `lib/wrangler.ts`, rifiuto dei nomi legacy in `env.<name>.vars`, ordine di produzione `npm run deploy` → `wrangler secret put` (Cloudflare rifiuta un secret con lo stesso nome di una var, errore 10053). | 02 (la disposizione dei file che la migrazione deve produrre è quella dello scaffold) |
| 04 | `KeyModelDocs` | Ogni guida usa solo nomi e valori che il codice riconosce. | Guide framework (`docs/start/frameworks/*.md`), `first-project.md`, `public-api.md`, `client-sdk.md` (tabella ruoli, avvertenza browser), `environments.md`, `CHANGELOG.md` ("Aggiornare da 0.10.x"), sezione di `scripts/docs-fact-check.mjs` che fallisce sui nomi legacy (deve ammetterli nella sottosezione di migrazione di `docs/build/cli-workflows.md`, scritta nello sprint 03, e nella sezione "Aggiornare da 0.10.x" del changelog), rebuild di `packages/mcp/resources` (generato da `packages/mcp/scripts/bundle-resources.mjs` nel `build` di mcp, non tracciato da git). Aggiunto in pianificazione: `start/index.md`, `reference/error-model.md` (i due nuovi problem type), `features/forms.md` (nessuna chiave: la publishable key fa fallire l'invio con 403), `features/backrefs.md`, la riga `keys:migrate` della matrice in `cli-workflows.md`, rigenerazione TypeDoc di `docs/api` (documenta ancora `BeechClientConfig.apiKey` e MCP lo serve), la guida Nuxt passa al client browser (il plugin gira nel browser), il matcher in `scripts/lib/legacy-key-names.mjs` con test, l'intestazione del changelog in inglese `### Upgrading from 0.10.x`. | 03 (il changelog cita `beech keys:migrate`) |

## Note di rilascio

- Fra il merge dello sprint 01 e quello dello sprint 02 lo scaffolder scrive ancora i vecchi nomi: **non
  rilasciare** `@beechcms/api`, `@beechcms/client` o `@beechcms/cms` finché non sono chiusi gli sprint
  01, 02 e 03. Lo sprint 04 può uscire con loro o subito dopo.
- Limite noto, fuori scope (#1022): `create()` con secret key richiede ancora `allowPublicPost` sul seed.
- Follow-up senza riga di roadmap: `@beechcms/forms-react` (prop `apiKey`, default `beech_sk_dev` in `examples/ClientiTestPage.tsx:19`); nessuna generazione di una publishable key di produzione (lo scaffold committa `beech_pk_dev` in `vars`, che resta valida anche in produzione).
