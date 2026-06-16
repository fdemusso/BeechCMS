## ── Sprint 1: Programmatic Lifecycle Hooks ──

> **Nota di revisione (2026-06-14).** Questo piano è stato corretto dopo un audit tecnico
> contro il codice reale. La prima stesura conteneva firme di repository, costruttori e un
> modello transazionale inventati. Le sezioni sotto riflettono i contratti effettivi
> (`packages/core/src/content.repository.ts`, `apps/api/src/shared/content.repository.d1.ts`,
> `apps/api/src/middleware/repository.middleware.ts`, `apps/api/src/factory.ts`).
> I vincoli di D1 (assenza di transazioni interattive) e l'agnosticismo di `@beechcms/core`
> sono ora rispettati.

### Problema
L'Automation Engine (Phase 6) esegue azioni asincrone e non bloccanti (es. invio mail, webhook). Se uno sviluppatore ha bisogno di:
- Impedire il salvataggio di un articolo se la data di fine è antecedente alla data di inizio (Validazione di business).
- Calcolare un campo derivato a livello server (es. `fullName = firstName + ' ' + lastName`).
- Modificare i dati di un record prima che vengano persistiti su D1.

Oggi deve riscrivere l'intero endpoint di creazione o aggirare il repository.

### Soluzione proposta
Introdurre un registro di **Lifecycle Hooks** sincroni e asincroni, configurati nella factory
del server e iniettati nel `D1ContentRepository`.

---

#### 1. Definizione dell'Interfaccia degli Hook in `@beechcms/core`

> **Vincolo architetturale.** `@beechcms/core` è agnostico rispetto a Cloudflare: non importa
> `@cloudflare/workers-types`. Quindi **`HookContext` non può tipizzare `db: D1Database`**.
> Inoltre, esporre il `D1Database` grezzo agli hook utente violerebbe l'invariante della
> Botanical Engine ("Never bypass this layer"): un hook potrebbe scrivere su D1 saltando
> serializzazione, junction tables e validazione.
>
> **Decisione:** l'`HookContext` espone la **`ContentRepository` astratta** (l'unico canale
> lecito per leggere/scrivere contenuti dagli hook). Per casi avanzati si fornisce un escape
> hatch `db: unknown`, che ogni implementazione concreta valorizza con la propria connessione
> nativa (`D1Database` in prod, `better-sqlite3` nei test) senza forzare import in core.

Aggiungere in `packages/core/src/types.ts` (o in un nuovo `packages/core/src/hooks.ts`
ri-esportato dal barrel):

```typescript
import type { ContentRepository } from './content.repository.js'
import type { Seed } from './types.js'

export interface HookActor {
  id: string
  role: string
  email?: string
}

export interface HookContext {
  seed: Seed
  /** Canale lecito per side-effect sui contenuti dagli hook (rispetta la Botanical Engine). */
  repository: ContentRepository
  /** Utente che esegue l'operazione, estratto dal JWT. Assente per operazioni di sistema/cron. */
  actor?: HookActor
  /**
   * Escape hatch per la connessione nativa (D1Database in prod, better-sqlite3 nei test).
   * Tipizzato `unknown` per non accoppiare @beechcms/core a Cloudflare. Usare con cautela:
   * scrivere qui bypassa la Botanical Engine.
   */
  db: unknown
}

export interface BeechHooks {
  // Eseguiti PRIMA della scrittura. Se lanciano un errore, la scrittura non parte (vedi §4).
  // Possono restituire una versione modificata del payload (alias-keyed) o void.
  beforeCreate?: (data: Record<string, any>, ctx: HookContext) => Promise<Record<string, any> | void> | Record<string, any> | void
  beforeUpdate?: (id: string, patches: Record<string, any>, ctx: HookContext) => Promise<Record<string, any> | void> | Record<string, any> | void
  beforeDelete?: (id: string, ctx: HookContext) => Promise<void> | void

  // Eseguiti DOPO la scrittura andata a buon fine. NON possono fare rollback (vedi §4).
  afterCreate?: (entry: Record<string, any>, ctx: HookContext) => Promise<void> | void
  afterUpdate?: (entry: Record<string, any>, ctx: HookContext) => Promise<void> | void
  afterDelete?: (id: string, ctx: HookContext) => Promise<void> | void
}
```

