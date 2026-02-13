# Analisi di Sicurezza - Sistema di Login

**Data analisi:** 13 Febbraio 2026  
**Componenti analizzati:**
- Frontend: `apps/dashboard/src/components/login-form.tsx`
- Backend: `apps/api/src/index.ts`
- Documentazione: `docs/auth.md`

---

## 1. Riepilogo Esecutivo

### 1.1 Punti di Forza ✅

Il sistema implementa diverse best practice di sicurezza:

- ✅ **Prepared Statements**: Protezione contro SQL injection tramite D1 `.bind()`
- ✅ **Password Hashing**: Uso di bcrypt con salt (10 rounds)
- ✅ **User Enumeration Protection**: Messaggi generici "Invalid credentials"
- ✅ **httpOnly Cookies**: Refresh token protetto da XSS
- ✅ **Token Rotation**: Rotazione automatica dei refresh token
- ✅ **Short-lived Access Tokens**: Scadenza 15 minuti
- ✅ **SameSite=Strict**: Protezione CSRF
- ✅ **Token Hashing**: Refresh token salvati hashati (SHA-256) nel DB

### 1.2 Vulnerabilità Critiche 🔴

1. **Rate Limiting assente** - Vulnerabile a brute force attacks
2. **Timing Attack** - Potenziale differenza di timing tra utente non trovato e password errata
3. **CORS hardcoded** - Origin fisso a `localhost:5173` non funzionerà in produzione
4. **Secure Cookie in sviluppo** - `Secure=true` su HTTP locale può causare problemi
5. **Logging sensibile** - `console.error` può esporre informazioni sensibili

### 1.3 Vulnerabilità Medie 🟡

6. **XSS su localStorage** - Access token vulnerabile a XSS attacks
7. **Validazione password debole** - Nessuna validazione lunghezza/complessità
8. **Security Headers mancanti** - Mancano CSP, X-Frame-Options, etc.
9. **Error handling dettagliato** - Potrebbe esporre informazioni sul sistema
10. **Password in memoria** - Password rimane in memoria dopo il login

---

## 2. Analisi Dettagliata

### 2.1 Rate Limiting 🔴 **CRITICO**

**Problema:**
Nessun rate limiting implementato sugli endpoint `/auth/login`, `/auth/refresh`, `/auth/logout`.

**Rischio:**
- **Brute Force Attack**: Attaccante può tentare migliaia di password al secondo
- **Credential Stuffing**: Test automatico di credenziali rubate
- **DoS**: Overload del database con richieste massive

**Evidenza nel codice:**
```typescript:apps/api/src/index.ts
// Nessun middleware di rate limiting prima di app.post('/auth/login', ...)
app.post('/auth/login', async (c) => {
  // ... nessuna protezione contro tentativi multipli
})
```

**Raccomandazione:**
Implementare rate limiting usando Cloudflare Workers KV o D1 per tracciare tentativi:
- Max 5 tentativi per IP/email ogni 15 minuti
- Max 20 richieste refresh per IP ogni ora
- Blocco temporaneo dopo tentativi falliti

**Priorità:** 🔴 **ALTA** - Implementare immediatamente

---

### 2.2 Timing Attack 🔴 **CRITICO**

**Problema:**
Il codice esegue `findUserByEmail()` prima di `verifyPassword()`, creando una differenza di timing:
- Se utente non esiste: query DB veloce → errore immediato
- Se utente esiste ma password errata: query DB + bcrypt.compare → più lento

**Rischio:**
Attaccante può dedurre se un'email esiste nel sistema misurando il tempo di risposta.

**Evidenza nel codice:**
```typescript:apps/api/src/index.ts
const user = await findUserByEmail(DB, email)  // Query veloce se non esiste

if (!user) {
  return c.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)  // Risposta veloce
}

const isValid = await verifyPassword(password, user.password_hash)  // bcrypt lento
if (!isValid) {
  return c.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)  // Risposta più lenta
}
```

**Raccomandazione:**
Eseguire sempre `verifyPassword()` anche se l'utente non esiste, usando un hash dummy:
```typescript
const user = await findUserByEmail(DB, email)
const hashToCompare = user?.password_hash || '$2a$10$dummyhash...' // Hash dummy fisso
const isValid = await verifyPassword(password, hashToCompare)

if (!user || !isValid) {
  return c.json({ error: AUTH_ERRORS.INVALID_CREDENTIALS }, 401)
}
```

