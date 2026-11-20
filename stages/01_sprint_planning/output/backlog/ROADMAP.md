# `@beechcms/mcp` 2.0 — Agent Control Plane (ROADMAP)

> Stato: **sprint 03-05b DONE, sprint 06 PLANNED** · Data: 2026-11-21 · Base:
> `@beechcms/mcp@1.2.0`, `api@0.10.0`
> Obiettivo: l'agente di un developer che lavora in locale può fare tutto ciò che l'utente fa
> dalla dashboard, entro il suo RBAC, scrivendo script TypeScript invece di chiamare un tool alla
> volta. Le azioni rischiose richiedono conferma umana in chat. Costo di esercizio: zero.

---

## 0. TL;DR

- **Il pattern di riferimento è il Code Mode** (Cloudflare, Anthropic): il modello scrive codice
  contro un'API tipizzata invece di chiamare un tool per endpoint.
- **Per BeechCMS il "codice" è un file nel repo**: l'agente scrive `.beech/scripts/*.ts` con
  l'SDK `beech` (dentro `@beechcms/cli`, nessun package nuovo) e lo esegue con `pnpm beech run`. Niente sandbox (in locale non
  protegge nulla), niente server remoto (il Worker Loader è solo sul piano Paid). Zero costi.
- **La sicurezza sta nell'API**: le richieste OAuth passano per auth → scope → RBAC, come quelle
  della dashboard. Quelle distruttive (e in produzione le pubblicazioni) diventano *intent* che
  l'umano conferma in chat tramite elicitation MCP (`beech_confirm`).
- **Oggi l'MCP copre 9 operazioni su 142** (solo schema). L'inventario completo è in §3.
- **Primo passo:** un **Operation Catalog** in core da cui derivare scope OAuth, intent gate,
  SDK, ricerca e test di parità (oggi l'allowlist OAuth autorizza solo 5 route).

---

## 1. Ricerca: come funzionano i "nuovi" MCP

### 1.1 Il problema dei tool classici

Ogni tool MCP porta nel contesto nome + descrizione + JSON Schema dell'input. Con API grandi le
definizioni da sole saturano il contesto (Cloudflare: 2.500 endpoint ≈ 1,17M token con un tool
per endpoint). In più ogni risultato intermedio passa dal modello: "lista 500 entry → filtra →
aggiorna 40" diventa decine di turni e migliaia di token di JSON che il modello rilegge.

### 1.2 Cloudflare Code Mode (set. 2025 → MCP server feb. 2026)

- **Due tool**, entrambi con input `{ code: string }` (una async arrow function JS):
  - `search` — il codice gira **senza rete** contro un oggetto `spec` (OpenAPI con tutti i
    `$ref` già risolti inline). Il modello filtra `spec.paths` e trova gli endpoint che servono.
  - `execute` — il codice gira in un isolate separato con un client `cloudflare.request({ method,
    path, query, body })`. L'header `Authorization` è iniettato dall'host tramite
    `globalOutbound`; il sandbox non vede mai il token e può parlare solo con l'API.
- Il server di produzione oggi espone anche `docs` e `whoami`, e una modalità "direct"
  (`?codemode=false`) con un tool per metodo.
- **Sandbox**: Dynamic Worker Loader (`worker_loaders` binding, `env.LOADER.get(id, cb)`), un
  isolate V8 nuovo per esecuzione, avvio in pochi ms, niente filesystem, niente env,
  `globalOutbound: null` ⇒ `fetch()`/`connect()` lanciano errore.
- **Limiti**: timeout esecuzione 60s (default `DynamicWorkerExecutor`), risposta troncata a
  ~6.000 token stimati (`--- TRUNCATED ---`), retry 429 solo se tutte le richieste del run
  erano GET/HEAD.
- **SDK `@cloudflare/codemode`** (sperimentale):
  - `openApiMcpServer({ spec, executor, request })` → `search` + `execute` da una spec OpenAPI.
  - `codeMcpServer({ server, executor })` → avvolge un McpServer esistente in un tool `code`.
  - `createCodeTool`, `resolveProvider`, `generateTypesFromJsonSchema` → genera
    `declare const codemode: {...}` con JSDoc dai JSON Schema: il modello vede **tipi TS**, non
    JSON Schema.
  - `DynamicWorkerExecutor({ loader, timeout, globalOutbound, modules, bindings })`;
    interfaccia `Executor.execute(code, providers) → { result, error?, logs? }`.
  - `createCodemodeRuntime` (Durable Object) aggiunge `requiresApproval`, `approve()`,
    `reject()`, `rollback()` con TTL 24h per le esecuzioni in pausa.
  - Entrambi gli helper restituiscono un server SDK v1, servito con `createLegacyMcpHandler`.
- **Approvazioni**: il server Cloudflare **non** chiede conferma per chiamata; si affida allo
  scope OAuth concesso. La doc dice esplicitamente che l'enforcement va fatto nell'handler host
  "prima di applicare side effect".

### 1.3 Anthropic — "Code execution with MCP" (nov. 2025)

Stessa idea, lato client: i tool MCP diventano **file TypeScript** in un albero
(`./servers/<server>/<tool>.ts`) che l'agente esplora come un filesystem e importa nel proprio
codice. Punti utili per noi:
- **Progressive disclosure**: `search_tools` con livello di dettaglio (solo nome → nome +
  descrizione → schema completo).
- **Filtrare nel sandbox**: da 10.000 righe l'agente logga il conteggio e 5 esempi.
- **Privacy**: i dati intermedi restano nel sandbox; i campi sensibili possono essere
  tokenizzati (`[EMAIL_1]`) prima di arrivare al modello.
- **Stato e skill**: l'agente salva script funzionanti (`./skills/*.ts` + `SKILL.md`) e li
  riusa. È il "si fanno un file così non fanno più comandi uno alla volta".
- Numeri dichiarati: 150k → 2k token (−98,7%).

### 1.4 Spec MCP: cosa cambia per un server nuovo

| Versione | Feature rilevanti per noi |
|---|---|
| 2025-06-18 | `outputSchema` + `structuredContent`, `resource_link` nei risultati, elicitation |
| 2025-11-25 | elicitation URL-mode, icone, sampling con tool, **tasks** (sperimentale), Client ID Metadata Documents (CIMD), discovery RFC 9728 |
| 2026-07-28 | **protocollo stateless** (niente `Mcp-Session-Id`, niente `initialize`), stato cross-call solo tramite **handle mintati dal server passati come argomenti**, `server/discover`, tasks spostati nell'estensione `io.modelcontextprotocol/tasks` (polling `tasks/get`), Multi Round-Trip Requests (`resultType: "input_required"`) al posto di elicitation server-initiated, DCR deprecata in favore di CIMD, Sampling/Roots/Logging deprecati |

Conseguenze dirette:
1. Le annotation (`readOnlyHint`, `destructiveHint`, …) sono **untrusted** per il client: utili
   per la UX dei permessi, ma l'enforcement deve stare sul server.
2. Errori di validazione ⇒ risultato con `isError: true` (il modello si autocorregge), non errore
   di protocollo.
3. `planId` in una `Map` in memoria (oggi `packages/mcp/src/plans.ts`) **non è compatibile** né
   con un server remoto su Workers (isolate diversi) né con il modello stateless: gli handle
   vanno persistiti (D1) e passati come argomenti.
4. Per client remoti (claude.ai, Claude Code HTTP) servono metadata OAuth di discovery
   (`/.well-known/oauth-protected-resource`, `/.well-known/oauth-authorization-server`) e CIMD:
   oggi BeechCMS non li espone.

---

## 2. Stato attuale (`@beechcms/mcp@1.2.0`)

| Area | Oggi |
|---|---|
| Trasporto | stdio, supervisor con hot-reload (`src/supervisor.ts`) |
| Auth | OAuth 2.1 PKCE via `@beechcms/api-client`, client `beech-mcp`, cache `~/.beechcms/mcp-tokens.json` |
| Tool | 9: `beech_list_seeds`, `beech_get_seed`, `beech_schema_export`, `beech_schema_validate`, `beech_schema_plan`, `beech_schema_apply`, `beech_docs_search`, `beech_mcp_status`, `beech_mcp_reload` |
| Copertura API | 5 route su 142 (solo schema), vedi `apps/api/src/middleware/oauth-scope.middleware.ts` |
| Scope OAuth | `schema:read`, `schema:write` (`packages/core/src/oauth/scopes.ts`) |
| Stato | piani in `Map` in memoria, TTL 10 min, single-use |
| Docs | ~200 risorse `beechcms-docs://` + ricerca full-text |

Difetti minori trovati durante l'analisi (da sistemare nella 2.0):
- `beech_mcp_status` e il costruttore `Server` dichiarano `version: '0.1.0'`, il package è `1.2.0`.
- `PROTECTED_ROUTES` contiene `kanban-(move|position)` ma la route `kanban-position` non esiste.
- Molti body sono `z.custom<...>()` (seed, entry, draft, import): validano a runtime ma **non
  producono JSON Schema**, quindi oggi non si può generare né una spec OpenAPI né i tipi del
  sandbox da quegli schemi.
- I tool di sola lettura richiedono `manage_seeds` a `*` (documentato come limite noto).

---

## 3. Inventario completo delle operazioni API (142)

Fonte: `createBeechApp().routes` a runtime (esclusa la SPA `/admin`), incrociata con
`PROTECTED_ROUTES` (RBAC), gli schemi Zod di ogni feature e `docs/reference/*`.
Conteggio per metodo: 62 GET · 38 POST · 15 PUT · 10 PATCH · 17 DELETE.

**Legenda della colonna MCP 2.0** (= `risk` / `exposure` nel catalog, §4.4)
- **R** lettura (`read`), eseguita subito.
- **W** scrittura reversibile o additiva (`write`), eseguita subito.
- **P** scrittura con effetti verso l'esterno (`publish`: pubblica contenuto, manda email,
  abilita webhook). Eseguita subito in `development`, intent con conferma in `production`.
