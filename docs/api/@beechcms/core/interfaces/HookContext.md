[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / HookContext

# Interface: HookContext

## Properties

### actor?

> `optional` **actor?**: [`HookActor`](HookActor.md)

Utente che esegue l'operazione, estratto dal JWT. Assente per operazioni di sistema/cron.

***

### db

> **db**: `unknown`

Escape hatch per la connessione nativa (D1Database in prod, better-sqlite3 nei test).
Tipizzato `unknown` per non accoppiare @beechcms/core a Cloudflare. Usare con cautela:
scrivere qui bypassa la Botanical Engine.

***

### repository

> **repository**: [`ContentRepository`](ContentRepository.md)

Canale lecito per side-effect sui contenuti dagli hook (rispetta la Botanical Engine).

***

### seed

> **seed**: [`Seed`](Seed.md)
