# 1. Feature Definition and Core Value

L'ingestione di dati da form pubblici (es. lead generation, richieste di preventivo, contatti) espone tipicamente i sistemi a due rischi critici: la fuga di credenziali privilegiate se vengono incorporate API Key di scrittura nel bundle frontend, oppure lo spam incontrollato da parte di bot e crawler automatizzati se gli endpoint vengono aperti pubblicamente.

Questa feature risolve alla radice entrambi i problemi fornendo un'architettura di ingestione **Zero-Secret** abbinata a un livello di difesa anti-bot multilivello e trasparente per l'utente umano (senza CAPTCHA o puzzle invasivi). Attraverso token temporali crittografici, campi esca di camouflage, validazione dell'origine, rate limiting adattivo e integrazione fluida con un toolkit React, BeechCMS consente a qualsiasi frontend pubblico di inviare contenuti in sicurezza, garantendo integrità dei dati e zero attrito nell'esperienza utente.

---

# 2. Domain Boundaries and Business Rules

### Entità Logiche di Dominio
1. **Public Ingestion Endpoint (`/api/v1/public/:seed/add`):** Gateway di ingresso per le sottomissioni anonime provenienti dal web.
2. **Time-Trap Token Authority (`/api/v1/public/timetrap/token`):** Servizio crittografico che rilascia token firmati attestanti il momento esatto di rendering del form.
3. **Anti-Bot Defense Engine:** Modulo di analisi e filtraggio delle richieste (Time-Trap, Honeypot, Origin Whitelist, Magic Bytes).
4. **Token Bucket Rate Limiter:** Gestore del budget di traffico per singolo indirizzo IP client.
5. **React Form SDK (`@beechcms/forms-react`):** Strato client-side composto da hook e componenti per l'interazione con l'API pubblica.

### Regole di Business e Confini Inviolabili
* **Zero Secret nel Browser:** I client pubblici non devono necessitare di alcuna chiave API segreta o di scrittura per sottomettere form.
* **Time-Trap Token Obbligatorio e Monouso:**
  * Ogni richiesta di sottomissione pubblica deve obbligatoriamente includere un token Time-Trap firmato con algoritmo HMAC.
  * La sottomissione è valida solo se il tempo trascorso tra il rilascio del token e la ricezione della richiesta è pari o superiore a 1.5 secondi e non eccede la scadenza di 1 ora.
  * Il token è strettamente monouso: una volta utilizzato con successo per creare un record, non può essere riutilizzato per invii successivi.
