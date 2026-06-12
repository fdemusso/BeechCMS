## ── Sprint 6: OAuth & Social Login ──

### Problema
Attualmente, Beech supporta solo l'autenticazione tradizionale con email e password gestita localmente. Per i moderni sistemi SaaS o applicazioni mobile, consentire l'accesso tramite terze parti (es. Google, GitHub, Apple) è fondamentale per aumentare i tassi di conversione degli utenti e ridurre gli oneri di sicurezza relativi alla gestione delle password.

### Soluzione proposta: OAuth Provider Middleware Integrati
Espandere l'infrastruttura di autenticazione integrando il supporto per i principali provider OAuth direttamente nella factory e nel database utenti.

#### 1. Configurazione in `createBeechApp`
Consentire agli sviluppatori di abilitare i provider OAuth nel file di configurazione inserendo solo le credenziali client:

```typescript
export interface BeechConfig {
  seeds: Seed[];
  // ... altri campi ...
  auth?: {
    oauthProviders?: {
      google?: { clientId: string; clientSecret: string };
      github?: { clientId: string; clientSecret: string };
    }
  }
}
```

#### 2. Workflow di login automatico
Beech gestirà automaticamente:
- `/auth/login/google` $\rightarrow$ Redirect verso il server di autorizzazione di Google.
- `/auth/callback/google` $\rightarrow$ Validazione del codice OAuth, recupero dell'indirizzo email dell'utente da Google, inserimento o aggiornamento dell'utente nel database `users` (con flag `oauth_provider = 'google'`) ed emissione dei token JWT nativi.

### Checklist di Implementazione (Sprint 6)
- [ ] Aggiungere i campi `oauthProvider` e `oauthId` alla tabella `users`.
- [ ] Implementare i gestori di reindirizzamento e callback OAuth in `apps/api/src/auth/oauth.ts` (sfruttando l'API nativa di Hono per l'OAuth, es. `@hono/oauth-providers`).
- [ ] Aggiornare la Dashboard per visualizzare l'opzione "Accedi con Google/GitHub" e gestire il flusso di token.
- [ ] Scrivere unit test simulando le chiamate dei callback OAuth.
