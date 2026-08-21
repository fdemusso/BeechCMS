# Data Classification & Privacy System (Ideation)

## Obiettivo
Rifattorizzare l'attuale sistema di privacy frammentato (`privacy`, `visibility`, `public`) in un sistema basato su **Data Classification a 4 livelli**. Questo sistema fungerà da interfaccia globale per la privacy in tutta l'applicazione, centralizzando anche la logica crittografica dell'autenticazione.

---

## 1. I 4 Livelli di Classificazione (La Matrice)

Invece di dire al sistema *come* gestire il dato, si definisce *che tipo* di dato è. Il sistema applica automaticamente le policy di archiviazione (Storage) ed esposizione (Serving).

| Livello | Storage | Serving | Esempi |
| :--- | :--- | :--- | :--- |
| **Public** | Plain text | **Full** ovunque (API pubbliche e interne). Indicizzabile e filtrabile. | Titoli, slug, descrizioni, immagini di copertina |
| **Internal** | Plain text | **Full** solo in API autenticate (Admin). **Hidden** (rimosso) in API pubbliche. | Note di redazione, ID di sistemi terzi, status interni |
| **Confidential** | **Encrypted** (AES-256-GCM) | **Hidden** in API pubbliche. **Masked** (es. `j***@email.com`) in liste admin. **Full** solo in detail views con permessi specifici. | Email, numeri di telefono, dati PII (Personally Identifiable Information) |
| **Restricted** | **Hashed** (Bcrypt) | **MAI** servito al client (`Hidden`). Nessuna ricerca. Audit log obbligatorio in caso di accesso di sistema (es. reset password). | Password, secret OAuth, API keys critiche |

---

## 2. Refactoring dei Tipi (Schema)

Attualmente il `Branch` definisce le policy così:
```typescript
policies?: {
  privacy?: 'plain' | 'hash' | 'encrypt'
  visibility?: 'full' | 'masked' | 'hidden'
  public?: boolean
}
```

Verrà semplificato e tipizzato in questo modo:
```typescript
export interface BranchPolicies {
  /** Livello semantico di classificazione del dato */
  classification: 'public' | 'internal' | 'confidential' | 'restricted';
  
  /** Eventuali override puntuali per casi limite */
  overrides?: {
    searchable?: boolean;
    // ...
  }
}
```

---

## 3. PrivacyService (Interfaccia Globale)

Creeremo un servizio globale (es. in `@beechcms/core` o nel livello API condiviso) in grado di gestire sia la crittografia reversibile (AES-GCM nativo con `crypto.subtle`) sia l'hashing (delegando all'esistente `HashProvider` basato su bcrypt dell'auth).

### Struttura proposta:

```typescript
export class PrivacyService {
  constructor(
    private hashProvider: HashProvider, // Bcrypt (già esistente)
    private masterKey: CryptoKey        // AES-256-GCM
  ) {}

  /** Protezione del dato prima della scrittura su DB */
  async protectData(value: string, classification: 'public' | 'internal' | 'confidential' | 'restricted'): Promise<string> {
    switch (classification) {
      case 'restricted':
        return this.hashProvider.hash(value);
      case 'confidential':
        return this.encryptSymmetric(value); // AES-GCM
      case 'internal':
      case 'public':
        return value;
    }
  }

  /** Lettura del dato dal DB per servirlo (se permesso) */
  async unprotectData(cipherText: string, classification: string): Promise<string> {
    if (classification === 'confidential') {
      return this.decryptSymmetric(cipherText);
    }
    // I campi Restricted (password) restano hash, Public e Internal restano plain
    return cipherText;
  }
  
  private async encryptSymmetric(value: string): Promise<string> { ... }
  private async decryptSymmetric(cipherText: string): Promise<string> { ... }
}
```

## 4. Vantaggi Architetturali
- **Sicurezza by Design**: Lo sviluppatore sceglie semplicemente `confidential` e il dato viene automaticamente cifrato a riposo e rimosso dalle API pubbliche.
- **Retrocompatibilità**: Le password degli utenti (create via Bcrypt) continueranno a funzionare perché il livello `restricted` utilizzerà il medesimo `HashProvider`.
- **Performance all'Edge**: Sfruttando `crypto.subtle` (Web Crypto API), la crittografia `confidential` funzionerà perfettamente su ambienti edge (es. Cloudflare Workers).

---

## 5. Accortezze per il Serving (Exposure / Data in Transit)