* **Tolleranza Zero per i Campi Honeypot:** La presenza di qualsiasi valore non vuoto nei campi esca prestabiliti provoca il rifiuto immediato della richiesta e l'iscrizione dell'evento nei log di sicurezza.
* **Stato dei Contenuti 100% Backend-Driven:**
  * Il client pubblico non ha autorità sullo stato del record. Qualsiasi campo di stato inviato nel payload viene tassativamente ignorato o respinto.
  * Lo stato iniziale del record viene determinato dal backend in base alla configurazione del Seed (defaulting a `published` per garantire l'immediata visibilità operativa dei lead/richieste ricevute).
* **Isolamento Rigido dei Campi Riservati:** I campi classificati come `internal` o `restricted` nella definizione del Seed non possono essere scritti tramite endpoint pubblici.
* **Budget di Richieste per IP (Token Bucket):** Ogni IP dispone di un bucket con capacità massima di 17 richieste, ricaricato in modo continuo e progressivo nel tempo. Esaurito il bucket, le richieste vengono respinte.
* **Isolamento da Dipendenze Circolari:** Il pacchetto React opera esclusivamente tramite contratti HTTP standard e non possiede dipendenze dal runtime del server o da chiavi private.

---

# 3. Primary Requirements (User Stories)

* AS A sviluppatore frontend I WANT integrare form pubblici React verso BeechCMS senza includere API Key di scrittura nel codice client SO THAT non rischio la compromissione delle credenziali di backend del progetto.

* AS A utente finale I WANT inviare richieste e messaggi tramite form senza dover risolvere CAPTCHA visivi o puzzle complessi SO THAT la mia esperienza di navigazione e conversione sia fluida e priva di ostacoli.

* AS A amministratore del CMS I WANT che tutte le sottomissioni provenienti da form pubblici siano protette da spam e bot istantanei SO THAT il database non venga inquinato da dati fittizi o malevoli.

* AS A sviluppatore frontend I WANT disporre di hook e componenti React che gestiscano automaticamente il ciclo di vita del token Time-Trap, i campi Honeypot, la validazione client e il salvataggio bozza locale SO THAT posso costruire form accessibili e resilienti con il minimo boilerplate.

* AS A responsabile della sicurezza I WANT che le richieste pubbliche verso l'API siano limitate da un rate limiter per IP e protette da attacchi cross-site tramite verifica dell'origine SO THAT gli endpoint pubblici non possano essere abusati per attacchi di saturazione o Denial of Service.

---

# 4. Secondary Requirements and Logical Constraints

### Gestione Errori e Codici HTTP
* **Token Assente o Non Valido:** Se la richiesta pubblica è priva di token Time-Trap, o se la firma HMAC non corrisponde, il backend risponde con HTTP 422 Unprocessable Entity.
* **Violazione Temporale (Bot Istantaneo o Scaduto):** Se la sottomissione avviene con un delta temporale inferiore a 1.5 secondi o superiore a 3600 secondi, il backend risponde con HTTP 422 Unprocessable Entity.
* **Attivazione Honeypot:** Se uno dei campi decoy contiene un valore, il backend risponde con HTTP 422 Unprocessable Entity e registra un alert di sicurezza.
* **Origine Non Consentita:** Se l'header Origin o Referer non appartiene alla whitelist configurata, il backend risponde con HTTP 403 Forbidden.
* **Superamento Rate Limit:** Se il bucket di token per l'IP chiamante è esaurito, il backend risponde con HTTP 429 Too Many Requests.
* **Scrittura Campi Riservati:** Se il payload tenta di impostare campi interni o ristretti, il backend risponde con HTTP 422 Unprocessable Entity.
* **Allegati Non Conformi:** Se la firma binaria (Magic Bytes) di un file allegato non coincide con il tipo MIME dichiarato, il backend risponde con HTTP 400 Bad Request.

### Vincoli Temporali e Stato Intermedio
* **Ricarica Continua del Rate Limiting:** Il ripristino del budget di 17 richieste per IP deve avvenire in modo fluido tramite algoritmo a secchio con finestra temporale continua (~1 token ogni 3.53 secondi), evitando reset a scatto su finestre fisse d'orologio.
* **Persistenza Bozza Locale nel Client:** Il form React deve memorizzare le bozze dell'utente nel browser per evitare la perdita di dati in caso di refresh, ripulendo la memoria solo al completamento con successo della sottomissione.
* **Supporto Idempotenza:** L'endpoint pubblico deve supportare l'header di idempotenza per prevenire sottomissioni duplicate in caso di instabilità di rete.

---

# 5. Out of Scope (Discarded during sparring)

* **Integrazione di CAPTCHA di Terze Parti:** Esclusa l'integrazione con servizi esterni come Google reCAPTCHA, Cloudflare Turnstile o hCaptcha per preservare l'autonomia architetturale e la totale assenza di attrito per l'utente.
* **Override dello Stato da Client Pubblico:** Esclusa la possibilità per il client pubblico di scegliere o forzare lo stato del record (`published`, `draft`, `review`).
* **Modifica Pubblica Anonima di Record Esistenti:** Le operazioni di modifica o aggiornamento (`PUT`/`PATCH`) tramite form pubblici senza autenticazione non fanno parte del perimetro di questa feature.
* **Fingerprinting Biometrico o di Dispositivo:** Esclusa qualsiasi raccolta invasiva di canvas fingerprinting, tracciamento del mouse ad alta frequenza o telemetria del dispositivo per rispetto della privacy e conformità normativa.
* **Dashboard di Gestione Regole Anti-Bot a Runtime:** I parametri di protezione (delta temporale minimo, lista decoy, capacità bucket) sono gestiti tramite configurazione applicativa e non tramite interfaccia visuale di amministrazione.