> **Errore di validazione strutturato.** Per mappare correttamente i fallimenti degli hook
> `before*` a `400/422` (anziché `500`), definire una classe d'errore in `@beechcms/core`
> (vedi §6) e lanciarla dagli hook quando la validazione di business fallisce.

---

#### 2. Integrazione nel Repository D1

Il payload validato (`privacyData`) è **alias-keyed** (chiavi = alias di branch). Gli hook
`before*` ricevono e restituiscono il payload in quella forma; la serializzazione su colonne
resta a carico della Botanical Engine.

> **Firma reale.** Il contratto effettivo NON è `create(seedSlug, payload, actor)`. È:
> `create(seed: Seed, id: string, slug: string, status: string, data: Record<string, any>): Promise<void>`.
> Il costruttore reale è `BaseD1Repository(database)` — niente `clock`/`idGenerator`/`hooks`.
> Aggiungiamo quindi un costruttore esplicito a `D1ContentRepository`.

`apps/api/src/shared/content.repository.d1.ts`:

```typescript
export class D1ContentRepository extends BaseD1Repository implements ContentRepository {
  constructor(database: D1Database, private readonly hooks?: BeechHooks) {
    super(database)
  }

  private hookCtx(seed: Seed, actor?: HookActor): HookContext {
    return { seed, repository: this, actor, db: this.database }
  }

  async create(
    seed: Seed,
    id: string,
    slug: string,
    status: string,
    data: Record<string, any>,
    options?: RepositoryOptions,        // vedi §2-bis
  ): Promise<void> {
    let payload = data

    if (this.hooks?.beforeCreate) {
      const result = await this.hooks.beforeCreate(payload, this.hookCtx(seed, options?.actor))
      if (result) payload = result
    }

    try {
      if (await this.existsSlug(seed, slug)) {
        throw new SlugConflictError(`Slug "${slug}" already exists for ${seed.slug}`)
      }
      const batchStmts: D1PreparedStatement[] = [
        this.buildCreateMainStmt(seed, id, slug, status, payload),
      ]
      for (const branch of multiRelBranches(seed)) {
        const value = payload[branch.alias]
        if (!Array.isArray(value) || value.length === 0) continue
        batchStmts.push(...this.buildJunctionInserts(seed.slug, id, branch.alias, value))
      }
      if (batchStmts.length === 1) await batchStmts[0].run()
      else await this.database.batch(batchStmts)
    } catch (error) {
      if (error instanceof SlugConflictError) throw error
      throw this.mapError(error, `create(${seed.slug})`)
    }

    // afterCreate gira DOPO il commit del batch: NON può fare rollback (vedi §4).
    if (this.hooks?.afterCreate) {
      const entry = { id, slug, status, ...payload }
      await this.hooks.afterCreate(entry, this.hookCtx(seed, options?.actor))
    }
  }

  // update/delete: stesso schema (before* prima del batch, after* dopo).
}
```

#### 2-bis. Propagazione dell'`actor` — `RepositoryOptions` (retrocompatibile)

L'`actor` oggi **non** viene propagato al repository (`createHandler` estrae `jwtPayload` ma
non lo passa). Per evitare di rompere ogni chiamata esistente, aggiungere un parametro
**opzionale in coda** alle firme di scrittura del contratto.

`packages/core/src/content.repository.ts`:

```typescript
export interface RepositoryOptions {
  actor?: { id: string; role: string; email?: string }
}

export interface ContentRepository {
  // ... invariato ...
  create(seed: Seed, id: string, slug: string, status: string, data: Record<string, any>, options?: RepositoryOptions): Promise<void>
  update(seed: Seed, id: string, data: Record<string, any>, status?: string, options?: RepositoryOptions): Promise<void>
  delete(seed: Seed, id: string, options?: RepositoryOptions): Promise<{ row: Record<string, any> }>
  // ...
}
```