Per evitare *Data Leak* accidentali, la logica di esposizione dei dati deve agire come un filtro severo prima che il JSON venga inviato al client, seguendo queste accortezze:

1. **Context-Aware Filtering**: Il filtro deve conoscere l'identità e il ruolo di chi sta facendo la richiesta (es. Anonimo, Admin, SuperAdmin).
2. **Default Deny per Livello**:
   - Nelle **API Pubbliche**: Eliminare sempre (`hidden`) i dati `Internal`, `Confidential` e `Restricted`.
   - Nelle **API Autenticate**: 
     - I `Restricted` (password) restano eliminati (`hidden`).
     - I `Confidential` (email) vengono serviti offuscati (`masked`) per le chiamate List (tabella). Vengono restituiti in chiaro (`full`) solo nelle chiamate di Dettaglio, a patto che l'utente abbia il permesso di leggerli.
3. **Ottimizzazione (Zero-Decryption su Liste)**: Nelle richieste di Lista (es. 500 utenti), per motivi di performance i campi `Confidential` non vengono decrittati. Viene semplicemente inserita una stringa statica (es. `***@***.***`). 
4. **Limitazioni su Ricerca e Filtri**: I campi crittografati con AES-GCM (IV randomico) non supportano query `LIKE` nativamente su DB. Nel caso in cui si voglia cercare l'email esatta per il Login, bisognerà creare un *Blind Index* (Hash SHA-256 dell'email affiancato al campo cifrato).

---

## 6. Integrazione nell'Architettura (Hono Middleware)

Essendo l'applicazione basata su `createBeechApp()` via **Hono** (in `apps/api/src/factory.ts`), il layer Privacy si integrerà tramite i Middleware.