**Priorità:** 🔴 **ALTA** - Fix immediato

---

### 2.3 CORS Hardcoded 🔴 **CRITICO**

**Problema:**
Origin CORS hardcoded a `http://localhost:5173` non funzionerà in produzione.

**Rischio:**
- Produzione non funzionerà se l'origin è diverso
- Possibile errore di configurazione che espone l'API

**Evidenza nel codice:**
```typescript:apps/api/src/index.ts
cors({
  origin: 'http://localhost:5173', // Dashboard locale
  // ...
})
```

**Raccomandazione:**
Usare variabile d'ambiente o array di origins permessi:
```typescript
const allowedOrigins = [
  'http://localhost:5173',
  process.env.PRODUCTION_ORIGIN || 'https://dashboard.beech.local'
].filter(Boolean)

cors({
  origin: (origin) => allowedOrigins.includes(origin) ? origin : null,
  // ...
})
```

**Priorità:** 🔴 **ALTA** - Fix prima del deploy

---

### 2.4 Secure Cookie in Sviluppo 🟡 **MEDIA**

**Problema:**
Cookie con `Secure=true` non funziona su HTTP (localhost), ma è necessario per HTTPS in produzione.

**Evidenza nel codice:**
```typescript:apps/api/src/index.ts
setCookie(c, 'refresh_token', refreshToken, {
  httpOnly: true,
  secure: true, // Non funziona su HTTP locale
  sameSite: 'Strict',
  // ...
})
```

**Raccomandazione:**
Usare `Secure` solo in produzione:
```typescript
setCookie(c, 'refresh_token', refreshToken, {
  httpOnly: true,
  secure: c.req.url.startsWith('https://'), // Solo su HTTPS
  sameSite: 'Strict',
  // ...
})
```

**Priorità:** 🟡 **MEDIA** - Fix per migliorare sviluppo locale

---

### 2.5 Logging Sensibile 🟡 **MEDIA**

**Problema:**
`console.error` può esporre stack trace e informazioni sensibili nei log di produzione.

**Evidenza nel codice:**
```typescript:apps/api/src/index.ts
catch (err) {
  console.error('Login error:', err) // Può esporre stack trace, email, etc.
  return c.json({ error: AUTH_ERRORS.DATABASE_ERROR }, 500)
}
```

**Rischio:**
- Stack trace possono rivelare struttura del codice
- Errori possono contenere dati sensibili (email, query SQL, etc.)

**Raccomandazione:**
Loggare solo errori generici senza dettagli sensibili:
```typescript
catch (err) {
  // Log solo in sviluppo, mai in produzione
  if (process.env.NODE_ENV === 'development') {
    console.error('Login error:', err)
  }
  // In produzione: log solo messaggio generico
  return c.json({ error: AUTH_ERRORS.DATABASE_ERROR }, 500)
}
```

**Priorità:** 🟡 **MEDIA** - Migliorare logging

---

### 2.6 XSS su localStorage 🟡 **MEDIA**

**Problema:**
Access token salvato in `localStorage` è vulnerabile a XSS attacks.

**Evidenza nel codice:**
```typescript:apps/dashboard/src/components/login-form.tsx
localStorage.setItem(AUTH_TOKEN_KEY, data.token) // Vulnerabile a XSS
```

**Rischio:**
Se un attaccante riesce a eseguire JavaScript malevolo, può rubare il token da localStorage.

**Mitigazione attuale:**
- Access token short-lived (15 minuti)
- Refresh token protetto in httpOnly cookie

**Raccomandazione:**
Considerare di salvare anche l'access token in httpOnly cookie se possibile, oppure:
- Implementare Content Security Policy (CSP) rigorosa
- Sanitizzare tutti gli input utente
- Usare `nonce` per script inline

**Priorità:** 🟡 **MEDIA** - Mitigato da token short-lived

---

### 2.7 Validazione Password Debole 🟡 **MEDIA**

**Problema:**
Nessuna validazione di lunghezza minima o complessità password lato client o server.

