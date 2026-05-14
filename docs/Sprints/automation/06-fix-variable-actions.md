# Sprint 06-Fix: Transitioning to the Variable Action Paradigm

> [!IMPORTANT]
> **Posizionamento Logico**: Questo piano di implementazione si colloca come cerniera architetturale tra il Task 9 e il Task 10 dello Sprint 06. Sostituisce integralmente la gestione a blocco separato (`context`) a favore di un'architettura puramente sequenziale basata su Azioni di primo livello.

---

## 1. Visione Architetturale e Filosofia

In BeechCMS, un'Automazione è concettualmente configurata come una **"Vista SQL con gli steroidi"**. Nelle architetture tradizionali, i dati secondari o correlati debolmente verrebbero gestiti aggiungendo chiavi esterne (`FOREIGN KEY`) o viste fisse a livello di schema relazionale. In BeechCMS, il sistema promuove la flessibilità disaccoppiando le entità tramite una sintesi dei dati al volo (Pipeline JOIN).

### Il Cambio di Paradigma
- **Vecchio Approccio (Sprint 06 originario)**: Prevedeva un array radice `context` parallelo ad `actions`. Questo richiedeva pesanti modifiche allo schema D1 (`ALTER TABLE`), logiche di validazione incrociate complesse e costringeva gli autori a utilizzare un mini-linguaggio di template astruso ed error-prone (es. `{{customers:byid({{this.customer_id}}):name}}`).
- **Nuovo Approccio (06-Fix)**: Abolisce totalmente il blocco radice `context`. Introduce una nuova Azione nativa di primo livello denominata **`set_variable`**. Sfruttando la natura puramente sequenziale dell'array `actions`, l'Azione #1 interroga il database e inietta il risultato nel contesto condiviso, rendendolo immediatamente fruibile dall'Azione #2 (es. `send_mail` o `webhook`) con una sintassi pulitissima e naturale (es. `{{cliente.name}}`).

### Vocabolario Nativo del Botanical Engine
Per garantire coerenza assoluta con il dominio del CMS, il parametro di cardinalità rispecchia rigorosamente la tassonomia del motore:
- **`fruit`**: Rappresenta il singolo record/frutto sintetizzato da un Seed. La variabile si comporterà come un normale record JavaScript.
- **`branch`**: Rappresenta un intero ramo/collezione di record estratti. Poiché l'accesso diretto a una lista testuale non avrebbe senso, la variabile espone automaticamente sotto-rami aggregati di altissimo valore (es. `.count`, `.sum.field`, `.pluck.field`).

---

## 2. Integrazione con il Knowledge Graph (Graphify)