### Soluzione proposta: Middleware + Helper di Serializzazione
1. **`privacyMiddleware.ts`**: Un nuovo middleware (simile all'`authProvidersMiddleware`) da iniettare globalmente. Inietterà il `PrivacyService` e la Master Key nel Context (`c.set('privacyService', service)`).
2. **Helper `serializeResponse`**: Invece di manipolare pesantemente lo stream di risposta Hono (che all'edge può dare problemi), i controller utilizzeranno una funzione centralizzata prima di rispondere:
   ```typescript
   // Nel Controller
   const rawData = await repository.findMany();
   const safeData = await c.get('privacyService').applyPrivacyOnServe(rawData, c);
   return c.json(safeData);
   ```
   Questa combinazione garantisce sicurezza by-default senza appesantire l'infrastruttura di routing.

---

# Form SDK (`@beechcms/forms-react`) & Smart Anti-Bot Architecture (Issue #325)

## 1. Obiettivo & Visione
Fornire un pacchetto React zero-boilerplate (`@beechcms/forms-react`) che permetta a qualsiasi sviluppatore di montare un form di contatto, richiesta preventivo o lead generation sicuro, responsive e privo di spam nel proprio sito web in 2 minuti.

---

## 2. Il Problema dei Trappole Naive e la "Smart Anti-Bot Strategy"

### ⚠️ Perché i nomi tipo `_gotcha` o `honeypot` falliscono contro i Bot moderni:
1. **Name Inspection**: I bot di ultima generazione scansionano i nomi dei campi HTML. Nomi come `_gotcha`, `honeypot`, `bot_check`, `captcha` vengono identificati dagli algoritmi di spam ed ignorati.
2. **CSS / Visibility Detection**: I bot headless (basati su Puppeteer/Playwright o parser HTML) controllano `display: none` o `visibility: hidden`. Se un campo è nascosto con `display: none`, il bot evita di compilarlo.

---

## 3. L'Architettura Anti-Bot a 5 Livelli di `@beechcms/forms-react`

Per superare qualsiasi bot sofisticato senza infastidire l'utente umano (senza fastidiosi Captcha/reCAPTCHA), l'SDK implementa una difesa multilivello:

```
[ Form Render ] ──► 1. Camouflage Field (es. fax_number / website_url)
                ──► 2. Off-Screen CSS Positioning (pos:absolute, left:-9999px)
                ──► 3. Time Trap (Timestamp token & Min Submission Delta)
                ──► 4. Behavioral Event Proof (Human interaction token)
                ──► 5. Edge Rate Limiter (Max N invii per IP su Cloudflare)
```

### 🛡️ Livello 1: Camouflage Honeypot (Nomi Realistici)
Invece di usare `_gotcha`, l'SDK usa un nome di campo "esca" realistico e camuffato che i bot di spam adorano auto-compilare:
* Esempi di nomi esca: `fax_number`, `website_url`, `middle_name`, `secondary_phone`.
* Il campo viene iniettato con `tabIndex={-1}`, `aria-hidden="true"` ed `autoComplete="off"`.

### 🛡️ Livello 2: Off-Screen CSS Positioning
Invece di `display: none`, il campo esca viene posizionato fuori dallo schermo visibile dell'utente:
```tsx
<div className="absolute -left-[9999px] top-0 opacity-0 pointer-events-none size-0 overflow-hidden" aria-hidden="true">
  <input type="text" name="website_url" tabIndex={-1} autoComplete="off" value={honeypotVal} onChange={e => setHoneypotVal(e.target.value)} />
</div>
```
* **Perché funziona**: Gli screen-reader e gli utenti umani ignorano il campo. I bot di compilazione automatica vedono un normale campo input nel DOM e lo riempiono.

### 🛡️ Livello 3: Time Trap (Min Submission Delta)
Gli esseri umani impiegano almeno 3-5 secondi per leggere e inviare un form. I bot inviano richieste HTTP quasi istantanee (< 1.0 secondi dal render).
* Quando il componente React si monta, calcola o riceve un token crittografico con timestamp iniziale (`t0`).
* Quando la richiesta arriva all'API di BeechCMS (`POST /api/v1/public/:seed/add`), il backend calcola il tempo trascorso:
  * Se $\Delta t < 1.5\text{ secondi}$ $\rightarrow$ **Attacco Bot Rilevato**.

### 🛡️ Livello 4: Silent Rejection (Fake 200 OK)
Quando un bot viene catturato (perché ha compilato il campo esca o ha inviato il form in < 1.5s):
* **L'API restituisce `HTTP 200 OK` con `{ success: true }`**.
* **Perché?** Se rispondi con `400 Bad Request` o `403 Forbidden`, lo sviluppatore del bot capisce che il suo bot è stato bloccato e aggiorna lo script per aggirare la protezione. Con il `200 OK` falso, il bot crede di aver avuto successo e abbandona la pagina!

### 🛡️ Livello 5: Edge Rate Limiting (Cloudflare IP Protection) & Strict Origin Checks
* L'endpoint `/api/v1/public/:seed/add` applica il middleware di Rate Limiting per IP (`cf-connecting-ip`): Max 5 invii ogni 5 minuti per singolo IP.
* **Strict Allowed Origins**: L'API controlla l'header `Origin` / `Referer` bloccando richieste provenienti da domini terzi non autorizzati (`403 Forbidden`).
* **Stored XSS Prevention**: Tutti gli input testo vengono sanificati lato API ed eseguiti in safe rendering su React.
* **Presigned Policy Limits**: Caricamento allegati limitato a Max 10MB per file via S3/R2 policy e max 3 allegati per form.

---

## 4. Pipeline Allegati: Synchronous Magic Bytes & Optimistic VirusTotal Background Scanning

Per gli allegati caricati nei form (es. CV o immagini cantiere):

```
[ Presign Upload ] ──► Magic Bytes Check ──( Fallimento )──► Rifiuto Istantaneo HTTP 400
                               │
                          ( Successo )
                               │
                               ▼
[ Direct PUT R2 ] ──► r2://bucket/quarantine/<fileKey>
                               │
                               ▼
[ Submit Lead ] ──► Salvataggio D1 + Risposta Istantanea HTTP 200 OK (< 300ms)
                               │
                               ▼
[ Background Process ] ──► c.executionCtx.waitUntil( VirusTotal Hash & Scan API )
                               ├──► IF CLEAN ──► Move to /media/ + Status "clean"
                               └──► IF INFECTED ──► Delete from R2 + Status "infected" + Admin Alert
```

### A. Rifiuto Istantaneo (Magic Bytes Check - Sincrono `< 5ms`)
* Al momento del presign o caricamento dell'intestazione, l'API verifica i primi 16 byte del file (Magic Bytes).
* Se il file ha un'intestazione non valida (es. si spaccia per `.jpg` o `.pdf` ma ha l'intestazione binaria di un eseguibile `.exe`), viene **RIFIUTATO ISTANTANEAMENTE con `HTTP 400 Bad Request: Invalid file signature`**.

### B. Optimistic Form Submission (Zero UX Wait `< 300ms`)
* Se i Magic Bytes sono validi, il file viene caricato tramite presigned URL nella cartella temporanea `r2://bucket/quarantine/`.
* Il form viene inviato e l'API risponde **immediatamente con `HTTP 200 OK`** all'utente.

### C. Background Virus Scanning con VirusTotal (`c.executionCtx.waitUntil`)
* **Provider Ufficiale Confermato**: **VirusTotal API** (con fallback su SHA-256 Hash Lookup in 100ms).
* In background (senza far attendere il client), l'API esegue la scansione dell'allegato in quarantena tramite VirusTotal.
* **Se pulito**: Il file viene spostato in `r2://bucket/media/` e contrassegnato come `clean`.
* **Se infetto**: Il file viene **cancellato da R2**, il record viene segnato come `infected` e viene inviata una notifica d'errore all'Admin Dashboard (`notifications.type = "error"`).

---

## 5. Definition Schema: Retention Policy (`retentionDays`)

Il tipo `Seed` in `@beechcms/core` supporterà l'opzione di dichiarare la **Data Retention** per conformità GDPR:

```typescript
export interface Seed {
  slug: string;
  label: string;
  // ...
  retentionDays?: number; // Es: 90 giorni per le lead ricevute
}
```

* **Attuazione in v0.8.0**: Il campo `retentionDays` viene formalizzato nel tipo `Seed` e registrato nel DB.
* **Esecuzione in v0.9.0 (Scheduling & Automations)**: Il Task Runner programmato eseguirà una cron job giornaliera che elimina o anonimizza automaticamente i record di quel Seed più vecchi di `retentionDays` giorni.

---

## 6. Micro-DX & Frontend Polish Features

### 💾 A. LocalDraft Recovery (Salvataggio Bozze in LocalStorage)
* L'SDK salva in tempo reale i valori digitati nei campi in `localStorage` legati all'ID del form (`beech_form_draft_<seed>`).
* Se l'utente ricarica la pagina o chiude la scheda per sbaglio, l'SDK ripristina i campi salvati chiedendo: *"Abbiamo ritrovato una bozza non inviata. Vuoi ripristinarla?"*.
* Dopo l'invio con successo, la bozza viene pulita automaticamente da `localStorage`.

### 🔀 B. Conditional Logic (Show/Hide Campi Condizionali)
* I rami del Seed o la configurazione del form possono definire regole di visibilità dinamica:
```typescript
{
  id: "br_restauro_type",
  alias: "restauroType",
  label: "Tipo di Immobile",
  type: "text",
  options: ["trullo", "masseria", "palazzo"],
  dependsOn: { branch: "service", equals: "restauro" }
}
```
* L'SDK mostra o nasconde automaticamente il controllo senza che lo sviluppatore debba scriversi gestori `useState` manuali.

### 🌐 C. Localizzazione i18n & Messaggi di Errore Nativi
* L'SDK include messaggi di errore predefiniti localizzati in **Italiano (default)** ed **Inglese**:
  * `"Campo obbligatorio"` / `"This field is required"`
  * `"Inserisci un indirizzo email valido"` / `"Please enter a valid email address"`
* Tutti i messaggi possono essere sovrascritti puntualmente tramite le prop `labels` ed `errorMessages`.

---

## 7. API del Componente React (`<BeechForm />`)

```tsx
import { BeechForm } from '@beechcms/forms-react';

export default function ContactSection() {
  return (
    <BeechForm
      seed="leads"
      lang="it"
      autoSaveDraft={true}
      antiBot={{
        honeypotField: 'website_url', // Campo esca mimetizzato
        minTimeSeconds: 2.0,           // Tempo minimo di compilazione
      }}
      className="space-y-4 max-w-lg mx-auto"
      labels={{
        submitButton: "Invia Richiesta",
        successMessage: "Grazie! Il tuo messaggio è stato inviato.",
      }}
      onSuccess={(response) => {
        console.log("Lead salvata:", response.id);
      }}
      onError={(error) => {
        console.error("Errore invio:", error.message);
      }}
    />
  );
}
```

---

## 8. Governance, Feature Brief & Sprint Planning Rules

### 📋 Transizione Ideazione $\rightarrow$ Feature Brief $\rightarrow$ Sprint Execution
1. **Inclusione Totale nel Feature Brief**: Tutti i punti concordati e formalizzati in questo documento (`idea.md`) vengono inclusi integralmente nel file `stages/00_ideation/output/feature_brief.md`.
2. **Roadmap Multi-Sprint**: Nella fase successiva di **Sprint Planning (`stages/01_sprint_planning`)**, la realizzazione del pilastro verrà suddivisa in **più sprint strutturati e sequenziali** per garantire uno sviluppo ordinato, pulito e coperto da unit/integration test.
