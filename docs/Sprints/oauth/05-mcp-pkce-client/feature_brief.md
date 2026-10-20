# 1. Feature Definition and Core Value

Il pacchetto `packages/mcp` autentica oggi passando `BEECH_EMAIL` / `BEECH_PASSWORD` in chiaro via variabili d'ambiente al client MCP, che li scambia per un JWT bearer con privilegi admin completi su `/auth/login`. Questo espone tre problemi concreti: la password dell'account admin risiede in chiaro nella configurazione del client MCP (es. `claude_desktop_config.json`, `.env`); non esiste scoping dei permessi, quindi chi possiede il token ha accesso identico all'utente admin; non esiste revoca granulare, l'unico modo per invalidare l'accesso di un client è cambiare la password dell'intero account.

La feature introduce un authorization server OAuth 2.1 (authorization code + PKCE) sopra l'infrastruttura di autenticazione JWT esistente. Il client MCP non vede mai più la password: apre un browser di sistema, l'utente si autentica direttamente su BeechCMS, concede scope specifici tramite consent screen, e il client riceve un access/refresh token scoped e revocabile indipendentemente dalla password dell'account.

Il valore è duplice: elimina l'esposizione di credenziali admin in chiaro per il caso d'uso MCP, e costruisce un authorization server riusabile per ogni futuro consumer esterno (dashboard integrazioni, API pubblica partner, CLI, app mobile, altri agent AI) senza dover ripetere il lavoro.

# 2. Domain Boundaries and Business Rules

**Entità logiche coinvolte:**

