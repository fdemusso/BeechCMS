# Feature Idea: Rate Limiting Modernization & Auth Hardening (Issue #338)

## 1. Visione & Obiettivo
Attualmente il sistema di rate limiting in BeechCMS soffre di due criticità principali:
1. **Friction su Route Pubbliche (Read/Write)**: l'uso di finestre fisse (Cloudflare simple fixed-window / in-memory counters) causa starvation sui burst leciti di traffico (es. rendering iniziale di pagine con query parallele) e boundary spikes (chiamate ravvicinate a cavallo della finestra di 60s).
2. **Vulnerabilità Brute Force / Credential Stuffing su Auth**: gli endpoint sensibili (`/auth/login`, `/auth/forgot-password`, `/auth/refresh`) limitano unicamente per `clientIp`, esponendo gli account ad attacchi distribuiti tramite proxy rotanti.

L'obiettivo è elevare la robustezza e la qualità dell'esperienza API introducendo un rate limiting a **Token Bucket** per le route pubbliche e un modello **Dual-Key / Composite** per l'autenticazione, garantendo al contempo la massima aderenza all'ambiente di produzione anche in fase di test e sviluppo locale.

---

## 2. Pilastri Fondamentali della Soluzione

### A. Token Bucket con Supporto alla Persistenza Edge
- **Comportamento & Capacità**:
  - `publicApiRead`: Permettere burst iniziali (es. burst capacity 30–50 token) con refill fluido e continuo (es. 2–5 token/sec).
  - `publicApiWrite`: Capacità di burst controllata (es. 10–20 token) con refill più restrittivo (es. 0.5–1 token/sec).
- **Persistenza Edge**:
  - Supportare la conservazione dello stato del bucket (token rimanenti e timestamp dell'ultimo refill) in ambienti edge / Cloudflare Workers per evitare che l'isolamento dei worker disperda lo stato del bucket tra richieste concorrenti o nodi distribuiti.
- **Header Standard**:
  - Restituire `Retry-After` (in caso di HTTP 429).
  - Includere gli header informativi `X-RateLimit-Limit` e `X-RateLimit-Remaining` per consentire ai client/frontend di auto-regolarsi.

### B. Hardening Endpoint di Autenticazione (Dual-Key Composite Limiting)
- **Doppia Barriera di Protezione**:
  1. **IP Limiter (`ip:${clientIp}:login`)**: Protegge l'infrastruttura contro scansioni ad alto volume e attacchi volumetrici da singolo IP.
  2. **Account Limiter (`account:${normalizedEmail}:login`)**: Protegge l'identità dell'utente contro attacchi di password guessing / credential stuffing distribuiti su più IP.
- **Applicazione Rigida**:
  - Validazione sia per `/auth/login` che per `/auth/forgot-password` (e monitoraggio di `/auth/refresh`).
  - L'email viene normalizzata (`trim().toLowerCase()`) per evitare bypass tramite casing o spazi.
  - Se uno qualsiasi dei due limiti viene superato, la richiesta viene immediatamente bloccata con HTTP 429 e relativo header `Retry-After`.

### C. Armonizzazione Dev / Test con Massima Fedeltà a Produzione
- Piuttosto che creare divergenze o sostituire bruscamente i componenti con mock semplicistici, armonizzare l'architettura dei limiter:
  - Integrare il `TokenBucketRateLimiter` di `@beechcms/core` come motore unificato di riferimento.
  - Nei test di integrazione (`vitest`) utilizzare il `TokenBucketRateLimiter` con clock controllabile (`IClock` / virtual time), assicurando che il comportamento del middleware rispecchi fedelmente la logica di produzione senza dipendere da simulatori esterni instabili.
  - Mantenere la gestione controllata e trasparente dei fallback locali per sviluppo senza degradare la sicurezza o la fedeltà dei test.

---

## 3. Entità Coinvolte
- **`@beechcms/core`**: `TokenBucketRateLimiter`, `IRateLimiter`, `RateLimitResult`, `IClock`.
- **`apps/api` Middleware**: `rate-limit.middleware.ts`, `public/rate-limit-middleware.ts`.
- **`apps/api` Auth Endpoints**: `factory.ts` (route handlers per `login`, `refresh`, `forgot-password`).
- **Edge Storage / Persistence**: Adattatore per sincronizzazione dello stato dei bucket a livello Edge.

---

## 4. Criteri di Accettazione Iniziali
1. Burst di traffico lecito su API pubbliche gestito senza 429 prematuri fino a esaurimento della capacità del bucket.
2. Refill fluido e continuo dei token calcolato correttamente su base temporale frazionaria.
3. Attacco distribuito verso singola email bloccato tempestivamente dal limiter di account anche con IP differenti.
4. Response header standard (`Retry-After`, `X-RateLimit-*`) popolati accuratamente.
5. Suite di test di integrazione coerente ed eseguibile in locale con comportamento allineato a produzione.