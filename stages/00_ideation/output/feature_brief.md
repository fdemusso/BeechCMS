# 1. Feature Definition and Core Value

Oggi un progetto creato con `npx @beechcms/cms` (0.10.x) ha tre difetti collegati, tutti nel flusso di primo avvio e nel modello di accesso alla Public API (issue #995, #996, #997):

1. **Segreti pubblicati.** Il token che firma le sessioni (`JWT_SECRET`), la chiave di scrittura e il segreto anti-bot finiscono in `wrangler.jsonc`, file che si committa. Chi pubblica il progetto su un host git espone quei valori fin dal primo commit. In Cloudflare le `vars` sono testo in chiaro, non segreti.
2. **Primo avvio rotto.** Tutte le guide indicano una chiave locale (`dev-read-key-changeme`) che lo scaffold non genera. La prima richiesta documentata risponde 401.
3. **Client server incapace di leggere e scrivere.** La Public API richiede una chiave per le letture e un'altra per le scritture. `createBeechServerClient` ne accetta una sola, quindi nessuna istanza può fare entrambe le cose.

La feature sostituisce il modello a due chiavi per metodo con un **modello a due ruoli di chiave**, stile Stripe/Supabase:

* **Publishable key**: pubblica per costruzione, solo lettura, usabile nel browser.
* **Secret key**: privata, accesso completo (lettura e scrittura), usabile solo lato server.

In locale entrambe hanno un valore fisso e noto, così guide e curl funzionano al primo tentativo. In produzione i valori sono generati e i segreti stanno solo nel secret store di Cloudflare.

**Decisione di prodotto: nessuna compatibilità legacy.** I vecchi nomi (`PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY`, `dev-read-key-changeme`, `apiKey` nel client) vengono rimossi, non deprecati. Chi sta alla 0.10.1 viene portato al nuovo modello da un comando di migrazione esplicito, non da un doppio supporto nel runtime.

# 2. Domain Boundaries and Business Rules

## Entità e responsabilità

| Entità | Responsabilità | Non deve |
|---|---|---|
| **Scaffolder** (`bin/`) | Genera un progetto nuovo: decide cosa va in `wrangler.jsonc` (pubblico, committato) e cosa in `.dev.vars` (privato, ignorato da git). | Scrivere segreti in file committati. |
| **Public API, autenticazione** (`apps/api`, middleware e handler pubblici) | Riconosce il ruolo della chiave presentata (secret, publishable, nessuna/errata) e decide se il metodo HTTP è consentito. | Avere due implementazioni separate della stessa decisione (middleware e handler di scrittura usano la stessa risoluzione). |
| **Client SDK** (`packages/client`) | Offre un client browser (solo lettura, publishable key) e un client server (lettura e scrittura, secret key). | Permettere di costruire un client browser con una secret key, o di scrivere da un client solo-lettura. |
| **CLI** (`packages/cli`) | Mostra le chiavi rilevate al `init`; esegue la migrazione dei progetti 0.10.x. | Stampare in chiaro una secret key. |
| **Documentazione** (`docs/`, copie in `packages/mcp/resources/`) | Descrive il modello a due ruoli e i valori locali. | Citare nomi o valori di chiavi che il codice non riconosce. |
| **Seed** (policy `allowPublicRead`, `allowPublicPost`) | Resta l'autorità su quali dati sono esposti. | Essere aggirato dalla chiave: la chiave autentica, il seed autorizza. |

## Regole inderogabili

1. **Una chiave, un ruolo.** La publishable key autorizza solo `GET`, `HEAD`, `OPTIONS`. La secret key autorizza tutti i metodi. Nessuna altra combinazione.
2. **I segreti non stanno mai in un file committato.** `JWT_SECRET`, la secret key, il segreto anti-bot e `PRIVACY_MASTER_KEY` vivono solo in `.dev.vars` in locale e nel secret store (`wrangler secret put`) in produzione. In `wrangler.jsonc` `vars` restano solo configurazione non sensibile e la publishable key.
3. **Valori locali deterministici.** Publishable key locale `beech_pk_dev`, secret key locale `beech_sk_dev`. In produzione i valori sono generati, con prefisso `beech_pk_live_` e `beech_sk_live_`.
4. **Nessun comportamento speciale per l'ambiente nel confronto.** Il middleware confronta la chiave ricevuta con quella configurata, e basta. Non esiste "accetta `beech_pk_dev` se `ENV=development`".
5. **Guardia contro il deploy accidentale.** La secret key locale è nota a chiunque legga la documentazione. Se l'ambiente non è `development` e la secret key configurata è `beech_sk_dev`, ogni richiesta autenticata con quella chiave viene rifiutata (403) e il worker registra un avviso a ogni richiesta rifiutata. La publishable key locale non ha guardia: è pubblica per definizione.
6. **Fail closed.** Se la secret key non è configurata, la scrittura risponde 403. Una publishable key usata per un metodo di scrittura risponde 403 con messaggio che indica il ruolo mancante. Una chiave errata risponde 401.
7. **Rotazione non distruttiva.** `PRIVACY_MASTER_KEY` non viene mai rigenerata né sovrascritta da nessuna parte della feature (renderebbe illeggibili i campi protetti già salvati).
8. **Percorsi senza chiave invariati.** Health, token anti-bot, schema pubblico e invio form pubblico restano senza chiave, come oggi.
9. **Nessun supporto legacy.** Il runtime non legge `PUBLIC_READ_API_KEY` né `PUBLIC_WRITE_API_KEY`, e il client non accetta `apiKey`. Una configurazione che li usa fallisce in modo esplicito e comprensibile (vedi sezione 4).

# 3. Primary Requirements (User Stories)

* AS A sviluppatore che crea un progetto con `npx @beechcms/cms` I WANT che nessun segreto finisca nei file committati SO THAT pubblicare il repository non espone chiavi di firma, chiavi di scrittura o segreti anti-bot.
* AS A sviluppatore che segue una guida framework appena dopo lo scaffold I WANT che la chiave locale documentata funzioni al primo tentativo SO THAT la prima richiesta alla Public API risponde 200 e non 401.
* AS A sviluppatore backend (Server Action, script, route handler) I WANT una sola istanza di client server con una sola chiave che legge e scrive SO THAT non devo gestire due client e due chiavi per lo stesso servizio.
* AS A sviluppatore frontend I WANT un client browser che accetta solo la publishable key e non espone operazioni di scrittura SO THAT il codice che arriva nel browser non può contenere né usare un segreto.
* AS A proprietario di un deploy in produzione I WANT che le chiavi di produzione siano generate e impostate come secret (`wrangler secret put`), e che una secret key di sviluppo sia rifiutata fuori da `development` SO THAT un deploy dimenticato con i valori locali non dà scrittura a chiunque.
* AS A utente di un progetto creato con 0.10.x I WANT un comando di migrazione unico e ripetibile SO THAT porto il mio progetto al nuovo modello, tolgo i segreti dai file committati e so quali valori devo ruotare, senza che il runtime continui a supportare i vecchi nomi.
* AS A sviluppatore (o assistente AI) che legge la documentazione I WANT che ogni guida e ogni esempio usino solo nomi e valori riconosciuti dal codice SO THAT niente di quanto scritto produce un errore di autenticazione inatteso.

# 4. Secondary Requirements and Logical Constraints

## Scaffolder (progetto nuovo)
* `wrangler.jsonc` `vars` contiene solo: ambiente, origini CORS, `APP_URL`, publishable key (`beech_pk_dev`).
* `.dev.vars` contiene: `JWT_SECRET` (casuale), secret key (`beech_sk_dev`), segreto anti-bot (casuale), `PRIVACY_MASTER_KEY` (casuale, come oggi) e, se presenti, le credenziali R2.
* `.dev.vars` resta nel `.gitignore` generato; `wrangler.jsonc` resta committato.
* Il primo commit creato dallo scaffolder non deve contenere nessuno dei valori segreti. Va coperto da un test che scaffolda e controlla il contenuto del primo commit.
* Il riepilogo finale dello scaffolder non stampa la secret key; indica dove trovarla e come impostare i segreti in produzione.

## Autenticazione API
* La stessa risoluzione del ruolo serve sia il middleware sia l'handler di scrittura pubblica; non devono poter divergere.
* La risposta alle scritture con publishable key dice esplicitamente che serve una secret key.
* Il confronto resta a tempo costante, come oggi.
* Le richieste con chiave valida passano comunque dalle policy del seed: la secret key non scavalca `allowPublicRead` / `allowPublicPost`.
* Il rifiuto della secret key di sviluppo fuori da `development` produce un log con una sola riga stabile, ma senza mai stampare il valore della chiave.

## Client SDK
* Client browser: configurazione `{ baseUrl, publishableKey }`, solo lettura. Chiamare `create` o `update` su di esso è un errore di tipo (compile time), non solo a runtime.
* Client server: configurazione `{ baseUrl, secretKey }`, lettura e scrittura con la stessa istanza.
* Il parametro `apiKey` viene rimosso. Passarlo, o omettere la chiave richiesta, produce un errore di configurazione che nomina il parametro corretto.
* Un test di integrazione verifica che una singola istanza server esegua `list`, `first` e `create` con la stessa chiave.
* Se la secret key viene passata al client browser (per errore), il client rifiuta di costruirsi quando riconosce il prefisso `beech_sk_`.

## Migrazione dei progetti 0.10.x
* Un solo comando CLI, idempotente: lanciarlo due volte non cambia il risultato della prima.
* Cosa fa: sposta `JWT_SECRET` e il segreto anti-bot da `wrangler.jsonc` a `.dev.vars`; sostituisce le due chiavi con publishable (`beech_pk_dev`) e secret (`beech_sk_dev`); non tocca mai `PRIVACY_MASTER_KEY`.
* **Rotazione dei segreti già esposti.** Poiché i vecchi valori sono già nella history git, la migrazione genera nuovi `JWT_SECRET` e segreto anti-bot invece di copiare quelli vecchi, e avvisa che i valori precedenti vanno considerati compromessi. Conseguenza dichiarata all'utente: le sessioni attive vengono invalidate.
* Stampa i comandi di produzione da eseguire a mano (`wrangler secret put ...`), perché la CLI non deve scrivere nel secret store di produzione senza richiesta esplicita.
* Se `wrangler.jsonc` o `.dev.vars` non esistono o non sono leggibili, il comando si ferma senza modificare nulla e spiega cosa manca.
* Il comando segnala che la history git del progetto contiene ancora i vecchi valori e che solo la rotazione, non la riscrittura della history, li rende innocui.
* Il comando non riscrive la history git.

## Documentazione
* Tutte le guide framework, `first-project.md`, `public-api.md`, `client-sdk.md` e `environments.md` usano solo `beech_pk_dev`, `beech_sk_dev` e il modello a due ruoli.
* Le copie sotto `packages/mcp/resources/` restano allineate alle fonti.
* `client-sdk.md` contiene la tabella dei ruoli (chi può cosa, dove si usa) e l'avvertenza sull'uso della secret key nel browser.
* Il changelog contiene una sezione "Aggiornare da 0.10.x" con il comando di migrazione e l'avviso di rotazione.

## Test e verifica
* Middleware: secret su lettura e scrittura; publishable su lettura (ok) e scrittura (403); chiave errata (401); secret key non configurata (403); guardia della chiave di sviluppo fuori da `development`; nomi legacy non più riconosciuti.
* Scaffold fresco, avviato con `npm run dev`: lettura con `beech_pk_dev` risponde 200; scrittura con `beech_sk_dev` riesce; scrittura con `beech_pk_dev` risponde 403.
* La scrittura con secret key richiede ancora che il seed abbia `allowPublicPost` (comportamento esistente, vedi sezione 5).

# 5. Out of Scope (Discarded during sparring)

* **Compatibilità con i nomi legacy** (`PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY`, `dev-read-key-changeme`, `apiKey` nel client): scartata per decisione di prodotto. Sostituita dalla migrazione una tantum.
* **Interruttore "accetta la chiave di sviluppo se `ENV=development`" nel middleware**: scartato. Lo scaffold scrive già `ENV=development` nelle `vars`, quindi un deploy senza modifiche lo manterrebbe. Sostituito dalla regola di configurazione deterministica più la guardia sulla sola secret key (regole 4 e 5).
* **Riscrittura della history git** dei progetti già pubblicati: scartata. Rischiosa, non reversibile, e inutile se i valori vengono ruotati.
* **Scrittura automatica dei segreti nel secret store di produzione** da parte della CLI: scartata. La CLI stampa i comandi; l'utente li esegue.
* **Più chiavi per progetto, scope per seed, scadenza o revoca delle chiavi, gestione chiavi dal dashboard**: scartate. Due ruoli fissi bastano per il problema; un sistema di chiavi gestibili è una feature separata.
* **Rate limit o quota per chiave**: fuori scope.
* **Separare "questa chiave può scrivere" da "i visitatori anonimi possono inviare" (`allowPublicPost`), e il default `published` degli invii anonimi (#1022)**: fuori scope. Resta aperta come issue autonoma; questa feature la cita come limite noto: `create()` con secret key richiede ancora `allowPublicPost` sul seed.
* **Cambiare l'anti-bot Time-Trap o renderne segreto l'endpoint del token**: fuori scope; si sposta solo il segreto HMAC in `.dev.vars`.
* **Segnalazione automatica delle chiavi in CI (secret scanning) o hook pre-commit**: scartata come strumento aggiuntivo; la regola è risolta alla fonte, non intercettata dopo.
* **Prefissi `beech_pk_live_` / `beech_sk_live_` obbligatori e validati dal runtime**: scartati come controllo. Il prefisso è una convenzione di generazione e leggibilità, non un vincolo applicato.