Consultando la topologia del Knowledge Graph (`graphify-out/GRAPH_REPORT.md`), il nuovo design si interfaccia in modo pulito ed efficiente con le seguenti astrazioni portanti:
- **Core Engine Abstractions**: L'esecutore dipende interamente da `ContentRepository` (God Node #10) e da `getSeed()` per la validazione e l'interrogazione dei Seed bersaglio.
- **UI Layer Communities**: Sfrutta le primitive esistenti `cn()` (God Node #1), `Button()` (God Node #2) e i pattern consolidati nella Community `C6` (Dashboard Widgets) e `C52` (Automations API) per il rendering nativo delle schede azione nell'editor visivo.

---

## 3. Struttura del Payload JSON

L'azione si integra in modo trasparente e retrocompatibile nella colonna JSON testuale `actions` esistente nel database D1:

```jsonc
"actions": [
  // Azione 1. Esecuzione della Pipeline JOIN: Carica il Frutto (Singolo Cliente)
  {
    "type": "set_variable",
    "name": "cliente",
    "seed_slug": "clienti",
    "load_type": "fruit",
    "filters": [
      { "field": "id", "operator": "eq", "value": "{{this.customer_id}}" }
    ]
  },
  // Azione 2. Esecuzione della Pipeline JOIN: Carica il Ramo (Ordini Attivi del Cliente)
  {
    "type": "set_variable",
    "name": "ordini_attivi",
    "seed_slug": "ordini",
    "load_type": "branch",
    "filters": [
      { "field": "customer_id", "operator": "eq", "value": "{{cliente.id}}" },
      { "field": "status", "operator": "eq", "value": "pagato" }
    ]
  },
  // Azione 3. Consumo Trasparente nei Template
  {
    "type": "send_mail",
    "to": "{{cliente.email}}",
    "subject": "Riepilogo per {{cliente.name}}",
    "body_template": "Hai completato {{ordini_attivi.count}} ordini per un totale di {{ordini_attivi.sum.total}}€."
  }
]
```

---

## 4. Deliverables e Piano di Lavoro Dettagliato

### [x] Task A: Estensione dei Tipi Core
**File**: `packages/core/src/automations.types.ts`
- Rimuovere completamente le vecchie interfacce `AutomationContextLoad` e la proprietà `context` dal tipo radice `Automation`.
- Definire l'interfaccia `SetVariableAction` estendendo l'unione `AutomationAction`:
  ```typescript
  export interface SetVariableAction {
    type: 'set_variable'
    name: string
    seed_slug: string
    load_type: 'fruit' | 'branch'
    filters: TriggerCondition[]
    order_by?: string
    order?: 'asc' | 'desc'
  }
  ```

### [x] Task B: Pulizia delle Migrazioni D1
**File**: `apps/api/migrations/`
- Bloccare o eliminare la migrazione `0030_automations_context.sql`. Il passaggio al paradigma basato sulle Azioni azzera la necessità di eseguire mutazioni strutturali (`ALTER TABLE`) sul database. Considera che il database attuale è puramente di testing puoi fare un drop diretto della colonna aggiusta per annulare l operazione creata da 0030 e ricordarti di A cancellare 0030, B rimuovere alter table identico da 0000 e poi rimuovere dal json di esecuzione delle migrazioni i riferimenti alla 0030 

### [ ] Task C: Schema di Validazione Zod (CRUD API)
**File**: `apps/api/src/features/automations/automations.schema.ts`
- Estendere lo schema `automationActionSchema` per supportare la validazione rigorosa del nuovo blocco:
  ```typescript
  export const setVariableActionSchema = z.object({
    type: z.literal('set_variable'),
    name: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/),
    seed_slug: z.string().min(1),
    load_type: z.enum(['fruit', 'branch']),
    filters: z.array(triggerConditionSchema).default([]),
    order_by: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
  })
  ```

### [ ] Task D: Implementazione dell'Esecutore Dedicato
**File**: `apps/api/src/features/automations/action-executors/set-variable.executor.ts`
- Implementare la logica contrattuale di estrazione dati e iniezione nel contesto condiviso:
  ```typescript
  import type { SetVariableAction, ContentRepository } from '@beechcms/core'
  import { interpolate } from '../automation-runner.utils'

  export async function executeSetVariable(
    action: SetVariableAction,
    ctx: {
      entry: Record<string, unknown>
      variables: Record<string, unknown>
      repository: ContentRepository
      getSeed: (slug: string) => any
    }
  ): Promise<void> {
    const targetSeed = ctx.getSeed(action.seed_slug)
    if (!targetSeed) {
      console.warn(`[set_variable] Seed bersaglio "${action.seed_slug}" inesistente. Variabile "${action.name}" impostata a null.`)
      ctx.variables[action.name] = action.load_type === 'fruit' ? null : { count: 0, sum: {}, avg: {}, pluck: {} }
      return
    }

    // 1. Risoluzione dinamica dei filtri tramite lo scope unificato
    const unifiedScope = { this: ctx.entry, ...ctx.variables }
    const resolvedFilters = action.filters.map(f => ({
      ...f,
      value: typeof f.value === 'string' ? interpolate(f.value, unifiedScope) : f.value
    }))

    // 2. Traduzione in gruppi di filtri nativi ed esecuzione della query
    // (Utilizza l'helper condiviso conditionToFilterGroup)
    const filterGroups = /* conversione dei resolvedFilters */ []
    const results = await ctx.repository.findMany(targetSeed, {
      filters: filterGroups,
      sort: action.order_by ? { field: action.order_by, direction: action.order ?? 'desc' } : undefined,
      pagination: { page: 1, limit: action.load_type === 'fruit' ? 1 : 1000 }
    })

    // 3. Sintesi e iniezione nel dizionario variables
    if (action.load_type === 'fruit') {
      ctx.variables[action.name] = results.items[0] ?? null
    } else {
      const items = results.items
      const sum: Record<string, number> = {}
      const avg: Record<string, number> = {}
      const pluck: Record<string, string> = {}

      // Identificazione rami numerici e testuali per pre-calcolo
      // ...logica di scansione rami...
      
      ctx.variables[action.name] = {
        count: items.length,
        sum,
        avg,
        pluck
      }
    }
  }
  ```

### [ ] Task E: Refactoring del Runner e dell'Interpolazione
**File**: `apps/api/src/features/automations/automation-runner.ts` e `automation-runner.utils.ts`
- Inizializzare `const variables: Record<string, unknown> = {}` ad ogni ciclo di automazione.
- Passare il riferimento a `variables` ad ogni esecutore.
- Semplificare `interpolate` affinché operi nativamente sul dizionario esteso:
  ```typescript
  const contextMerged = {
    this: ctx.entry,
    ...ctx.variables
  }
  ```

### [ ] Task F: Dashboard UI ed Ergonomia Visuale
**Cartella**: `apps/dashboard/src/features/automations/components/`
- Creare il componente visivo `SetVariableForm.tsx` per consentire agli editor di configurare l'azione con facilità.
- Implementare il completamento automatico intelligente (IntelliSense UI) all'interno degli input basati su Tiptap/Shadcn: l'editor analizza l'array `actions` corrente e inietta automaticamente nel menu a tendina tutte le variabili definite nei blocchi `set_variable` posizionati prima dell'azione in corso.

### [ ] Task G: Suite di Test e Validazione
**Cartella**: `apps/api/src/features/automations/__tests__/`
- Sviluppare `set-variable.executor.test.ts` con una copertura esaustiva:
  - Estrazione corretta di un singolo *Fruit* in base all'ID dinamico.
  - Generazione accurata delle metriche `.count`, `.sum` e `.pluck` per un *Branch*.
  - Comportamento resiliente e degradazione sicura in caso di filtri a vuoto o riferimenti mancanti.

---

## 5. Criteri di Accettazione (Acceptance Criteria)

- [ ] L'Azione `set_variable` viene salvata, validata ed eseguita nativamente all'interno del monorepo senza mutare la struttura relazionale D1.
- [ ] L'interfaccia contrattuale modella fedelmente i concetti del Botanical Engine (`load_type` accetta unicamente `"fruit"` o `"branch"`).
- [ ] Le azioni successive accedono con successo alle proprietà di un *Fruit* (`{{var.name}}`) e alle metriche di un *Branch* (`{{var.count}}`, `{{var.sum.total}}`) tramite una sintassi pulita ed ergonomica.
- [ ] In caso di assenza di risultati, la variabile degrada in modo predicibile e sicuro a `null` o a un blocco contatori a zero, prevenendo qualsiasi interruzione di esecuzione.
- [ ] La Dashboard espone una scheda utente chiara e intuitiva, fornendo i menu di selezione Seed e il costruttore di filtri con un'esperienza coerente al resto del sistema.