- **Client** (es. `packages/mcp`) — richiede scope specifici, non conosce mai la password dell'utente, riceve solo authorization code e token.
- **Resource Owner** (l'utente con credenziali Beech, oggi principalmente lo sviluppatore) — autentica sé stesso, concede o nega scope tramite consent screen.
- **Authorization Server** (nuovo layer in `apps/api`, endpoint `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`) — valida PKCE, genera authorization code, emette access/refresh token scoped, gestisce revoca.
- **Resource Server** (API BeechCMS esistente) — valida i token scoped su ogni endpoint protetto, in aggiunta al JWT admin esistente.
- **Role Guard** (interfaccia astratta, stub oggi) — arbitra quali scope un ruolo utente può concedere; oggi ritorna sempre consenso (esiste solo ruolo admin), pensata per essere sostituita da un adapter reale quando il sistema di ruoli sarà introdotto.

**Regole ferree (business rules):**

1. `/auth/login` resta invariato ed è riservato al login umano via dashboard. `/oauth/authorize` è un layer superiore: se l'utente non è già autenticato, redirige al login esistente; solo dopo genera un authorization code — non un token diretto.
2. Il flusso OAuth non deve mai emettere token con privilegi superiori a quelli del `resource owner` che ha effettuato il consent.
3. Authorization code, access token e refresh token vengono salvati in D1 sempre come hash (mai plaintext), replicando esattamente il pattern già in uso in `sessionRepository.saveRefreshToken`.
4. Il layer OAuth non deve mai contenere logica di autorizzazione basata su ruoli. Ogni decisione "questo ruolo può concedere questo scope" passa esclusivamente attraverso l'interfaccia `Role Guard`, cosicché l'introduzione futura di ruoli reali non richieda modifiche a `/oauth/authorize` o `/oauth/token`.
5. Gli scope OAuth sono definiti 1:1 sui tool MCP esposti oggi, non su ipotesi future:
   - `schema:read` → `beech_list_seeds`, `beech_get_seed`, `beech_schema_export`, `beech_schema_validate`, `beech_schema_plan` (dry-run, nessuna mutazione).
   - `schema:write` → `beech_schema_apply` (unico tool che muta lo stato).
6. Il rate-limiting su `/oauth/token` (scambio code→token) è obbligatorio fin dal primo rilascio, riusando `dual-key-rate-limiter` esistente — nessuna eccezione per ambienti locali, perché `BEECH_API_URL` è già configurabile verso istanze remote.

# 3. Primary Requirements (User Stories)

* AS A sviluppatore che usa il client MCP AS A l'utente Beech I WANT autenticarmi tramite browser di sistema invece di inserire email/password in chiaro nella config del client SO THAT la mia password admin non risiede mai in un file di configurazione o variabile d'ambiente del client MCP
* AS A utente Beech I WANT vedere una consent screen che mostra quale client richiede accesso e con quali scope prima di autorizzarlo SO THAT ho controllo esplicito su cosa ogni client esterno può fare per mio conto
* AS A utente Beech I WANT poter revocare l'accesso di un client OAuth specifico senza cambiare la mia password SO THAT posso invalidare un client compromesso o non più necessario senza impatto sugli altri client autorizzati
* AS A client MCP I WANT ricevere un token scoped alle sole operazioni che mi servono (lettura schema o scrittura schema) SO THAT un eventuale leak del mio token non espone privilegi amministrativi completi
* AS A client MCP I WANT un refresh automatico del token in scadenza SO THAT non devo richiedere all'utente di ripetere il consent ad ogni sessione

# 4. Secondary Requirements and Logical Constraints

- **Token scaduto durante operazione lunga:** se l'access token scade a metà di una sequenza di chiamate MCP (es. `schema_plan` seguito da `schema_apply`), il client deve rifare refresh trasparente senza perdere lo stato del piano generato — il piano stesso non è legato al token che lo ha creato.
- **Authorization code monouso:** un code riutilizzato (replay) deve invalidare immediatamente tutti i token già emessi da quel code, non solo rifiutare la seconda richiesta — mitigazione standard OAuth 2.1 contro code interception.
- **PKCE obbligatorio, non opzionale:** anche se il client MCP è "confidential" in alcuni contesti, PKCE va richiesto sempre, per non lasciare una configurazione debole di fallback.
- **Consent già dato (re-auth silenziosa):** se un client ha già ottenuto consent per un set di scope e li richiede identici in una sessione successiva, il flusso può saltare la consent screen (skip UX ripetitiva) — ma se richiede scope aggiuntivi rispetto al consent precedente, la consent screen deve ripresentarsi limitata ai soli nuovi scope.
- **Revoca a cascata:** revocare un client dalla pagina "app connesse" deve invalidare sia access token attivo sia refresh token associato, non uno dei due.
- **Role Guard non ancora vincolante:** finché il sistema di ruoli non esiste, il Role Guard concede sempre tutti gli scope richiesti — questo comportamento deve essere esplicito e testato, non un default implicito, perché cambierà comportamento quando l'adapter reale arriverà.
- **Fallback di rete già coperto:** gli errori di connessione (`ECONNREFUSED`, unreachable API) già gestiti in `client.ts` restano validi; il nuovo flusso PKCE aggiunge solo la gestione di un listener locale per il redirect, che deve avere timeout esplicito se l'utente non completa il consent nel browser.
- **Scoping di `beech_schema_plan`:** essendo dry-run, è classificato sotto `schema:read` — questa scelta deve essere documentata nel codice/API perché non ovvia a prima vista (il nome suggerisce un'azione, ma non muta stato).
- **UI consent screen e pagina "app connesse":** costruite riusando i componenti shadcn/ui già presenti in `apps/dashboard/src/components/ui/` (es. `card`, `alert-dialog`/`confirm-dialog`, `data-table` per la lista client autorizzati, `sheet`, `tabs`, `field`) — nessun componente custom o libreria UI alternativa, coerenza visiva e di codice con il resto della dashboard.

# 5. Out of Scope (Discarded during sparring)

- **API key statica scoped come alternativa completa a OAuth:** scartata esplicitamente — coprirebbe il bisogno con una frazione del lavoro, ma non risponde al requisito "production-ready" in vista dell'introduzione di ruoli e di consumer esterni multipli.
- **Role-Based Access Control reale nel consent flow:** il sistema di ruoli non esiste ancora. Il Role Guard è costruito come interfaccia stub oggi; l'adapter con logica reale è deliberatamente rimandato a quando i ruoli saranno introdotti come feature a sé stante.
- **Consent multi-tenant / gestione organizzazioni:** oggi esiste un solo resource owner reale (l'admin/sviluppatore). Flussi di delega multi-utente o organizzazioni sono fuori perimetro.
- **Scope granulari oltre `schema:read` / `schema:write`:** nessuno scope aggiuntivo (es. per singole tabelle di contenuto, per operazioni di rete/deploy) viene introdotto ora — si mappa strettamente sui 6 tool MCP esistenti.
