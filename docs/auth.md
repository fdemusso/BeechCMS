# Autenticazione Beech CMS

Documentazione del sistema di autenticazione JWT con Refresh Token per l'API REST.

---

## 1. Flow

Il sistema utilizza un approccio ibrido con:
- **Access Token**: JWT con scadenza breve (15 minuti) salvato in localStorage
- **Refresh Token**: Token opaco con scadenza lunga (7 giorni) salvato in httpOnly cookie
- **Rotazione automatica**: Ogni refresh genera un nuovo refresh token (invalida il vecchio)

### 1.1 Login Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant D1
    participant bcrypt
    participant jose

    Client->>API: POST /auth/login con email e password
    API->>API: Parse e valida body
    API->>D1: SELECT user WHERE email
    D1-->>API: user oppure null
    alt user non trovato
        API-->>Client: 401 Invalid credentials
    end
    API->>bcrypt: compare password con hash
    bcrypt-->>API: risultato verifica
    alt password non valida
        API-->>Client: 401 Invalid credentials
    end
    API->>jose: SignJWT access token (15min)
    API->>API: Genera refresh token (UUID v4)
    API->>D1: Salva refresh_token (hashed SHA-256)
    API-->>Client: 200 + access_token (body) + Set-Cookie refresh_token
```

### 1.2 Refresh Token Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant D1

    Note over Client,D1: Access token scaduto dopo 15 minuti
    Client->>API: POST /auth/refresh (Cookie: refresh_token)
    API->>D1: SELECT refresh_token WHERE token_hash
    D1-->>API: refresh_token record
    alt token non valido/scaduto/revocato
        API-->>Client: 401 Invalid refresh token
    end
    API->>D1: UPDATE revoked_at (invalida vecchio)
    API->>API: Genera NUOVO access_token (15min)
    API->>API: Genera NUOVO refresh_token
    API->>D1: INSERT nuovo refresh_token (hashed)
    API-->>Client: 200 + nuovo access_token + Set-Cookie nuovo refresh_token
```

### 1.3 Logout Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant D1

    Client->>API: POST /auth/logout (Cookie: refresh_token)
    API->>D1: UPDATE revoked_at (invalida token)
    API-->>Client: 200 + Clear-Cookie refresh_token
```

**Passaggi dettagliati Login:**

1. **Ricezione**: L'API riceve `email` e `password` nel body JSON della richiesta POST.
2. **Validazione**: Verifica che entrambi i campi siano presenti, di tipo stringa, e che l'email abbia formato valido (contiene `@`).
3. **Query D1**: Cerca l'utente con `SELECT id, email, password_hash FROM users WHERE email = ?` (prepared statement).
4. **Verifica password**: Usa `bcrypt.compare(plainPassword, storedHash)` per confrontare la password in chiaro con l'hash salvato.
5. **Generazione Access Token**: Con `jose.SignJWT` crea un access token con payload `{sub: userId, email}`, algoritmo HS256, scadenza **15 minuti**.
6. **Generazione Refresh Token**: Crea UUID v4 sicuro con `crypto.randomUUID()`.
7. **Salvataggio in DB**: Salva il refresh token hashato (SHA-256) nella tabella `refresh_tokens` con scadenza 7 giorni.
8. **Set Cookie**: Imposta il refresh token in httpOnly cookie (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/auth`).
9. **Risposta**: Restituisce `{token, expiresIn: "15m"}` in JSON.

**Passaggi dettagliati Refresh:**

1. **Ricezione Cookie**: L'API legge il `refresh_token` dal cookie inviato automaticamente dal browser.
2. **Validazione**: Cerca il token hashato in DB, verifica scadenza e che non sia stato revocato.
3. **Lookup Utente**: Recupera i dati utente (id, email) per generare nuovo access token.
4. **Rotazione**: Invalida il vecchio refresh token (imposta `revoked_at`).
5. **Generazione Nuovi Token**: Crea nuovo access token (15min) e nuovo refresh token (7 giorni).
6. **Salvataggio**: Salva il nuovo refresh token hashato in DB.
7. **Risposta**: Restituisce nuovo access token nel body + nuovo refresh token in cookie.

**Passaggi dettagliati Logout:**

1. **Ricezione Cookie**: L'API legge il `refresh_token` dal cookie.
2. **Revoca**: Imposta `revoked_at` nella tabella `refresh_tokens`.
3. **Clear Cookie**: Cancella il cookie `refresh_token` (Max-Age=0).
4. **Risposta**: Restituisce `{message: "Logged out"}`.

---

## 2. Security

| Misura | Descrizione |
|--------|-------------|
| **bcrypt** | Hashing password con salt (10 rounds). Le password non sono mai salvate in chiaro. |
| **Prepared statements** | D1 usa `.bind()` per i parametri; nessuna concatenazione SQL per evitare SQL injection. |
| **Messaggi generici** | "Invalid credentials" sia per utente non trovato che per password errata, per evitare user enumeration. |
| **JWT_SECRET** | In sviluppo: `wrangler.jsonc` vars. In produzione: usare `wrangler secret put JWT_SECRET` e rotazione periodica. |
| **httpOnly Cookie** | Refresh token salvato in httpOnly cookie (XSS protection). Access token in localStorage per flessibilità API calls. |
| **Token Rotation** | Ogni refresh genera un nuovo refresh token; il vecchio viene invalidato. Rileva token rubati. |
| **Hash SHA-256** | Refresh token salvato hashato nel DB (come le password). |
| **SameSite=Strict** | Cookie con `SameSite=Strict` per protezione CSRF. |
| **Short-lived Access** | Access token scadenza 15 minuti invece di 2h. Riduce finestra di attacco. |
| **Revocazione** | Refresh token in DB possono essere invalidati manualmente (logout, ban utente). |

