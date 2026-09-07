# Idea: OAuth 2.1 per MCP Server BeechCMS

## Problema attuale
Il pacchetto `packages/mcp` (`src/client.ts`) autentica passando `BEECH_EMAIL` / `BEECH_PASSWORD` in chiaro via env var al client MCP, che li invia a `POST /auth/login` per ottenere un JWT bearer. Questo significa:
- password admin dell'account Beech risiede in chiaro nella config del client MCP (es. config Claude Desktop, `.env`)
- nessuno scoping dei permessi: chi ha il token ha accesso completo quanto l'utente admin
- nessuna revoca granulare (revocare = cambiare password account intero)
- `baseUrl` è configurabile (`BEECH_API_URL`), quindi il MCP può già puntare a un'istanza Beech remota — aggravando il rischio di esporre credenziali admin su rete verso un server remoto

## Proposta
Sostituire il login via credenziali dirette con un flow OAuth 2.1 (authorization code + PKCE), standard raccomandato dalla spec MCP per l'auth dei server MCP.

Flusso previsto:
1. Il client MCP apre una finestra/browser di sistema verso l'authorization server di Beech
2. L'utente si autentica direttamente su Beech (password mai passa dal client/env MCP)
3. Consent screen: l'utente vede quale client (MCP) richiede accesso e con quali scope
4. Beech reindirizza con un authorization code
5. Il client MCP scambia il code (+ PKCE verifier) per un access token + refresh token, scoped ai permessi concessi
6. Refresh automatico del token; possibilità di revoca granulare lato Beech senza toccare la password utente

## Perché farlo bene (non solo per MCP)
OAuth 2.1 non serve solo al MCP: è riusabile per qualsiasi consumer esterno futuro (dashboard integrazioni third-party, API pubblica per partner, CLI, app mobile, webhook, altri agent AI). Investire nell'authorization server una volta paga per tutti questi casi.

## Lavoro implicato (stima alta, da validare in planning)
- **DB (D1):** nuove tabelle `oauth_clients`, `oauth_authorization_codes`, `oauth_tokens` (o estensione di `refresh_tokens` esistente), definizione scope granulari (es. `seeds:read`, `schema:write`)
- **API (`apps/api`):** endpoint `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`; middleware auth aggiornato per validare token OAuth scoped oltre al JWT admin esistente
- **Dashboard:** pagina consent (`/oauth/consent`), pagina gestione "app connesse" per l'utente
- **MCP client (`packages/mcp`):** sostituire `login()` in `client.ts` con flow PKCE (browser popup di sistema, listener locale per redirect, scambio code→token, cache/refresh automatico)

## Stato tabelle esistenti rilevanti
Già presenti in `apps/api/migrations`: `users`, `refresh_tokens`, `password_reset_tokens`. Nessuna tabella OAuth (`oauth_clients`, `oauth_tokens`, scope) esiste ancora — layer OAuth va costruito da zero sopra l'auth JWT attuale.

## Riuso di `apps/api/src/auth/` esistente

**Riusabile direttamente:**
- `providers/jwt-token.service.ts` (`tokenService.issue()`) — genera già JWT con claims sub/email/role; l'access token OAuth può riusare lo stesso service aggiungendo claim `scope`/`client_id`
- `providers/hash.provider.ts` + `verifyPassword`/`DUMMY_PASSWORD_HASH` (compare timing-safe) — riusabile per hashare `client_secret` o `code_challenge` in storage
- `sha256hex`, `SystemClock`, `SystemIdGenerator` (da `@beechcms/core`) — stesso pattern per hashare authorization code / access token prima di salvarli in D1, mai plaintext (esattamente come fa oggi `sessionRepository.saveRefreshToken`)
- `sessionRepository` (refresh token repo, `saveRefreshToken`/`findActiveByHash`/`revokeByHash`) — template diretto per un nuovo `oauthTokenRepository` con la stessa forma (save / find-active / revoke by hash)
- `dual-key-rate-limiter` + `getClientIp` — riusabile su `/oauth/token` per prevenire brute-force sul code exchange
- Cookie helpers (`getRefreshTokenCookieOptions` ecc., httpOnly/Strict/secure) — pattern da copiare per l'eventuale cookie di sessione durante il consent flow

**Non riusabile, va scritto nuovo:**
- `/auth/login` resta invariato per il login umano via dashboard; `/oauth/authorize` è un layer sopra (redirige al login esistente se non autenticato, poi genera authorization code invece di token diretto)
- Nessun concetto di `client_id` / `scope` / PKCE / authorization code esiste oggi — tabelle e repository nuovi
- Consent UI (nuova pagina dashboard)

**Conclusione:** non serve riscrivere crypto, rate-limiting o token-issuing — solo orchestrare i pezzi esistenti dentro gli endpoint OAuth aggiuntivi (`/oauth/authorize`, `/oauth/token`) che wrappano l'auth attuale.

## Alternativa più leggera scartata per ora
API key statica scoped (tabella `api_keys` + settings page, no consent flow, no browser popup) coprirebbe gran parte del bisogno con una frazione del lavoro — ma l'utente vuole "fare le cose come si deve", quindi si procede con OAuth 2.1 completo.
