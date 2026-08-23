# Feature Roadmap (Stacked PRs Architecture & Iterazioni Successive)

> **Contesto & Strategia di Rilascio (Stacked PRs):**
> La serie di feature 1-4 segue il modello [GitHub Stacked Pull Requests](https://docs.github.com/en/pull-requests/how-tos/stacked-pull-requests). Ogni sprint / feature si innesta direttamente sul branch della feature precedente.
> **Nota di Processo:** Questa strategia di stacked PR e la catena di dipendenze devono essere portate e specificate esplicitamente fino alla fase **`01_sprint_planning`** (inclusi i target branch nei singoli piani di sprint).

---

## Panoramica Catena Stacked PRs

```
devs (base)
 └── feature/strict-client-sdk-segregation (Feature 1: Zero-Leak Client SDK & Strict Entrypoints) [COMPLETATA/REVIEWED]
      └── feature/tiptap-richtext-rendering (Feature 2: TipTap RichText Rendering Utilities)
           └── feature/confidential-fields-automation (Feature 3: Confidential Fields & Automation Pipeline)
                └── feature/zero-secret-form-ingestion (Feature 4: Zero-Secret Form Ingestion & Anti-Bot)
```

| PR | Feature | Branch Nome | Base Branch PR | Target Package / Moduli |
| :--- | :--- | :--- | :--- | :--- |
| **PR 1** | Feature 1: Zero-Leak Client SDK | `feature/strict-client-sdk-segregation` | `devs` | `packages/client` (`/browser`, `/server`) |
| **PR 2** | Feature 2: TipTap RichText Rendering | `feature/tiptap-richtext-rendering` | `feature/strict-client-sdk-segregation` | `packages/client` (`/richtext`) |
| **PR 3** | Feature 3: Confidential Fields Pipeline | `feature/confidential-fields-automation` | `feature/tiptap-richtext-rendering` | `@beechcms/core`, `apps/api` |
| **PR 4** | Feature 4: Zero-Secret Form Ingestion | `feature/zero-secret-form-ingestion` | `feature/confidential-fields-automation` | `packages/forms-react`, `apps/api` |

---

## 1. Feature 1: Zero-Leak Client SDK & Strict Entrypoints (`@beechcms/client`)
* **Stato:** Completata, revisionata (PASS) e pushata su `origin/feature/strict-client-sdk-segregation`.
* **Base PR:** `devs`

---

## 2. Feature 2: TipTap RichText Rendering Utilities (`@beechcms/client/richtext`)

### Obiettivo
Fornire utility pure, isolate e performanti per il rendering e l'estrazione testo dei documenti RichText generati dall'editor TipTap di BeechCMS, da utilizzare nei componenti UI e nelle pagine server senza appesantire il core client HTTP.

### Git & Stacked PR Config
* **Branch:** `feature/tiptap-richtext-rendering` (creato da `feature/strict-client-sdk-segregation`)
* **Base Branch PR:** `feature/strict-client-sdk-segregation`
* **Portare a Stage 01:** Nel piano di sprint di stage 01 deve essere esplicitato che il branch di lavoro si basa su `feature/strict-client-sdk-segregation`.

### Specifiche e Funzionalità
* **Entrypoint:** `@beechcms/client/richtext`
* **Funzioni Core:**
  * `renderRichText(doc: TipTapDoc | unknown): string`: converte l'AST TipTap in markup HTML semantico, sicuro e sanitizzato.
  * `richTextToPlainText(doc: TipTapDoc | unknown): string`: estrae esclusivamente il testo puro (senza tag HTML) per meta tag SEO, OpenGraph, snippet e anteprime.
* **Principi Guida:**
  * Nessuna magia o mutazione a runtime all'interno del client HTTP: il rendering è esplicito e controllato dallo sviluppatore.
  * Bundle leggero, tree-shakeable e compatibile sia con ambienti Server che Browser.

---

## 3. Feature 3: Confidential Fields & In-Memory Automation Pipeline (`apps/api` & `@beechcms/core`)

### Obiettivo
Garantire la conformità GDPR e la sicurezza a riposo dei dati sensibili inseriti dagli utenti senza interrompere il funzionamento delle automazioni email e notifiche transazionali.

### Git & Stacked PR Config
* **Branch:** `feature/confidential-fields-automation` (creato da `feature/tiptap-richtext-rendering`)
* **Base Branch PR:** `feature/tiptap-richtext-rendering`
* **Portare a Stage 01:** Da esplicitare nella fase di sprint planning corrispondente.

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

## 4. Feature 4: Zero-Secret Form Ingestion & Anti-Bot (`packages/forms-react`)

### Obiettivo
Permettere l'ingestione sicura di sottomissioni form da frontend pubblici verso BeechCMS senza richiedere alcuna API key di scrittura nel bundle browser, proteggendo gli endpoint da spam, crawler e bot.

### Git & Stacked PR Config
* **Branch:** `feature/zero-secret-form-ingestion` (creato da `feature/confidential-fields-automation`)
* **Base Branch PR:** `feature/confidential-fields-automation`
* **Portare a Stage 01:** Da esplicitare nella fase di sprint planning corrispondente.

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
