# 1. Feature Definition and Core Value

La gestione della privacy dei dati e la sicurezza dei form pubblici in BeechCMS soffrono attualmente di una frammentazione delle policy (`privacy`, `visibility`, `public`), esponendo il sistema a potenziali Data Leak di dati sensibili (PII) e richiedendo agli sviluppatori integrazioni manuali complesse e noiose per la protezione dallo spam.

La soluzione consiste in un'architettura integrata a due livelli:
1. **Core Data Classification System**: Un sistema centrale a 4 livelli (`Public`, `Internal`, `Confidential`, `Restricted`) integrato nella dichiarazione dei `Seed`, che gestisce automaticamente la cifratura a riposo (AES-256-GCM per `Confidential`, Bcrypt per `Restricted`) e il filtraggio/mascheramento nelle API Hono.
2. **Secure Form Toolkit (`@beechcms/forms-react`)**: Un pacchetto React zero-boilerplate che fornisce una difesa Anti-Bot a 5 livelli invisibile per l'utente umano (senza CAPTCHA bloccanti), una pipeline sicura per allegati e funzionalità native di salvataggio bozze e logica condizionale.

La combinazione di questi due pilastri garantisce sicurezza by-design sul backend e una Developer Experience (DX) immediata sul frontend per la creazione di form di contatto e lead generation privi di spam.

---

# 2. Domain Boundaries and Business Rules

## Entità di Dominio Coinvolte
* **Botanical Engine (`Seed` e `Branch`)**: Contiene le definizioni degli schemi di contenuto e ospita la dichiarazione delle policy di riservatezza sui singoli campi (`Branch.classification`).
* **Privacy Service (`PrivacyService`)**: Servizio globale del core delegato ad eseguire le operazioni di cifratura simmetrica (AES-256-GCM via Web Crypto API) e di hashing (Bcrypt via `HashProvider`) prima della persistenza nel database.
* **Public Form API Layer (`apps/api` Hono Endpoints)**: Layer di ingressi pubblici (`POST /api/v1/public/:seed/add`) responsabile dell'applicazione dei controlli anti-bot, della verifica dei Magic Bytes degli allegati, del rate limiting all'edge e della sanitizzazione dell'output.
* **Form React SDK (`@beechcms/forms-react`)**: Libreria UI client-side responsabile del rendering dinamico basato su schema `Seed`, della generazione dei token temporali, della trappola mimetizzata, del salvataggio bozze in `localStorage` e dell'i18n.
* **Antivirus Provider (`AntivirusProvider`)**: Interfaccia asincrona per la scansione antivirus degli allegati caricati, fornita con un adattatore nativo per **VirusTotal API**.

## Regole di Dominio Tassative
* **Default Deny nelle API Pubbliche**: I campi contrassegnati come `Internal`, `Confidential` e `Restricted` vengono rimosse automaticamente da qualsiasi risposta JSON generata da endpoint pubblici.
* **Zero Decryption su Liste Admin**: Nelle API di elenco/tabella (Admin list views), i campi `Confidential` non vengono mai decifrati dal database per ragioni di performance. Vengono restituiti esclusivamente in formato mascherato (es. `j***@email.com`). La decifratura in chiaro avviene solo nelle chiamate di dettaglio singolo e previa verifica delle autorizzazioni dell'utente autenticato.
* **Confine Netto Transit vs Storage**: La protezione del dato in transito (dal browser al server) è delegata interamente al protocollo HTTPS/TLS. Nessuna cifratura custom viene eseguita nel browser client dall'SDK. La cifratura a riposo e l'hashing avvengono esclusivamente lato server prima della scrittura nel database D1/SQLite.
* **Controlled Rejection per Anti-Bot**: Quando una sottomissione fallisce le regole anti-bot (Time Trap o Honeypot), il server risponde con errori HTTP espliciti (`400 Bad Request` o `422 Unprocessable Entity`) e log di sicurezza, evitando risposte fittizie `200 OK` che potrebbero causare la perdita silenziosa di sottomissioni da parte di utenti umani reali.
* **Ispezione Sincrona Allegati (Magic Bytes)**: Tutti i file caricati nei form subiscono la verifica bloccante dei Magic Bytes (< 5ms) lato server prima di qualsiasi accettazione; file con estensioni falsificate vengono rifiutati immediatamente.

---

# 3. Primary Requirements (User Stories)