Negli handler (`create.ts`, `update.ts`, `delete.ts`) estrarre l'`actor` dal JWT e inoltrarlo:

```typescript
const jwtPayload = context.get('jwtPayload')
const actor = { id: jwtPayload.sub, role: jwtPayload.role, email: jwtPayload.email }
await repository.create(seed, id, finalSlug, status, privacyData, { actor })
```

Tutte le chiamate che omettono `options` restano valide al 100%.

---

#### 3. Registro e Configurazione in `createBeechApp`

Aggiungere `hooks?: BeechHooks` a `BeechConfig` (`apps/api/src/factory.ts`) e propagarlo fino
al middleware. `repositoryMiddleware` istanzia `new D1ContentRepository(database)` (oggi senza
argomenti extra): va esteso per ricevere e passare gli hook.

`apps/api/src/factory.ts`:

```typescript
export interface BeechConfig {
  seeds: Seed[] | Record<string, Seed>
  repository?: ContentRepository
  // ... resto invariato ...
  hooks?: BeechHooks
}

// dentro createBeechApp:
app.use('*', repositoryMiddleware({
  repository: config.repository,
  idempotencyRepository: config.idempotencyRepository,
  mediaRepository: config.mediaRepository,
  systemStatsRepository: config.systemStatsRepository,
  seedRepository,
  hooks: config.hooks,
}))
```

`apps/api/src/middleware/repository.middleware.ts`:

```typescript
interface RepositoryOverrides {
  repository?: ContentRepository
  // ... resto invariato ...
  hooks?: BeechHooks
}

// dentro repositoryMiddleware:
context.set('repository', overrides?.repository ?? new D1ContentRepository(database, overrides?.hooks))
```

> **Attenzione all'`AutomationRunner`.** Subito dopo, il middleware costruisce
> `new AutomationRunner({ contentRepository: context.get('repository'), ... })`. Continuerà a
> ricevere lo stesso repository con gli hook: gli hook gireranno anche per le scritture
> generate dalle automazioni (`edit_field`, `create_entry`). È un comportamento desiderabile,
> ma **va dichiarato esplicitamente** per evitare loop hook → automazione → hook.

---

#### 4. Modello transazionale su Cloudflare D1 ⚠️ (Vincolo critico)

> **Limite di D1.** Cloudflare D1 **non** supporta transazioni interattive
> (`BEGIN`/`COMMIT`/`ROLLBACK` in sequenza asincrona). L'unica atomicità disponibile è
> `db.batch([...preparedStatements])`, che invia un set di statement in un'unica chiamata.
> Tutto il repository attuale usa già esclusivamente `this.database.batch(...)`.

Conseguenze per i lifecycle hook:

- **`before*`** girano nel ciclo JS *prima* di inviare il batch a D1. Se lanciano, il batch non
  parte → nessuna scrittura persistita. L'integrità è garantita **senza** rollback SQL.
- **`after*`** girano *dopo* che il batch è stato committato. Un errore in un `after*`
  **non può** annullare la scrittura: il dato resta su D1 e l'errore risale al client.
  **Questo limite va documentato nell'API pubblica degli hook.** Per side-effect che devono
  poter "fallire l'intera operazione", usare un `before*`, non un `after*`.

**Sostituzione dell'item "transazioni coordinate".** Il piano originale chiedeva un
`runTransaction`/callback interattiva per "ordine + decremento stock sotto un unico rollback":
**non è realizzabile su D1**. Si sostituisce con un metodo dichiarativo che traduce una lista
di operazioni in un singolo `db.batch`:

```typescript
// packages/core/src/content.repository.ts
export type BatchWrite =
  | { kind: 'create'; seed: Seed; id: string; slug: string; status: string; data: Record<string, any> }
  | { kind: 'update'; seed: Seed; id: string; data: Record<string, any>; status?: string }
  | { kind: 'mutateField'; seed: Seed; id: string; fieldName: string; operation: { type: 'increment' | 'decrement'; value: number }; options?: { min?: number; max?: number } }

// ContentRepository:
runBatch(operations: BatchWrite[]): Promise<void>
```

`D1ContentRepository.runBatch` compone tutti gli statement e li esegue con un solo
`this.database.batch(stmts)` (atomico). **Limitazione documentata:** dentro un `runBatch` i
lifecycle hook a livello documento **non vengono eseguiti** (sarebbero side-effect non
atomici); `runBatch` è un'API di basso livello per scritture multi-seed coordinate.

---

#### 5. Aggiornamenti Atomici (`mutateField`)

Per prevenire race condition su campi numerici (stock, saldi), il repository espone una
mutazione atomica SQL con guardie min/max.

> **Sicurezza (SQL injection).** Lo snippet originale interpolava `${fieldName}` direttamente
> in SQL. `fieldName` **deve** essere validato contro `seed.branches` prima della composizione,
> esattamente come fa `D1WidgetRepository` per gli alias. Il nome colonna risolto resta
> interpolato (non è bindabile), ma solo dopo il controllo whitelist; tutti i valori usano `?`.

`packages/core/src/content.repository.ts`:

```typescript
mutateField(
  seed: Seed,
  id: string,
  fieldName: string,
  operation: { type: 'increment' | 'decrement'; value: number },
  options?: { min?: number; max?: number }
): Promise<{ newValue: number }>;
```

`apps/api/src/shared/content.repository.d1.ts`:

```typescript
async mutateField(
  seed: Seed,
  id: string,
  fieldName: string,
  operation: { type: 'increment' | 'decrement'; value: number },
  options?: { min?: number; max?: number }
): Promise<{ newValue: number }> {
  // 1. Whitelist: fieldName deve essere un branch numerico del seed.
  const branch = seed.branches.find(b => b.alias === fieldName)
  if (!branch || (branch.type !== 'number' && branch.type !== 'integer')) {
    throw new RepositoryError(`mutateField: '${fieldName}' non è un campo numerico di ${seed.slug}`)
  }

  const delta = operation.type === 'increment' ? operation.value : -operation.value
  const table = this.getTableName(seed.slug)   // content_{slug}

  let sql = `UPDATE ${table} SET ${fieldName} = ${fieldName} + ?, updated_at = (unixepoch()) WHERE id = ?`
  const params: any[] = [delta, id]
  if (options?.min !== undefined) { sql += ` AND ${fieldName} + ? >= ?`; params.push(delta, options.min) }
  if (options?.max !== undefined) { sql += ` AND ${fieldName} + ? <= ?`; params.push(delta, options.max) }

  const result = await this.database.prepare(sql).bind(...params).run()
  if (result.meta.changes === 0) {
    throw new RepositoryError(`Operazione atomica fallita: record non trovato o limite superato per ${fieldName}`)
  }

  const updated = await this.database.prepare(`SELECT ${fieldName} AS v FROM ${table} WHERE id = ?`).bind(id).first<{ v: number }>()
  return { newValue: updated!.v }
}
```

> **`mutateField` bypassa i lifecycle hook a livello documento.** È un UPDATE atomico SQL: far
> girare `beforeUpdate`/`afterUpdate` distruggerebbe la garanzia anti-race (richiederebbe un
> read-modify-write applicativo). Da documentare nell'API.

**Mock per i test.** `mutateField` va implementato su **`StaticContentRepository`**
(`apps/api/test/mocks/static-content.repository.ts`, l'implementazione di `ContentRepository`
usata nei test API) — **non** su `InMemorySeedRepository`, che è un `ISeedRepository` (metadati
degli schema, non contenuti). Implementazione mock: lettura del valore corrente, applicazione
del delta, controllo min/max, scrittura in-memory.

---

#### 6. Integrazione degli Errori API (400 / 422)

