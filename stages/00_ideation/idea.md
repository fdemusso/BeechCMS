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

## 7. Prevenzione IDOR e Sicurezza delle Risorse (RBAC) - [DEFERRED TO NEXT SPRINT]

*Nota: Questa implementazione è formalmente **fuori dallo sprint attuale**. Tuttavia, prepareremo le basi nel layer Privacy (attraverso l'uso del `context.actor`) lasciando dei `TODO: RBAC Sprint` nel codice per facilitarne l'introduzione futura.*

Attualmente il sistema passa l'informazione sul ruolo (estratta dal JWT) fino ai repository, ma **non ne fa enforcing**. Questo apre a vulnerabilità IDOR (Insecure Direct Object Reference), dove un utente a basso privilegio potrebbe eliminare o alterare record di altri semplicemente indovinando l'ID (es. `DELETE /api/users/superadmin-id`).

Per bloccare by-design questo vettore d'attacco, nel prossimo sprint si formalizzerà il sistema di ruoli (Role-Based Access Control):

### A. Formalizzazione dei Ruoli (Core)
Tipizzazione stretta dei ruoli invece del generico `string`:
```typescript
export type SystemRole = 'admin' | 'editor' | 'author' | 'viewer';
```

### B. Estensione dello Schema Seed
Ogni `Seed` (tabella) dichiarerà esplicitamente a livello di configurazione chi può compiere le operazioni CRUD:
```typescript
export interface Seed {
  slug: string;
  // ...
  permissions?: {
    read?: SystemRole[];   // Es: ['admin', 'editor', 'author']
    create?: SystemRole[]; // Es: ['admin', 'editor']
    update?: SystemRole[]; // Es: ['admin', 'editor']
    delete?: SystemRole[]; // Es: ['admin']
  }
}
```

### C. Enforcement via Middleware (`rbacMiddleware.ts`)
Per mantenere i controller "thin", le policy verranno fatte rispettare da un middleware Hono (posizionato subito dopo l'`authMiddleware`). 
Il middleware controllerà dinamicamente:
1. Quale operazione si sta tentando (`GET` -> `read`, `DELETE` -> `delete`).
2. Lo `slug` richiesto (es. `users`).
3. Il ruolo dell'utente (`c.get('jwtPayload').role`).

Se il ruolo non è incluso nell'array `permissions.<azione>` di quel Seed, la richiesta verrà immediatamente terminata con un **`403 Forbidden`**, rendendo il database inattaccabile via IDOR o BOLA.

---

## 8. Considerazioni Architetturali Finali (Edge Cases & Encryption)

### A. L'Email di Login (Classificazione `Internal`)
In un CMS pensato per PMI (team ristretti da 1 a 3 persone), l'email di accesso degli admin è considerata **dato operativo di servizio**, non PII critico (come lo sarebbero i dati sanitari o bancari dei *clienti* finali).
Per questo motivo, l'email di login in `users` sarà classificata come **`Internal`** (salvata in chiaro).
**Vantaggi:**
- Il login resta nativo, veloce e non richiede indici speciali (Blind Indexes).
- Mantiene l'email protetta dalle API pubbliche senza introdurre overhead di decrittazione per le normali operazioni di amministrazione.

La classificazione **`Confidential`** (AES-GCM) verrà riservata strettamente ai dati sensibili inseriti *dall'esterno* (es. raccolte dati, anagrafiche, leads) tramite il CMS.

### B. Key Versioning per AES-GCM (Necessario per questo Sprint)
Per i dati che *saranno* crittografati in `Confidential`, è vitale implementare subito il **Key Versioning**.
Le chiavi crittografiche (Master Key) non sono eterne e vanno ruotate in caso di leak. Se non implementiamo il versionamento oggi, la rotazione di domani romperà tutto.
Il `PrivacyService` formatterà il dato cifrato secondo questo pattern:
`v1:<base64-iv>:<base64-ciphertext>`
Così facendo, in futuro il sistema potrà leggere la versione `v1` e usare la chiave corrispondente per decifrarla, mentre scriverà con una nuova chiave `v2`.

### C. Log di Accesso ai Dati (Audit Trail) - [DEFERRED TO FUTURE]
Quando un utente decripta e legge un dato `Confidential` (es. aprendo una vista di dettaglio), la normativa di sicurezza richiede che l'accesso venga tracciato. In uno sprint futuro, le letture dei campi `Confidential` dovranno richiamare il sistema `logContentActivity` (già presente) per registrare l'accesso.