**Evidenza nel codice:**
```typescript:apps/api/src/auth/login.ts
export function validateLoginInput(email: string, password: string): boolean {
  return EMAIL_REGEX.test(email) && password.length > 0 // Solo controllo presenza
}
```

**Raccomandazione:**
Aggiungere validazione server-side:
```typescript
export function validateLoginInput(email: string, password: string): boolean {
  return EMAIL_REGEX.test(email) && 
         password.length >= 8 && // Minimo 8 caratteri
         password.length <= 128  // Massimo ragionevole
}
```

**Nota:** La validazione password dovrebbe essere fatta anche durante la registrazione, non solo al login.

**Priorità:** 🟡 **MEDIA** - Migliorare validazione

---

### 2.8 Security Headers Mancanti 🟡 **MEDIA**

**Problema:**
Mancano security headers importanti:
- Content-Security-Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

**Raccomandazione:**
Aggiungere middleware Hono per security headers:
```typescript
app.use('*', async (c, next) => {
  await next()
  c.header('X-Frame-Options', 'DENY')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Content-Security-Policy', "default-src 'self'")
})
```

**Priorità:** 🟡 **MEDIA** - Aggiungere headers

---

### 2.9 Error Handling Dettagliato 🟠 **BASSA**

**Problema:**
Alcuni messaggi di errore potrebbero esporre informazioni sul sistema.

**Evidenza nel codice:**
```typescript:apps/api/src/index.ts
return c.json({ error: AUTH_ERRORS.DATABASE_ERROR }, 500) // Espone tipo di errore
```

**Raccomandazione:**
Usare messaggi generici anche per errori 500:
```typescript
return c.json({ error: 'An error occurred' }, 500) // Generico
```

**Priorità:** 🟠 **BASSA** - Migliorare messaggi

---

### 2.10 Password in Memoria 🟠 **BASSA**

**Problema:**
La password rimane in memoria dopo il login (variabile JavaScript).

**Mitigazione:**
- Password non viene loggata
- Variabile viene garbage collected dopo il login
- Non è un rischio significativo in JavaScript

**Priorità:** 🟠 **BASSA** - Non critico

---

## 3. Raccomandazioni Prioritarie

### Priorità ALTA (Implementare immediatamente)

1. ✅ **Rate Limiting** - Implementare su `/auth/login`, `/auth/refresh`
2. ✅ **Timing Attack Fix** - Eseguire sempre verifyPassword anche se utente non esiste
3. ✅ **CORS dinamico** - Usare variabili d'ambiente invece di hardcoded

### Priorità MEDIA (Implementare prima del deploy)

4. ✅ **Secure Cookie condizionale** - Solo su HTTPS
5. ✅ **Security Headers** - Aggiungere CSP, X-Frame-Options, etc.
6. ✅ **Validazione password** - Lunghezza minima/massima
7. ✅ **Logging migliorato** - Non loggare errori sensibili in produzione

### Priorità BASSA (Miglioramenti futuri)

8. ✅ **Error messages generici** - Anche per errori 500
9. ✅ **CSP rigorosa** - Protezione XSS aggiuntiva

---

## 4. Checklist Implementazione

- [ ] Implementare rate limiting con Cloudflare KV/D1
- [ ] Fix timing attack (sempre verifyPassword)
- [ ] Configurare CORS dinamico con env vars
- [ ] Secure cookie condizionale (solo HTTPS)
- [ ] Aggiungere security headers middleware
- [ ] Validazione password server-side
- [ ] Migliorare logging (non sensibile in produzione)
- [ ] Testare tutti i fix in ambiente di sviluppo
- [ ] Documentare cambiamenti in `docs/auth.md`

---

## 5. Test di Sicurezza Consigliati

1. **Brute Force Test**: Tentare 100+ login con password errate
2. **Timing Attack Test**: Misurare tempi di risposta per email esistenti/non esistenti
3. **CORS Test**: Verificare che solo origins permessi funzionino
4. **XSS Test**: Tentare di rubare token da localStorage
5. **CSRF Test**: Verificare che SameSite=Strict funzioni correttamente

---

## 6. Riferimenti

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [Cloudflare Workers Security Best Practices](https://developers.cloudflare.com/workers/examples/security-headers/)

---

**Prossimi passi:** Implementare le correzioni prioritarie e rieseguire l'analisi.