Oggi `handleContentDatabaseError` (`features/content/handlers/helpers.ts`) mappa solo
`EntryNotFoundError` → 404, `SlugConflictError` → 409, FK → problem dedicato; **ogni altro
errore** (incluso un fallimento di hook) cade nel ramo `500`.

Passi:

1. Definire in `@beechcms/core` una classe d'errore dedicata:

```typescript
// packages/core/src/content.repository.ts (accanto agli altri RepositoryError)
export class HookValidationError extends RepositoryError {
  readonly fields?: Array<{ field: string; message: string }>
  constructor(message: string, fields?: Array<{ field: string; message: string }>) {
    super(message)
    this.name = 'HookValidationError'
    this.fields = fields
  }
}
```

2. Aggiornare `handleContentDatabaseError` per intercettarla e restituire un problem
   strutturato `422` (o `400`) RFC 7807 con `errors` field-level:

```typescript
if (error instanceof HookValidationError) {
  return publicProblem(context, {
    type: 'content-hook-validation-failed',
    title: 'Unprocessable Entity',
    status: 422,
    detail: error.message,
    errors: (error.fields ?? []).map(f => ({ field: f.field, message: f.message })),
  })
}
```

Gli hook utente lanciano `HookValidationError` per i fallimenti di business; qualunque altra
eccezione non gestita continua a mappare su `500` (comportamento corretto).

---

### Checklist di Implementazione (Sprint 1) — corretta

- [x] **core:** `BeechHooks`, `HookContext` (con `repository` + `db: unknown`, **senza** `D1Database`), `HookActor` in `packages/core/src/hooks.ts`, ri-esportati dal barrel.
- [x] **core:** `RepositoryOptions` + aggiunta del parametro opzionale `options?` a `create`/`update`/`delete` nell'interfaccia `ContentRepository`.
- [x] **core:** `mutateField` e `runBatch`/`BatchWrite` nell'interfaccia `ContentRepository`.
- [x] **core:** classe `HookValidationError extends RepositoryError`.
- [x] **api:** `D1ContentRepository` — nuovo costruttore `(database, hooks?)`; esecuzione `before*` prima del `batch` e `after*` dopo; `mutateField` con whitelist `seed.branches` + binding parametrizzati; `runBatch` con singolo `database.batch`.
- [x] **api:** `BeechConfig.hooks` in `factory.ts` propagato a `repositoryMiddleware`; `RepositoryOverrides.hooks` → `new D1ContentRepository(database, overrides?.hooks)`.
- [x] **api:** estrarre `actor` dal JWT negli handler `create`/`update`/`delete` e passarlo via `options`.
- [x] **api:** `handleContentDatabaseError` mappa `HookValidationError` → 422 con `errors[]`.
- [x] **test:** `mutateField` e `runBatch` su **`StaticContentRepository`** (non `InMemorySeedRepository`).
- [x] **test:** `apps/api/test/hooks-lifecycle.test.ts` — (a) mutazione payload via `beforeCreate`; (b) `before*` che lancia `HookValidationError` → nessuna scrittura su DB + 422; (c) `afterCreate` che lancia → dato comunque persistito (documenta il limite no-rollback); (d) anti-race di `mutateField` con guardia `min`.
- [x] **docs:** documentare in `docs/` (api-reference o nuovo file) i tre vincoli: `after*` non fa rollback, `mutateField` bypassa gli hook documento, `runBatch` non esegue hook.
- [x] **Verifica:** `pnpm run build` (tsc) verde su core + api; `pnpm run test` su api.

### Vincoli che restano (non aggirabili)
1. **Nessun rollback per `after*`** su D1 — limite di piattaforma, non del design.
2. **`runBatch` dichiarativo**, non callback interattiva — D1 non ha transazioni interattive.
3. **`mutateField` salta gli hook documento** — necessario per mantenere l'atomicità anti-race.

Nessuno di questi è un blocco: la feature **è implementabile** una volta recepite le correzioni sopra.