* AS A Schema Author (Sviluppatore) I WANT dichiarare il livello di classificazione dei dati direttamente sulle definizioni dei campi del Seed SO THAT la cifratura a riposo e le regole di esposizione API vengano applicate automaticamente dal sistema senza codice custom.
* AS A Frontend Developer I WANT utilizzare il componente `<BeechForm seed="leads" />` dal pacchetto `@beechcms/forms-react` SO THAT possa montare in un sito web un form di contatto completamente accessibile, responsive e protetto da spam in 2 minuti.
* AS A Form Visitor I WANT inviare una richiesta di contatto senza dover risolvere fastidiosi puzzle o reCAPTCHA visuali SO THAT possa completare l'invio del form senza attrito o interruzioni.
* AS A Content Manager / Admin I WANT visualizzare i dati PII dei clienti mascherati nelle liste generali e in chiaro solo nella pagina di dettaglio SO THAT la riservatezza dei dati sia garantita durante la navigazione quotidiana nel pannello di controllo.
* AS A System Administrator I WANT definire un periodo di conservazione dei dati (`retentionDays`) nella configurazione del Seed SO THAT l'applicazione possa eliminare o anonimizzare automaticamente i record obsoleti in conformità al GDPR.

---

# 4. Secondary Requirements and Logical Constraints

## Anti-Bot & Protezione Sottomissioni
* **Camouflage Honeypot**: L'SDK inietta un campo di testo esca avente un nome realistico e non associabile ad autocompilatori standard (es. `fax_number`), configurato con `tabIndex={-1}`, `aria-hidden="true"`, `autoComplete="off"` e posizionato fuori dallo schermo tramite CSS (`-left-[9999px]`).
* **Time Trap (Timestamp Delta)**: Al montaggio del form viene generato un token crittografico contenente il timestamp iniziale ($t_0$). Il backend rifiuta sottomissioni se il delta di compilazione è inferiore a 1.5 secondi ($\Delta t < 1.5\text{s}$).
* **Edge Rate Limiting**: L'endpoint pubblico applica un limite massimo di 5 sottomissioni ogni 5 minuti per singolo indirizzo IP (tracciato via header `cf-connecting-ip`).
* **Strict Origin Check**: Rifiuto immediato (`403 Forbidden`) per richieste provenienti da domini non presenti nella whitelist di `Allowed Origins`.

## Pipeline Allegati e Quarantena Antivirus
* **Validazione Sincrona Intestazione**: Controllo dei primi 16 byte del file (Magic Bytes) per verificare la corrispondenza con il MIME type dichiarato (`.pdf`, `.jpg`, `.png`). Violazioni causano un rifiuto `400 Bad Request`.
* **Architettura Antivirus Pluggabile**: Implementazione dell'interfaccia `AntivirusProvider` con adattatore VirusTotal nativo.
* **Esecuzione Asincrona all'Edge**: Se la chiave API di VirusTotal è configurata, l'allegato caricato in `r2://quarantine/` viene verificato via `c.executionCtx.waitUntil()`. Se il file risulta infetto, viene rimosso da R2, marcato come `infected` ed inviata una notifica di errore alla dashboard Admin. Se la chiave non è configurata, il file viene promosso direttamente a `clean` dopo il controllo Magic Bytes.

## Micro-DX e Ripristino Bozze
* **LocalDraft Recovery**: Salvataggio automatico in tempo reale dei valori digitati in `localStorage` sotto la chiave `beech_form_draft_<seed>`. La bozza viene rimossa al ripristino o al completamento con successo dell'invio.
* **Logica Condizionale (`dependsOn`)**: Supporto alla dichiarazione di visibilità dinamica dei campi basata sul valore di altri rami dello stesso Seed.
* **i18n Nativo**: Messaggi di errore e label predefinite in Italiano (default) ed Inglese, sovrascrivibili via props.

---

# 5. Out of Scope (Discarded during sparring)

* **Blind Indexing (Colonne Hash SHA-256 per ricerche su campi cifrati)**: Scartato in quanto BeechCMS non funge da Identity Provider per utenti finali e gestisce unicamente form di contatto/lead. I campi `Confidential` sono unicamente cifrati a riposo e decifrati nel dettaglio Admin.
* **Form di Autenticazione / Login Utenti Finali**: Scartato. L'autenticazione riguarda solo gli utenti Admin ed è gestita separatamente in `apps/auth`.
* **Cifratura del Payload lato Browser Client**: Scartato. La sicurezza in transito è gestita interamente da HTTPS/TLS; la cifratura dei dati avviene esclusivamente lato server prima della persistenza.
* **Integrazione Obbligatoria di CAPTCHA Bloccanti**: Scartata dal flusso primario per preservare la totale assenza di attrito per l'utente umano. L'integrazione di provider esterni (Cloudflare Turnstile / reCAPTCHA v3) è posizionata come estensione opzionale per sprint futuri.
* **Scansione Antivirus Sincrona Bloccante**: Scartata per evitare degrado della latenza e saturazione delle quote API terze durante la sottomissione del form.
