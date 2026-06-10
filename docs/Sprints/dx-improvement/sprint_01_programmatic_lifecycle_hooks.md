## ── Sprint 1: Programmatic Lifecycle Hooks ──

### Problema
L'Automation Engine (Phase 6) esegue azioni asincrone e non bloccanti (es. invio mail, webhook). Se uno sviluppatore ha bisogno di:
- Impedire il salvataggio di un articolo se la data di fine è antecedente alla data di inizio (Validazione di business).
- Calcolare un campo derivato a livello server (es. `fullName = firstName + ' ' + lastName`).
- Modificare i dati di un record prima che vengano persistiti su D1.

Oggi deve riscrivere l'intero endpoint di creazione o aggirare il repository.

### Soluzione proposta
Introdurre un registro di **Lifecycle Hooks** sincroni e asincroni direttamente all'interno della configurazione del server.

#### 1. Definizione dell'Interfaccia degli Hook in `@beechcms/core`
Aggiungere in `packages/core/src/types.ts` le definizioni degli hook:

```typescript
export interface HookContext<T = any> {
  seedSlug: string;
  db: D1Database;
  actor?: { id: string; role: string }; // Utente che esegue l'operazione
}

export interface BeechHooks {
  // Eseguiti PRIMA della scrittura. Se lanciano un errore, la scrittura fallisce e restituisce 400/422.
  beforeCreate?: (entry: any, ctx: HookContext) => Promise<any | void> | any | void;
  beforeUpdate?: (id: string, patches: any, ctx: HookContext) => Promise<any | void> | any | void;
  beforeDelete?: (id: string, ctx: HookContext) => Promise<void> | void;

  // Eseguiti DOPO la scrittura con successo.
  afterCreate?: (entry: any, ctx: HookContext) => Promise<void> | void;
  afterUpdate?: (entry: any, ctx: HookContext) => Promise<void> | void;
  afterDelete?: (id: string, ctx: HookContext) => Promise<void> | void;
}
```

#### 2. Integrazione nel Repository D1
Modificare `D1ContentRepository` in `apps/api/src/shared/content.repository.d1.ts` per accettare gli hook nel costruttore ed eseguirli all'interno delle transazioni SQLite:

```typescript
export class D1ContentRepository implements ContentRepository {
  constructor(
    private db: D1Database,
    private clock: IClock,
    private idGenerator: IIdGenerator,
    private hooks?: BeechHooks
  ) {}

  async create(seedSlug: string, payload: any, actor?: any): Promise<any> {
    let processedPayload = { ...payload };

    if (this.hooks?.beforeCreate) {
      // Eseguiamo l'hook prima del salvataggio. Può modificare il payload o lanciare errori.
      const result = await this.hooks.beforeCreate(processedPayload, { seedSlug, db: this.db, actor });
      if (result) processedPayload = result;
    }

    // Procede con l'inserimento standard su SQLite...
    const createdEntry = await this.dbInsert(seedSlug, processedPayload);

    if (this.hooks?.afterCreate) {
      await this.hooks.afterCreate(createdEntry, { seedSlug, db: this.db, actor });
    }

    return createdEntry;
  }
}
```

#### 3. Supporto ad Aggiornamenti Atomici nel Repository (Prevenzione Race Condition)
Per prevenire conflitti di concorrenza su campi critici come lo stock di magazzino o i saldi degli utenti, il repository esporrà un metodo nativo per mutare i campi numerici in modo atomico, con supporto a guardie di limite (es. non scendere sotto lo zero).

Aggiungere al contratto `ContentRepository` in `packages/core/src/content.repository.ts`:

```typescript
mutateField(
  seedSlug: string,
  id: string,
  fieldName: string,
  operation: { type: 'increment' | 'decrement'; value: number },
  options?: { min?: number; max?: number }
): Promise<{ newValue: number }>;
```

Implementazione in `D1ContentRepository`:

```typescript
async mutateField(
  seedSlug: string,
  id: string,
  fieldName: string,
  operation: { type: 'increment' | 'decrement'; value: number },
  options?: { min?: number; max?: number }
): Promise<{ newValue: number }> {
  const delta = operation.type === 'increment' ? operation.value : -operation.value;
  const table = `content_${seedSlug}`;
  
  let sql = `UPDATE ${table} SET ${fieldName} = ${fieldName} + ? WHERE id = ?`;
  const params: any[] = [delta, id];

  if (options?.min !== undefined) {
    sql += ` AND ${fieldName} + ? >= ?`;
    params.push(delta, options.min);
  }
  if (options?.max !== undefined) {
    sql += ` AND ${fieldName} + ? <= ?`;
    params.push(delta, options.max);
  }

  const result = await this.db.prepare(sql).bind(...params).run();

  if (result.meta.changes === 0) {
    // Il record non esiste oppure la condizione min/max è stata violata (es. stock < 0)
    throw new Error(`Operazione atomica fallita: record non trovato o limite superato per ${fieldName}`);
  }

  // Ritorna il nuovo valore
  const updated = await this.db.prepare(`SELECT ${fieldName} FROM ${table} WHERE id = ?`).bind(id).first<any>();
  return { newValue: updated[fieldName] };
}
```

### Esempio d'uso (Gestione Stock sicura in Stripe Webhook):
```typescript
// Decrementa lo stock di 1 solo se lo stock attuale è >= 1.
// Se due richieste concorrenti arrivano contemporaneamente, SQLite le esegue in coda.
// La seconda fallirà sollevando un errore e garantendo la coerenza del magazzino.
await repo.mutateField('prodotti', productId, 'stock', { type: 'decrement', value: 1 }, { min: 0 });
```

### Checklist di Implementazione (Sprint 1)
- [ ] Creare l'interfaccia `BeechHooks` in `packages/core/src/types.ts`.
- [ ] Aggiungere il metodo `mutateField` all'interfaccia `ContentRepository` e a tutte le sue classi derivate (`D1ContentRepository`, `InMemorySeedRepository` per i test, ecc.).
- [ ] Implementare un meccanismo di transazioni coordinate (`runTransaction` o `batch`) nel repository per consentire modifiche atomiche a più Seed contemporaneamente (es. creazione ordine + decremento stock) sotto un unico rollback in caso di errore.
- [ ] Aggiornare `D1ContentRepository` per eseguire i cicli `before*` e `after*` e implementare `mutateField` con binding SQL parametrizzati sicuri.
- [ ] Gestire i rollback: se un hook `before*` lancia un errore, garantire che nessuna operazione di scrittura venga persistita su D1.
- [ ] Scrivere unit test integrati in `apps/api/test/hooks-lifecycle.test.ts` verificando la mutazione del payload, il blocco delle scritture non valide e il funzionamento anti-race-condition del decremento numerico con limiti.
