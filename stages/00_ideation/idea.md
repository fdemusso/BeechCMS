# Feature Roadmap (Iterazioni Successive)

> **Contesto:** A seguito della separazione della **Feature 1 (Zero-Leak Client SDK & Strict Entrypoints)**, questo documento raccoglie le 3 iniziative architetturali successive da affrontare nei prossimi cicli di ideazione e implementazione.

---

## 1. Feature 2: TipTap RichText Rendering Utilities (`@beechcms/client/richtext`)

### Obiettivo
Fornire utility pure, isolate e performanti per il rendering e l'estrazione testo dei documenti RichText generati dall'editor TipTap di BeechCMS, da utilizzare nei componenti UI e nelle pagine server senza appesantire il core client HTTP.

### Specifiche e Funzionalità
* **Entrypoint:** `@beechcms/client/richtext`
* **Funzioni Core:**
  * `renderRichText(doc: TipTapDoc | unknown): string`: converte l'AST TipTap in markup HTML semantico, sicuro e sanitizzato.
  * `richTextToPlainText(doc: TipTapDoc | unknown): string`: estrae esclusivamente il testo puro (senza tag HTML) per meta tag SEO, OpenGraph, snippet e anteprime.
* **Principi Guida:**
  * Nessuna magia o mutazione a runtime all'interno del client HTTP: il rendering è esplicito e controllato dallo sviluppatore.
  * Bundle leggero, tree-shakeable e compatibile sia con ambienti Server che Browser.

---

## 2. Feature 3: Confidential Fields & In-Memory Automation Pipeline (`apps/api` & `@beechcms/core`)

### Obiettivo
Garantire la conformità GDPR e la sicurezza a riposo dei dati sensibili inseriti dagli utenti senza interrompere il funzionamento delle automazioni email e notifiche transazionali.

### Specifiche e Funzionalità
* **Classificazione Campi `confidential`:**
  * Compilabili da utenti esterni tramite form o API pubbliche (es. email, telefono, dati personali).
  * Ricevuti in chiaro e passati in-memory all'Automation Runner con contesto `system` per consentire l'invio immediato di email transazionali (es. template `To: {{this.email}}`).
  * Cifrati automaticamente a riposo con algoritmo AES-GCM prima della persistenza su Cloudflare D1.
  * Omessi automaticamente nelle risposte `GET` pubbliche (`filterEntryForActor` con `actor: 'public'`).
* **Classificazione Campi `internal`:**
  * Campi gestionali e operativi riservati al backend.
  * Blocco totale in scrittura per qualsiasi client pubblico o non privilegiato.

---

## 3. Feature 4: Zero-Secret Form Ingestion & Anti-Bot (`packages/forms-react`)

### Obiettivo
Permettere l'ingestione sicura di sottomissioni form da frontend pubblici verso BeechCMS senza richiedere alcuna API key di scrittura nel bundle browser, proteggendo gli endpoint da spam, crawler e bot.

### Specifiche e Funzionalità
* **Integrazione React Forms:**
  * Hook e componenti per form pubblici con zero chiavi API di mutazione esposte nel client.
* **Meccanismi di Protezione Anti-Bot:**
  * **Time-Trap Token:** validazione crittografica (HMAC) del tempo trascorso tra il rendering del form e la sottomissione (intercetta bot istantanei).
  * **Honeypot Decoy Fields:** campi esca nascosti per catturare crawler automatizzati.
  * **Origin / Referer Validation:** verifica della provenienza della richiesta per bloccare chiamate cross-site non autorizzate.
* **Policy di Ingestione Backend:**
  * Forzatura automatica dello stato a `draft` o `review` per tutti i contenuti generati da sottomissioni pubbliche.
  * Rate limiting dedicato sugli endpoint di rilascio token e submission.