---

## 3. API Reference

### POST /auth/login

Autentica utente e genera access token + refresh token.

**Request:** `Content-Type: application/json`

```json
{
  "email": "admin@beech.local",
  "password": "password123"
}
```

**Response:**

| Status | Descrizione | Body | Headers |
|--------|-------------|------|---------|
| 200 | Login riuscito | `{ "token": "eyJ...", "expiresIn": "15m" }` | `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/auth` |
| 400 | Body vuoto, malformato o campi mancanti | `{ "error": "Invalid request" }` | - |
| 401 | Credenziali errate (utente non trovato o password sbagliata) | `{ "error": "Invalid credentials" }` | - |
| 500 | Errore interno (es. database non raggiungibile) | `{ "error": "Database error" }` | - |

**Note:**
- Access token restituito nel body, valido per 15 minuti
- Refresh token impostato come httpOnly cookie, valido per 7 giorni
- Il client salva l'access token in localStorage e usa il cookie automaticamente

---

### POST /auth/refresh

Ottieni nuovo access token usando il refresh token (inviato automaticamente come cookie).

**Request:** Nessun body necessario. Il cookie `refresh_token` viene inviato automaticamente dal browser.

**Response:**

| Status | Descrizione | Body | Headers |
|--------|-------------|------|---------|
| 200 | Refresh riuscito | `{ "token": "eyJ...", "expiresIn": "15m" }` | `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/auth` |
| 401 | Refresh token mancante, invalido, scaduto o revocato | `{ "error": "Invalid refresh token" }` oppure `{ "error": "Refresh token missing" }` | - |
| 500 | Errore interno | `{ "error": "Refresh failed" }` | - |

**Note:**
- ROTAZIONE: Il vecchio refresh token viene invalidato (campo `revoked_at`)
- Viene generato un NUOVO refresh token e salvato in DB
- Il client riceve un nuovo access token nel body e un nuovo refresh token come cookie

---

### POST /auth/logout

Invalida il refresh token e cancella il cookie.

**Request:** Nessun body necessario. Il cookie `refresh_token` viene inviato automaticamente dal browser.

**Response:**

| Status | Descrizione | Body | Headers |
|--------|-------------|------|---------|
| 200 | Logout riuscito | `{ "message": "Logged out" }` | `Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/auth` |
| 500 | Errore interno | `{ "error": "Logout failed" }` | - |

**Note:**
- Il refresh token viene invalidato in DB (campo `revoked_at`)
- Il cookie viene cancellato (Max-Age=0)
- Il client deve anche rimuovere l'access token da localStorage

---

## 4. Esempi curl

### Login (POST /auth/login)

**Successo (200):**
```bash
curl -v -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@beech.local","password":"password123"}'
```

Risposta:
```json
{"token":"eyJhbGc...","expiresIn":"15m"}
```
Header: `Set-Cookie: refresh_token=<uuid>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800; Path=/auth`

**Credenziali errate (401):**
```bash
curl -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@beech.local","password":"wrong"}'
```

---

### Refresh (POST /auth/refresh)

**Successo (200):**
```bash
curl -v -X POST http://localhost:8787/auth/refresh \
  -H "Cookie: refresh_token=<token_from_login>"
```

Risposta:
```json
{"token":"eyJhbGc...","expiresIn":"15m"}
```
Header: `Set-Cookie: refresh_token=<new_uuid>; ...`

**Token invalido (401):**
```bash
curl -X POST http://localhost:8787/auth/refresh \
  -H "Cookie: refresh_token=invalid-token"
```

---

### Logout (POST /auth/logout)

**Successo (200):**
```bash
curl -v -X POST http://localhost:8787/auth/logout \
  -H "Cookie: refresh_token=<token>"
```

Risposta:
```json
{"message":"Logged out"}
```
Header: `Set-Cookie: refresh_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/auth`

---

## 5. Tabella Database

### refresh_tokens

```sql
CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,              -- UUID del token
    user_id TEXT NOT NULL,            -- Riferimento a users.id
    token_hash TEXT NOT NULL,         -- Hash SHA-256 del token
    expires_at INTEGER NOT NULL,      -- Unix timestamp scadenza (7 giorni)
    created_at INTEGER DEFAULT (unixepoch()),
    revoked_at INTEGER DEFAULT NULL,  -- NULL = attivo, timestamp = revocato
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**Indici:**
- `idx_refresh_user` su `user_id` (per trovare tutti i token di un utente)
- `idx_refresh_hash` su `token_hash` (per validazione veloce)
- `idx_refresh_expires` su `expires_at` (per cleanup periodico)

---

## 6. Manutenzione

### Pulizia Token Scaduti

Periodicamente (es. giornalmente) eseguire:

```sql
DELETE FROM refresh_tokens 
WHERE expires_at < unixepoch() OR revoked_at IS NOT NULL;
```

Può essere schedulato con Cloudflare Workers Cron Triggers.