- **D** distruttiva o di privilegio (`destructive`): **sempre** intent con conferma umana.
- **X** esclusa (`exposure: 'excluded'`): credenziali, flussi interattivi, segreti, interni.

I conteggi sono stime fatte a mano: quelli esatti escono dal catalog nello sprint 03.

> **Riclassificazioni decise nella pianificazione dello sprint 03** (fonte di verità:
> `OperationCatalog.md`, Task 3 — 142 operazioni, 106 `agent`, 36 `excluded`):
> - Invariante: `exposure: 'agent'` ⇔ la route vive sotto `apiProtected` (l'unico mount che accetta
>   token OAuth). Quindi `GET /auth/features`, le 9 route `/api/v1/public/*` e `GET /api/media/:key{.+}`
>   diventano **X** (le tabelle §3.1–§3.3 le davano R).
> - `PATCH /api/content/:slug/bulk` è sempre **W**: il bulk scrive solo branch per alias e `status` non è
>   un branch. La "soglia configurabile" diventa eventualmente policy del gate (sprint 05), non metadato.
> - `POST /api/content/:slug/import` è **P** statico: il file può contenere righe `published` e il body
>   (`objectKey`, `format`) non lo rivela.
> - Scope v2 nel catalog come `OPERATION_SCOPES` separato da `OAUTH_SCOPES` (fusione nello sprint 04);
>   `agent:read`/`agent:approve` arrivano con le route dello sprint 05.
>
> **Decisioni della pianificazione dello sprint 04** (fonte di verità: `OAuthScopesV2.md`):
> - Un solo vocabolario: `OAUTH_SCOPES` in `oauth/scopes.ts` diventa la lista v2 (14 scope);
>   `OPERATION_SCOPES`/`OperationScope` dello sprint 03 (mai rilasciati) vengono rimossi.
> - `PermissionRoleGuard` passa da "tutto o niente con `manage_seeds@*`" a concessione parziale per scope
>   (`SCOPE_GRANT_REQUIREMENTS`, derivata dal catalog × `PROTECTED_ROUTES` e verificata da un test di parità).
> - Guard ad interim: finché lo sprint 05 non introduce gli intent, una richiesta OAuth il cui rischio è
>   `publish` o `destructive` riceve `403 confirmation_required` (mai eseguita). Lo sprint 05 la sostituisce
>   con il `202` dell'intent gate.
> - Template di consenso (solo dashboard, restringono e non allargano mai lo scope richiesto): **Lettura** =
>   tutti i `*:read` (incluso `schema:read`, serve all'agente per conoscere i seed); **Editor** = Lettura +
>   `content:write`, `content:delete`, `media:write`; **Amministratore** = Editor + `automations:write`,
>   `users:write`, `settings:write`; **Developer** = tutti.
> - La migration `0045` è `0045_oauth_scopes_v2.sql`: la tabella `agent_intents` dello sprint 05 diventa `0046`.
>
> **Decisioni della pianificazione dello sprint 05** (fonte di verità: `AgentIntents.md`):
> - Lo sprint 05 si divide: **05 AgentIntents** (core + API: tabella, repository, gate, endpoint, replay, activity
>   log) e **05b AgentIntentsDashboard** (sezione "Azioni agente in attesa" + etichette activity log). Motivo: l'API
>   è la parte critica per la sicurezza e va revisionata da sola; la dashboard dipende dai tipi RPC delle route nuove.
> - Scope: `agent:read` e `agent:approve` entrano in `OAUTH_SCOPES` (16). `allowed_scopes`: `beech-mcp` li ha entrambi,
>   `beech-mcp-cli` solo `agent:read` (migration `0046`). Entrambi sono `'authenticated'` in `SCOPE_GRANT_REQUIREMENTS`
>   e fanno parte del template di consenso **Lettura** (quindi di tutti): l'approvazione resta un dialog umano e il
>   replay ripassa per l'RBAC.
> - Operazioni nel catalog: `intents.list|get` (`agent:read`, `read`), `intents.reject` (`agent:read`, `write`),
>   `intents.approve` (`agent:approve`, `write`: approvare non crea a sua volta un intent). Totale 146 (110 `agent`).
> - Il marcatore di replay non è un header HTTP ma un valore con chiave `Symbol` nell'`env` passato a `app.fetch`
>   in-process: un client esterno non può falsificarlo. `authMiddleware` lo riconosce solo con `acceptOAuth`.
> - Il replay riesegue metodo, path (con query) e body salvati; gli header della richiesta originale non vengono
>   salvati né rieseguiti.
> - Scadenza pigra: nessun job di pulizia; un intent scaduto diventa `expired` al primo approve/reject.
> - Nessuna implementazione in-memory del repository: i test usano D1 reale (`testing_conventions.md` 0.1).
> - Activity log: nuovo `EntityType` `'intent'`; azioni esistenti `create` (intent creato), `authorize` (approvato ed
>   eseguito), `revoke` (rifiutato). Le etichette in dashboard arrivano con lo sprint 05b.
>
> **Decisioni della pianificazione dello sprint 05b** (fonte di verità: `AgentIntentsDashboard.md`):
> - Solo dashboard: nessuna modifica ad API, core o package. Le route di 05 accettano già il JWT dashboard.
> - Nessuno slice nuovo: la sezione "Azioni agente in attesa" vive in `features/oauth-consent/` ed è la prima sezione
>   del tab **Impostazioni → App collegate**, sopra l'elenco delle app.
> - Indirizzo stabile per il fallback dello sprint 08: **`?settings=connected-apps&section=agent-actions`**.
> - Anteprima = corpo della richiesta salvata (JSON indentato, solo testo). Approvare dal dialog è la conferma: nessun
>   secondo dialog; per `destructive` il pulsante usa la variante `destructive`.
> - Polling ogni 30 s solo con la sezione aperta; nessun badge/contatore, nessuno storico degli intent decisi.
>
> **Decisioni della pianificazione dello sprint 06** (fonte di verità: `ScriptSdk.md`):
> - Nomi: il metodo SDK è l'id del catalog (`drafts.publish` → `beech.drafts.publish()`), 19 namespace = i domini del
>   catalog. 108 metodi su 110 operazioni `agent`; omesse con motivo solo `intents.approve` (niente auto-approvazione) e
>   il multipart `media.upload` (il Worker non riceve byte). Helper: `content.listAll`, `content.importFile` (CSV o
>   NDJSON, al posto di `importCsv`), `content.waitForImport`, `media.uploadFile`. Nessun namespace `jobs`.
> - Esito: le letture restituiscono il dato; ogni altro metodo restituisce `WriteOutcome<T>` =
>   `executed | pending (intent) | dry-run`, discriminato da `kind`. L'intent si riconosce dalla forma del body
>   (`isAgentIntentPendingResponse`, in core insieme al tipo spostato dal middleware), mai dal solo `202`: import e
>   purge dei seed rispondono `202` con un job.
> - Dry-run: le letture partono, le altre richieste vengono solo registrate nel journal (`calls`, `pendingIntents`)
>   che `beech run` stamperà nello sprint 07.
> - Tipi precisi solo per `content`, `trash`, `media`, `intents` e job di import; gli altri 15 namespace hanno firme
>   meccaniche (parametri di path, poi query o body) e risposta `SdkJson`.
> - Trasporto: `ApiClient.send()` nuovo in `@beechcms/api-client` (Response grezza, stesso OAuth/retry); `request()`
>   invariato. Un solo scope per il client `beech-mcp-cli` (`CLI_OAUTH_SCOPE` = tutti tranne `agent:approve`), usato
>   anche da `beech schema *`, per non avere due grant con scope diversi sulla stessa chiave di cache.
> - `@beechcms/cli/sdk` esporta solo tipi, `BeechSdkError` e le guardie; `createBeechSdk` resta interno fino allo
>   sprint 07.
>
> **Smoke test API dello sprint 05** (2026-11-20, `pnpm beech dev` su `localhost:8789`, consensi OAuth reali di
> `beech-mcp-cli` e `beech-mcp`): **12/12 controlli passati** una volta corretti due errori dello script di prova.
> `DELETE /api/seeds/:slug` col token degli script → `202` intent `pending` (`seeds.delete`, `destructive`), seed intatto;
> l'intent compare in `GET /api/agent/intents`; reject → `200 rejected`, seed intatto; approve dopo reject → `409
> intent_not_pending`; approve col client degli script → `403` (manca `agent:approve`); approve con `beech-mcp` → `200`,
> replay `200 {"success":true}`, intent `executed`, seed `deleted`; secondo approve → `409`. Un replay che il server
> rifiuta (seed legato a un manifest, `409 seed-manifest-owned`) viene salvato come `failed` con il suo stato: corretto.
> Seed di prova rimossi con hard delete passato anch'esso dal gate (replay `202` del job di purge).
> - Trovato: `pnpm beech db:migrate` non applica migration nuove su un DB locale già inizializzato (il DB era senza
>   0045/0046, consenso fallito con `invalid_scope`). Issue **#967**; 0045/0046 applicate a mano sul DB locale.
> - Da verificare (non bloccante): `GET /api/seeds/:slug` risponde anche per un seed `deleted`.
> - Lo smoke della UI (sezione "Azioni agente in attesa", approvazione con il JWT dashboard) si fa a fine sprint 05b.

### 3.1 Auth e OAuth (17) — fuori dall'MCP

| Endpoint | Cosa fa | MCP 2.0 |
|---|---|---|
| `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` | sessione dashboard | X |
| `GET /auth/setup` · `POST /auth/setup` | primo admin | X |
| `GET /auth/features` | feature flag di auth (provider abilitati) | R (`beech.system.authFeatures()`) |
| `POST /auth/forgot-password` · `POST /auth/reset-password` | reset password | X |
| `GET /auth/invitations/:token` · `POST /auth/invitations/accept` | redenzione invito | X |
| `GET /oauth/authorize` · `GET /oauth/authorize/request` · `POST /oauth/authorize/consent` | consenso OAuth | X |
| `POST /oauth/token` · `POST /oauth/revoke` | token endpoint | X (usati dall'host, non dal codice) |
| `GET /oauth/consents` · `DELETE /oauth/consents/:clientId` | "Connected apps" | X (un agente non gestisce le proprie concessioni) |

### 3.2 API pubblica `/api/v1/public` (9) — API key, non OAuth

| Endpoint | Cosa fa | MCP 2.0 |
|---|---|---|
| `GET /health` | health check | R |
| `GET /:seed/schema` | schema pubblico di un seed | R |
| `GET /:seed` | lista pubblica (filtri, `include=` relazioni, `X-Schema-Revision`) | R opzionale ("cosa vede il frontend"), richiede API key configurata |
| `POST /:seed/add` · `PUT|PATCH /:seed/edit/:id` | scrittura pubblica (form, idempotency key) | X (l'agente usa le route admin) |
| `GET /timetrap/token` | anti-bot per i form | X |
| `GET /search/embed` · `GET /search/index/:seedSlug/:file` | indice di ricerca statico per il client | X (basso valore, binario) |

### 3.3 Interni (2)

| Endpoint | MCP 2.0 |
|---|---|
| `POST /api/webhooks/qstash` (callback firmata della coda) | X |
| `GET /api/media/:key{.+}` (serving binario/trasformazioni) | R solo come URL/metadata, mai il binario nel contesto |

### 3.4 Schema: seeds, layout editor (19)

| Endpoint | RBAC | Cosa fa | MCP 2.0 |
|---|---|---|---|
| `GET /api/seeds` | manage_seeds | lista seed + `X-Schema-Version` | R |
| `GET /api/seeds/:slug` | manage_seeds | definizione completa | R |
| `GET /api/schema` | authed | snapshot registry (definizioni + layout) | R |
| `POST /api/seeds/:slug/mcp-plan` | manage_seeds | dry-run DDL + classificazione | R |
| `POST /api/seeds/:slug/mcp-apply` | manage_seeds | applica piano additivo (optimistic concurrency) | W |
| `POST /api/seeds` · `PUT /api/seeds/:slug` · `POST /api/seeds/:slug/branches` | manage_seeds | create/update/aggiunta branch diretti | instradati su plan/apply (un solo percorso di scrittura, auditato) |
| `POST /api/seeds/:slug/fts/rebuild` | manage_seeds | rebuild FTS | W (task lungo) |
| `GET /api/seeds/:slug/orphans` | manage_seeds | colonne orfane | R |
| `GET /api/seeds/purges/:id` | manage_seeds | stato job di purge | R |
| `DELETE /api/seeds/:slug` | manage_seeds | soft delete seed | D |
| `DELETE /api/seeds/:slug/hard` | manage_seeds | hard delete (`confirm: slug`), job asincrono | D |
| `DELETE /api/seeds/:slug/branches/:branchId` | manage_seeds | drop branch (`confirm: slug.alias`) | D |
| `PATCH /api/seeds/:slug/branches/:branchId/rename` | manage_seeds | rename (`newAlias`, `confirm`) | D |
| `PATCH /api/seeds/:slug/branches/:branchId/retype` | manage_seeds | retype (`newType`, `confirm`) | D |
| `DELETE /api/seeds/:slug/orphans/:column` | manage_seeds | drop colonna orfana | D |
| `PUT /api/schema/:slug/layout` | manage_seeds | layout dell'editor entry | W |
| `DELETE /api/schema/:slug/layout` | manage_seeds | reset layout | W |

### 3.5 Contenuti (43)

| Endpoint | RBAC | Cosa fa | MCP 2.0 |
|---|---|---|---|
| `GET /api/content/:slug` | content:read @slug | lista (page/limit/offset, search, sortBy/Dir, `filters` JSON `QueryFilterGroup[]`, `kanbanAxis`, `has_pending_draft`) | R |
| `GET /api/content/:slug/facets` | content:read | conteggi per facet | R |
| `GET /api/content/:slug/:id` | content:read | dettaglio | R |
| `GET /api/content/:schema_slug/by-slug/:entry_slug` | content:read | dettaglio per slug | R |
| `GET /api/content/:targetSlug/:targetId/backrefs` | content:read | chi punta a questa entry (group/page/limit) | R |
| `POST /api/content/:slug` | content:create | crea entry | W (P se `status: published`) |
| `PUT /api/content/:slug/:id` | content:update | aggiorna entry | W (P se passa a published) |
| `PATCH /api/content/:slug/bulk` | content:update | `{ ids ≤ 500, fields }` | W, P sopra soglia configurabile |
| `DELETE /api/content/:slug/:id` | content:delete | soft delete → cestino; `?purge=true` hard | W (soft) / D (purge) |
| `PATCH /api/content/:slug/:id/kanban-move` | content:update | sposta card (`position`, `axisBranchId`, `axis.value`) | W |
| `GET /api/content/:slug/trash` | content:read | lista cestino | R |
| `POST /api/content/:slug/:id/restore` | content:update | ripristina | W |
| `POST /api/content/:slug/trash/bulk-restore` | content:update | ripristino massivo | W |
| `POST /api/content/:slug/trash/bulk-purge` | content:delete | purge definitivo massivo | D |
| `POST /api/content/:slug/trash/reconcile` | content:delete | completa purge pendenti | D |
| `GET /api/content/drafts` | authed | bozze pendenti | R |
| `GET /api/content/:slug/:id/draft` | content:read | leggi bozza | R |
| `PUT /api/content/:slug/:id/draft` | content:update | salva bozza | W |
| `POST /api/content/:slug/:id/draft/publish` | content:update | pubblica bozza | P |
| `DELETE /api/content/:slug/:id/draft` | content:update | scarta bozza | W |
| `GET /api/content/:slug/export` | content:read | export (format, search, filters, safe) | R → `resource_link`, mai inline |
| `POST /api/content/:slug/import` | content:create | import da `objectKey` caricato | W (task) |
| `GET /api/content/import-jobs/:id` | authed | stato import | R |
| `GET /api/content/:slug/views` | content:read | viste editoriali salvate | R |
| `POST /api/content/:slug/views` · `PUT .../views/order` · `PATCH .../views/:viewId` · `DELETE .../views/:viewId` | content:update | gestione viste | W |
| `POST /api/content/:slug/:id/rotate-field` | content:update | ruota campo hashed (`currentValue` → `nextValue`) | X (i segreti non devono transitare nel modello) |
| `GET /api/content/notifications` | authed | notifiche | R |
| `PATCH .../notifications/:id/read` · `.../unread` | authed | stato lettura | W |
| `DELETE /api/content/notifications/:id` · `POST .../mark-all-read` | manage_users | gestione notifiche | W |
| `GET /api/content/stats/total` · `/breakdown` · `/recent-activity` | authed | statistiche | R |
| `GET /api/content/stats/media-library` · `/unused-media` | content:read | media | R |
| `GET /api/content/stats/setup-checklist` | manage_users | checklist | R |
| `GET /api/content/stats/health` · `/cloudflare` | view_analytics | salute/uso Cloudflare | R |
| `POST /api/content/stats/storage/sync` | view_analytics | ricalcola uso storage | W |

### 3.6 Media (5)

| Endpoint | RBAC | MCP 2.0 |
|---|---|---|
| `POST /api/upload/presign` · `POST /api/upload/confirm` · `POST /api/upload` (diretto) | content:create | W, solo tramite l'helper host `beech.media.upload()` (presign → PUT R2 → confirm) |
| `GET /api/upload/download-url/:key` | content:read | R |
| `DELETE /api/upload/:key` | content:delete | D |

### 3.7 Analytics widget, ricerca (7)

| Endpoint | MCP 2.0 |
|---|---|
| `GET /api/widget/{aggregate,growth,leaderboard,list,timeseries,distribution}/:seed` (content:read @seed) | R |
| `GET /api/search` (q, schema_slug, status, limit, cursor) | R |

### 3.8 Automazioni (6)

| Endpoint | RBAC | MCP 2.0 |
|---|---|---|
| `GET /api/automations` · `GET /api/automations/:id` | content:read | R |
| `POST /api/automations` · `PUT /api/automations/:id` | content:update | P (le azioni `webhook` chiamano URL esterni) |
| `PATCH /api/automations/:id/toggle` | content:update | P |
| `DELETE /api/automations/:id` | content:delete | D |

### 3.9 Utenti, ruoli, inviti (15)

| Endpoint | RBAC | MCP 2.0 |
|---|---|---|
| `GET /api/rbac/users` · `/users/:userId` · `/users/:userId/assignments` | manage_users | R |
| `GET /api/rbac/roles` | manage_users/roles | R |
| `GET /api/rbac/invitations` | manage_users | R |
| `POST /api/rbac/users` (crea account **con password**) | manage_users | X (si usa l'invito) |
| `PATCH /api/rbac/users/:userId/active` | manage_users | D |
| `POST /api/rbac/roles` | manage_roles | W |
| `PUT /api/rbac/roles/:roleId` · `DELETE /api/rbac/roles/:roleId` | manage_roles | D (cambia privilegi) |
| `POST /api/rbac/assignments` · `DELETE /api/rbac/assignments/:assignmentId` | manage_users | D (escalation di privilegi) |
| `POST /api/rbac/invitations` · `POST .../:invitationId/regenerate` | manage_users | P (manda email) |
| `DELETE /api/rbac/invitations/:invitationId` | manage_users | W |

### 3.10 Impostazioni e dashboard (19)

| Endpoint | RBAC | MCP 2.0 |
|---|---|---|
| `GET /api/settings` · `GET /api/settings/me` · `GET /api/settings/activity` | authed | R |
| `PUT /api/settings` (titolo, lingue, locale, timezone, retention cestino) | manage_users | P (cambia il sito per tutti) |
| `PUT /api/settings/profile` (email, nome) | authed | X (cambio email = identità account) |
| `PUT /api/settings/password` | authed | X |
| `PUT /api/settings/avatar` | authed | W |
| `GET /api/settings/sessions` | authed | R |
| `DELETE /api/settings/sessions/:id` | authed | X (rischio lock-out) |
| `GET /api/settings/storage` | view_analytics | R |
| `POST /api/settings/storage/orphans/delete` | content:delete | D |
| `GET|PUT /api/settings/notifications` · `GET|PUT /api/settings/ui-preferences` | authed | R / W |
| `GET /api/dashboard-layout` | authed | R |
| `GET /api/dashboard-layout/roles` | manage_roles | R |
| `PUT /api/dashboard-layout` | manage_layout \| manage_roles | W |
| `DELETE /api/dashboard-layout` | manage_roles | D (reset per tutti) |

### 3.11 Riepilogo

| Classe | Endpoint | Note |
|---|---|---|
| R | ~62 | tutte le letture utili |
| W | ~33 | incluse viste, bozze, cestino, layout |
| P | ~11 | publish, automazioni, inviti, settings globali |
| D | ~16 | schema distruttivo, purge, privilegi, delete media/automazioni |
| X | ~22 | auth, OAuth, password, segreti, interni |

Più le route custom (`/api/custom/*`) registrate dallo sviluppatore: non note a priori. Oggi
non sono raggiungibili con token OAuth (fail-closed). Un hook `customOperations` per dichiararle
nel catalog è un possibile follow-up, fuori dalla 2.0.

---

## 4. Architettura 2.0 — locale, a costo zero

### 4.1 Vincoli che guidano le scelte

1. **Caso d'uso principale:** un developer che programma un sito in locale con Claude Code nel
   repo, API su `pnpm beech dev` (`localhost:8787`).
2. **Costo zero da operare**, sia per il maintainer sia per chi sviluppa con BeechCMS (anche sul
   piano Workers Free). Nessun servizio ospitato.
3. **L'agente fa ciò che l'utente fa dalla dashboard**, entro il suo RBAC (§4.6).
4. **Conferma umana in chat** per le azioni distruttive e (in produzione) per le pubblicazioni.

Cosa è stato scartato e perché:

| Opzione | Motivo |
|---|---|
| Server remoto `/mcp` con Dynamic Worker Loader | Il Worker Loader è solo per Workers Paid (open beta); il piano Free ha 10 ms CPU e 50 subrequest per richiesta. Rimandato a fase opzionale (§4.8) |
| Sandbox locale (QuickJS/isolated-vm) | In locale non protegge niente: Claude Code ha già la shell e il token è su disco. Scrivere ed eseguire un file dà gli stessi benefici del Code Mode |
| Conferma via pagina web ogni volta | Troppa frizione. Resta solo come fallback per client senza elicitation |

### 4.2 Il flusso

```
1. agente scrive  .beech/scripts/pulizia.ts   (SDK `beech` tipizzato, tipi per-seed)
2. agente lancia  pnpm beech run pulizia --arg days=90
        │
        ▼
   SDK in @beechcms/cli ──OAuth (token CLI)──► API locale o remota
                                               auth → scope → RBAC → intent gate → handler
        │                                                          │
        │   read/write: eseguite                                   │ publish/destructive:
        ▼                                                          ▼ NON eseguite, salvate come intent
3. stdout: { result: { aggiornati: 38 }, pendingIntents: [{ id: "int_7f", summary: "Svuota cestino posts: 12 entry" }] }
4. agente chiama  beech_confirm({ intentIds: ["int_7f"] })   (tool MCP stdio)
5. Claude Code mostra il dialog (elicitation)  →  umano: Conferma
6. API riesegue lato server la richiesta salvata, una volta, e restituisce l'esito
```

Il "Code Mode" qui è il file: l'agente scrive un programma, lo esegue con un comando, legge
un riassunto. Lo script resta nel repo, si rilegge, si versiona, si riusa (pattern "skill"
dell'articolo Anthropic).

### 4.3 Componenti

| # | Componente | Dove | Cosa fa |
|---|---|---|---|
| 1 | **Operation Catalog** | `packages/core/src/operations/` | Metadati di tutte le 142 route: `id`, metodo, path, rischio, scope OAuth, esposizione, summary, link docs. Fonte unica per scope, intent gate, SDK, ricerca, test di parità |
| 2 | **Scope OAuth v2** | core + `apps/api/src/middleware/oauth-scope.middleware.ts` | L'allowlist a 5 route diventa una lookup sul catalog. Fail-closed invariato |
| 3 | **Agent Intents** | migration + repository + middleware + `apps/api/src/features/agent-intents/` | Blocca le richieste OAuth rischiose, le salva, le riesegue dopo l'approvazione |
| 4 | **SDK `beech`** | `packages/cli/src/sdk/`, export `@beechcms/cli/sdk` | Client tipizzato dell'API Admin per Node: metodi per dominio, generic sui tipi dei seed, helper (paginazione, upload, import, attesa job), dry-run |
| 5 | **`beech run`** | `packages/cli` + `bin/cli.mjs` | Esegue `.beech/scripts/*.ts` con l'SDK già autenticato. Stampa JSON con risultato, log e intent in attesa |
| 6 | **`@beechcms/mcp` 2.0** | `packages/mcp` | Tool piccoli: `beech_whoami`, `beech_search`, `beech_confirm`, `beech_intents`, docs, schema plan/apply |
| 7 | **`beech agent setup`** | `packages/cli` | Scrive `.mcp.json`, la skill e `.beech/scripts/README.md` nel progetto del sito |

### 4.4 Operation Catalog

Vive in `@beechcms/core` (che non può importare da `apps/*`): solo metadati, nessuno schema
Zod delle feature. La validazione resta negli handler.

```ts
export type OperationRisk = 'read' | 'write' | 'publish' | 'destructive'
export type OperationExposure = 'agent' | 'excluded'

export interface OperationSpec {
  id: string                         // 'content.bulkUpdate'
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string                       // '/api/content/:slug/bulk'
  summary: string
  scope: OAuthScope                  // 'content:write'
  risk: OperationRisk | ((req: { query: Record<string, string>; body: unknown }) => OperationRisk)
  exposure: OperationExposure
  excludedReason?: string            // obbligatorio se exposure = 'excluded'
  docs?: string                      // 'reference/internal-content.md#bulk-update'
}

export function matchOperation(method: string, path: string): OperationSpec | null
```

Il rischio può dipendere dalla richiesta:
- `DELETE /api/content/:slug/:id` → `write` (va nel cestino), `destructive` se `?purge=true`;
- `POST|PUT /api/content/:slug[/:id]` → `publish` se `body.status === 'published'`.

**Test di parità** in `apps/api`: ogni route di `createBeechApp().routes` corrisponde a
un'operazione del catalog (o è `/admin`), e ogni operazione corrisponde a una route reale. Se
qualcuno aggiunge un endpoint senza catalogarlo, la CI fallisce. È lo stesso principio
fail-closed dell'allowlist OAuth di oggi.

### 4.5 Agent Intents (conferma umana)

**Regola:** solo le richieste fatte con un **token OAuth** passano dall'intent gate. La
dashboard (JWT) non cambia: l'umano che clicca in dashboard ha già confermato.

**Policy per ambiente** (dalla variabile `ENV` già presente in `wrangler.jsonc`):

| `ENV` | Eseguite subito | Richiedono conferma |
|---|---|---|
| `development` | read, write, publish | destructive |
| `production` | read, write | publish, destructive |

**Middleware `agentIntentGate`**, montato in `apiProtected` dopo `permissionMiddleware`
(quindi crea un intent solo per richieste che l'utente avrebbe il diritto di fare):
1. `matchOperation()` → calcola il rischio, applica la policy.
2. Se serve conferma e manca l'header interno di replay: salva l'intent e risponde
   `202 { intent: { id, operationId, risk, summary, expiresAt } }` **senza eseguire**.
3. Se la richiesta è un replay interno di un intent approvato (marcatore nell'`env` di `app.fetch`,
   vedi decisioni sprint 05): verifica che utente, hash del payload e stato tornino, lascia passare;
   l'handler di approve registra `executed`/`failed`.

**Tabella** (migration `0046_agent_intents.sql`; la `0045` è dello sprint 04):

```sql
CREATE TABLE IF NOT EXISTS agent_intents (
  id            TEXT    PRIMARY KEY,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT    NOT NULL,
  operation_id  TEXT    NOT NULL,
  method        TEXT    NOT NULL,
  path          TEXT    NOT NULL,
  body          TEXT,
  body_hash     TEXT    NOT NULL,
  risk          TEXT    NOT NULL CHECK (risk IN ('publish', 'destructive')),
  summary       TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed', 'expired')),
  result_status INTEGER,
  result_body   TEXT,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  decided_at    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_intents_user_status ON agent_intents(user_id, status);
```

Accesso solo tramite `IAgentIntentRepository` (core) con `IClock`/`IIdGenerator` iniettati,
implementazione D1 + in-memory per i test.

**Endpoint** (`features/agent-intents`):

| Endpoint | Scope | Cosa fa |
|---|---|---|
| `GET /api/agent/intents` | `agent:read` | intent in attesa dell'utente |
| `GET /api/agent/intents/:id` | `agent:read` | dettaglio + anteprima |
| `POST /api/agent/intents/:id/approve` | `agent:approve` | riesegue lato server la richiesta salvata (una volta) e restituisce l'esito |
| `POST /api/agent/intents/:id/reject` | `agent:read` | rifiuta |

**Replay lato server**, non lato client: il client non può modificare ciò che è stato
approvato. L'handler di approve passa la richiesta salvata a `app.fetch` in-process (una
funzione `dispatch` esposta dal factory nel context) con l'identità dell'utente.

**Chi può approvare.** `agent:approve` viene concesso solo al client OAuth `beech-mcp` (il
server MCP che mostra il dialog), non a `beech-mcp-cli` (quello usato da `beech run` e dagli
script). Così l'SDK non ha nessun metodo né scope per auto-approvarsi.
Rischio residuo, da documentare: un agente che legge di proposito il token MCP da disco e
chiama l'endpoint a mano. La conferma protegge da errori e prompt injection, non da un agente
ostile con accesso completo alla shell. Ogni approve/reject finisce nell'activity log.

**Fallback senza elicitation** (Claude Desktop, client vecchi, bug noto di auto-decline in
Claude Code 2.1.144): sezione "Azioni agente in attesa" in dashboard con Approva/Rifiuta.
Non è il percorso normale.

### 4.6 Principio: "l'agente fa ciò che l'utente fa dalla dashboard"

```
permesso effettivo agente = scope OAuth concessi al consenso ∩ permessi RBAC dell'utente (per seed)
```

- Il token OAuth è legato a `userId` (`oauthGrant.userId`): ogni chiamata passa per
  `permissionMiddleware` come una richiesta della dashboard. Niente service account.
- `beech_search` e `beech_whoami` usano i permessi effettivi (`resolveEffectivePermissions`,
  già usato da `GET /api/settings/me`): l'agente vede solo le operazioni che può fare, e per i
  permessi seed-scoped solo i suoi seed.

**Developer vs utente qualsiasi.** BeechCMS non ha più un asse "developer": è stato sostituito
da `manage_seeds` (`packages/core/src/rbac/permissions.ts`). La 2.0 mantiene la scelta:

| Livello | Determina |
|---|---|
| RBAC (ruolo) | cosa l'utente può fare: un editor con `content:*` su `blog` non tocca schema né utenti; chi ha `manage_seeds` a `*` è di fatto developer |
| Template di consenso OAuth | quanto delega all'agente: **Lettura**, **Editor** (`content:*`, `media:*`), **Amministratore** (+ `users:*`, `settings:*`, `automations:*`), **Developer** (+ `schema:*`). Mai oltre l'RBAC |

**Eccezioni human-only** (escluse anche se l'utente le può fare in dashboard): password, cambio
email, sessioni, consensi OAuth, `rotate-field`, creazione account con password (solo inviti).

**Scope OAuth v2:** `schema:read` · `schema:write` · `content:read` · `content:write` ·
`content:delete` · `media:read` · `media:write` · `automations:read` · `automations:write` ·
`users:read` · `users:write` · `settings:read` · `settings:write` · `analytics:read` ·
`agent:read` · `agent:approve`. `schema:read`/`schema:write` restano compatibili con i token 1.x.
La distinzione publish/destructive non è uno scope: la gestisce l'intent gate.

### 4.7 SDK, `beech run` e MCP

**SDK `beech`** (modulo di `@beechcms/cli`, non un package nuovo)

`@beechcms/cli` è già installato in ogni progetto sito (lo usa il comando `beech` di
`@beechcms/cms`), e `@beechcms/api-client` è privato e già incluso nel bundle della CLI. L'SDK
serve solo a `beech run`: l'MCP non lo usa. Quindi vive in `packages/cli/src/sdk/` ed è
esportato come subpath `@beechcms/cli/sdk` (solo `defineScript` e tipi). A runtime l'istanza
`beech` già autenticata la passa `beech run` allo script.

```ts
import { defineScript } from '@beechcms/cli/sdk'
import type { SeedRegistryTypes } from '../../beech.generated'

export default defineScript<SeedRegistryTypes>(async (beech, { args, log }) => {
  const days = Number(args.days ?? 90)
  const cutoff = Date.now() - days * 864e5
  const posts = await beech.content.listAll('posts', {
    filters: [{ columnId: 'status', type: 'system', conditions: [{ op: 'eq', value: 'published' }] }],
  })
  const ids = posts.filter(p => Date.parse(p.updated_at) < cutoff).map(p => p.id)
  log(`trovati ${ids.length} post vecchi`)
  const res = await beech.content.bulkUpdate('posts', { ids, fields: { status: 'archived' } })
  return { archived: ids.length, sample: ids.slice(0, 5), res }
})
```

- Namespace per dominio: `seeds`, `schema`, `content`, `drafts`, `trash`, `views`, `media`,
  `search`, `widgets`, `automations`, `users`, `roles`, `invitations`, `settings`, `stats`,
  `notifications`, `layout`.
- Ogni metodo restituisce `T | IntentPending` (tipo discriminato): lo script sa se
  un'operazione è stata eseguita o aspetta conferma.
- Tipi per-seed dal `SeedRegistryTypes` che `beech types generate` produce già.
- Helper: `content.listAll` (paginazione con cap), `media.upload` (presign → PUT su storage →
  confirm, rispettando il vincolo "il Worker non riceve byte"), `content.importCsv` (upload +
  import + polling), `jobs.wait`.
- Trasporto: `@beechcms/api-client` (stesso OAuth PKCE, token store, retry, errori).
- Test di parità: ogni operazione `exposure: 'agent'` del catalog ha un metodo SDK.

**`beech run`**

```
pnpm beech run <nome|percorso> [--arg k=v ...] [--dry-run] [--json] [--out file.json]
```

- Cerca in `.beech/scripts/<nome>.ts`. Esegue TypeScript con il type stripping nativo di Node
  (≥ 22.18; il repo usa Node 26), senza dipendenze aggiuntive.
- `--dry-run`: l'SDK registra le scritture senza inviarle e stampa cosa farebbe.
- Output: `{ result, logs, pendingIntents, calls }`, troncato in console, completo con `--out`.
- Usa il client OAuth `beech-mcp-cli` (non può approvare intent).

**`@beechcms/mcp` 2.0** (stdio, piccolo)

| Tool | Annotation | Cosa fa |
|---|---|---|
| `beech_whoami` | readOnly | utente, ruoli, scope, permessi effettivi per seed, `ENV` e policy di conferma, versione schema |
| `beech_search` | readOnly | ricerca nel catalog (filtrata sui permessi) + docs; restituisce firma SDK, rischio, link docs. Livelli di dettaglio: nome / firma / completo |
| `beech_intents` | readOnly | intent in attesa |
| `beech_confirm` | destructive | `{ intentIds }` → un solo dialog di elicitation con tutte le azioni → approve/reject → esiti |
| `beech_docs_search` | readOnly | invariato |
| `beech_schema_*` | — | plan/validate/apply invariati (compatibilità 1.x); `planId` spostato lato server |
| `beech_mcp_status` / `reload` | — | invariati; versione presa da `package.json` |

### 4.8 Fase opzionale: server remoto

Per utenti non developer su claude.ai: `/mcp` remoto dentro il Worker, che riusa catalog,
intent gate e SDK. Richiede Workers Paid sull'account del proprietario del sito (Worker Loader
per un eventuale Code Mode, oppure solo tool classici senza sandbox). Richiede anche i metadata
OAuth `.well-known` e CIMD. Non fa parte della 2.0.

---

## 5. Sicurezza

| Rischio | Mitigazione |
|---|---|
| Agente oltre i permessi dell'utente | Ogni chiamata SDK passa per auth → scope → RBAC esistenti, fail-closed |
| Distruzione dati, escalation, pubblicazioni non volute | Intent gate lato server + conferma umana in chat; intent legato a utente e hash del payload, TTL 10 min, eseguito una volta |
| Auto-approvazione da script | `agent:approve` solo sul client MCP, mai sull'SDK |
| Prompt injection dai contenuti del CMS | La skill li tratta come dati non fidati; le azioni rischiose non partono senza dialog umano |
| Segreti nel contesto | `rotate-field` escluso; campi confidential redatti di default nei risultati SDK |
| Endpoint nuovo non classificato | Test di parità catalog ↔ route in CI |
| Audit | Ogni intent creato, approvato, rifiutato o eseguito → activity log (utente, client OAuth, operazione, esito) |

---

## 6. Piano di rilascio (sprint)

Ogni sprint segue la pipeline a 4 stadi (`stages/`): lo stage 01 pianifica in dettaglio solo il
prossimo sprint `PENDING` di questa tabella, poi `pnpm pipeline next` archivia e si passa al
successivo.

| # | Sprint | Stato | Deliverable | Accettazione |
|:-:|---|---|---|---|
| 03 | **OperationCatalog** | DONE | `packages/core/src/operations/` con le 142 operazioni; `matchOperation()`; test di parità in `apps/api` | CI fallisce se una route non è catalogata o un'operazione non esiste; ogni `excluded` ha un motivo |
| 04 | **OAuthScopesV2** | DONE | scope v2 in core (`OAUTH_SCOPES` = `OPERATION_SCOPES` del catalog); `oauth-scope.middleware` legge dal catalog; rimuove il ramo morto `kanban-position` da `PROTECTED_ROUTES`; migration che aggiorna `oauth_clients.allowed_scopes`; template di consenso in dashboard | Token `content:read` non scrive; un token più largo dell'RBAC resta limitato dall'RBAC; token 1.x `schema:*` continuano a funzionare |
| 05 | **AgentIntents** | DONE | scope `agent:read`/`agent:approve`; migration `0046_agent_intents` (+ `allowed_scopes`); rimozione del guard interim `confirmation_required` dello sprint 04; repository; middleware `agentIntentGate`; endpoint `/api/agent/intents`; replay lato server; activity log | Nessuna `destructive` eseguita con token OAuth senza approve; intent scaduto, riusato o di un altro utente rifiutato; policy dev/prod rispettata; JWT dashboard invariato |
| 05b | **AgentIntentsDashboard** | DONE | sezione dashboard "Azioni agente in attesa" (lista, anteprima, Approva/Rifiuta via JWT); etichette activity log per `intent` | Un intent creato da un token OAuth si approva o rifiuta dalla dashboard; design-token check pulito; 5 locale |
| 06 | **ScriptSdk** | PLANNED | SDK `beech` in `packages/cli/src/sdk/` + export `@beechcms/cli/sdk`: metodi per tutte le operazioni `agent`, tipi per-seed, `IntentPending`, helper, dry-run | Test di parità SDK ↔ catalog; test helper (upload, import, paginazione) contro D1 di test |
| 07 | **BeechRun** | PENDING | `beech run`, `defineScript`, `.beech/scripts`, `beech agent setup` | Script d'esempio gira contro `pnpm beech dev`; `--dry-run` non scrive niente; output JSON stabile |
| 08 | **Mcp2** | PENDING | `@beechcms/mcp@2.0.0`: whoami/search/intents/confirm con elicitation, fallback dashboard, versione corretta, SKILL.md riscritto | In Claude Code un intent viene approvato da dialog; con elicitation rifiutata o non supportata, l'agente riceve l'istruzione di fallback |
| 09 | **DocsEvals** | PENDING | `docs/reference/mcp-server.md`, guida "agente in locale", suite di task v1 vs v2 | Report su turni, token e successo per task |

Dipendenze: 03 → 04 → 05 → 05b → 08; 06 parte dopo 03; 07 dopo 06; 09 dopo 07 e 08.

---

## 7. Decisioni

| # | Tema | Stato |
|---|---|---|
| 1 | Remoto vs locale | **Deciso: locale.** SDK + `beech run` + MCP stdio piccolo. Remoto in fase opzionale (§4.8) |
| 2 | Conferma per publish | **Deciso: sì**, in produzione; in `development` solo il distruttivo |
| 3 | Creazione utenti | **Deciso: solo inviti** |
| 4 | Sandbox locale | **Deciso: no** (§4.1) |
| 5 | Canale di conferma | **Deciso: chat (elicitation)**, dashboard solo come fallback |
| 6 | SDK scritto a mano vs generato | **Deciso: a mano**, verificato da test di parità con il catalog |
| 7 | Replay lato server vs lato client | **Deciso: lato server** |
| 8 | API pubblica (`/api/v1/public`) nell'SDK | Proposto: rimandare |
| 9 | Nuovo package per l'SDK | **Deciso: no.** Modulo di `@beechcms/cli` (`@beechcms/cli/sdk`) |
| 10 | Accorpare `@beechcms/mcp` in `@beechcms/cli` come `beech mcp` | **Deciso: no**, `@beechcms/mcp` resta un package separato |

---

## 8. Fonti

- Cloudflare — [Code Mode: give agents an entire API in 1,000 tokens](https://blog.cloudflare.com/code-mode-mcp/)
- Cloudflare — [Code Mode: the better way to use MCP](https://blog.cloudflare.com/code-mode/)
- Cloudflare — [Build a Code Mode MCP server](https://developers.cloudflare.com/agents/model-context-protocol/guides/build-codemode-mcp-server/)
- Cloudflare — [Code Mode API reference](https://developers.cloudflare.com/agents/tools/codemode/api-reference/)
- Cloudflare — [cloudflare/mcp AGENTS.md](https://github.com/cloudflare/mcp/blob/main/AGENTS.md)
- Anthropic — [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- MCP — [Changelog 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog) · [Changelog 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/changelog) · [Tasks extension](https://modelcontextprotocol.io/extensions/tasks/overview.md) · [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview.md)
- Executor Node — [TanStack AI Code Mode isolates](https://tanstack.com/ai/latest/docs/code-mode/code-mode-isolates) · [OpenClaw executors](https://docs.openclaw.ai/tools/code-mode/executors)
