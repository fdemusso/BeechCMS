# 1. Feature Definition and Core Value

Fornire un sotto-modulo ufficiale, ultra-leggero e isomorfico (`@beechcms/client/webhooks`) per verificare l'integrità e l'autenticità crittografica delle notifiche webhook inviate da BeechCMS (header `X-BeechCMS-Signature`).

Risolve il problema della mancanza di un subpath export isolato e della mancanza di un'API ergonomica e standardizzata (in stile Stripe/Svix con gestione chiara degli errori), permettendo agli sviluppatori di qualsiasi ambiente JavaScript/TypeScript (Node.js, Edge, Cloudflare Workers, Next.js, Fastify, Bun) di validare ed elaborare webhook in modo sicuro e senza dipendenze runtime esterne.

# 2. Domain Boundaries and Business Rules

- **Entity / Sottomodulo:** `@beechcms/client/webhooks` (e re-export dal barrel root `@beechcms/client`).
- **Nessuna dipendenza runtime esterna (Zero-deps):** L'implementazione deve utilizzare esclusivamente la Web Crypto API standard (`crypto.subtle`), nativamente disponibile in Node.js ≥ 18 e in tutti i runtime moderni edge/browser.
- **Timing-Safe Comparison:** Il confronto tra la firma attesa e la firma ricevuta deve avvenire in tempo costante (`timingSafeEqual`) per prevenire timing attacks.
- **Formato Firma Accettato:** L'algoritmo atteso è HMAC-SHA256. Il verificatore deve accettare indifferentemente il valore con prefisso `sha256=<hex>` o come stringa raw `<hex>`.
- **Nessuna logica di Replay Attack / Timestamp:** BeechCMS invia attualmente la firma HMAC calcolata unicamente sul raw body; il modulo SDK non deve inventare finestre di tolleranza temporale o header inesistenti nel backend.
- **Zero Legacy / No Deprecated Code:** Nessun mantenimento di funzioni obsolete con parametri posizionali o alias legacy. L'API è greenfield e adotta esclusivamente il pattern con oggetto opzioni `{ payload, signature, secret }`.

# 3. Primary Requirements (User Stories)

* AS A backend/fullstack developer I WANT TO import `verifyBeechWebhookSignature` and `constructWebhookEvent` directly from `@beechcms/client/webhooks` SO THAT I can verify inbound BeechCMS webhook payloads in any runtime without bundling unnecessary dependencies.
* AS A developer handling webhooks I WANT TO call `verifyBeechWebhookSignature({ payload, signature, secret })` SO THAT I can obtain a boolean validation result without throwing exceptions.
* AS A developer handling webhooks I WANT TO call `constructWebhookEvent<T>({ payload, signature, secret })` SO THAT I can validate the HMAC signature and receive the parsed, strongly-typed JSON event in a single operation.
* AS A developer building API routes I WANT `constructWebhookEvent` to throw a specific `WebhookVerificationError` when the signature or secret is invalid or missing SO THAT I can return a `401 Unauthorized` HTTP response immediately.
* AS A developer building API routes I WANT `constructWebhookEvent` to let JSON parsing errors (e.g. `SyntaxError`) surface naturally SO THAT I can distinguish invalid JSON payloads (`400 Bad Request`) from signature verification failures (`401 Unauthorized`).
* AS A developer writing TypeScript code I WANT to use exported constants like `BEECH_SIGNATURE_HEADER` (`'x-beechcms-signature'`) and TypeScript interfaces SO THAT my webhook handling logic is strongly typed and resistant to typos.

# 4. Secondary Requirements and Logical Constraints

- **Input Validation & Edge Cases:**
  - `payload`: se non è una stringa (es. `null`, `undefined` o tipo non valido), la validazione fallisce restituendo `false` o lanciando `WebhookVerificationError`.
  - `signature`: se è `null`, `undefined`, stringa vuota o non valida (caratteri non esadecimali, lunghezza errata), la validazione fallisce immediatamente restituendo `false` o lanciando `WebhookVerificationError` senza incorrere in unhandled exceptions.
  - `secret`: se è `null`, `undefined` o stringa vuota, la validazione fallisce restituendo `false` o lanciando `WebhookVerificationError`.
- **Overhead e Bundle Size:**
  - Il subpath export `./webhooks` in `package.json` deve puntare a file dedicati compilati (`dist/webhooks/index.js` e `dist/webhooks/index.d.ts`), minimizzando il bundle size negli ambienti serverless/edge.
- **Error Class:**
  - `WebhookVerificationError` deve estendere `Error` con nome `name = 'WebhookVerificationError'` e messaggio esplicativo del motivo del fallimento.

# 5. Out of Scope (Discarded during sparring)

- **Timestamp & Replay Attack Tolerance (`tolerance: 300s`):** Escluso poiché il backend di automazione di BeechCMS attualmente emette la firma calcolata unicamente sul payload senza header di timestamp.
- **Wrapper Middleware per Framework Specifici (Express/Next.js middlewares):** Esclusi per mantenere il client SDK snello, agnostico e manutenibile; gli sviluppatori usano direttamente le funzioni core nei propri route handler.
- **Parametri Posizionali / Codice Deprecato (`verifyBeechSignature(body, signature, secret)`):** Esclusi. L'API utilizzerà rigorosamente la signature a oggetto opzioni `{ payload, signature, secret }`.
- **Dipendenze Crittografiche Esterne (es. `crypto-js`, `noble-hashes`):** Escluse a favore di Web Crypto API nativa (`crypto.subtle`).
