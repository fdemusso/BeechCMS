# Sprint 06-Fix: Transitioning to the Variable Action Paradigm

> [!IMPORTANT]
> **Posizionamento Logico**: Questo piano di implementazione si colloca come cerniera architetturale tra il Task 9 e il Task 10 dello Sprint 06. Sostituisce integralmente la gestione a blocco separato (`context`) a favore di un'architettura puramente sequenziale basata su Azioni di primo livello.

---

## 1. Visione Architetturale e Filosofia

In BeechCMS, un'Automazione è concettualmente configurata come una **"Vista SQL con gli steroidi"**. Invece di costringere il modello dati relazionale ad adottare vincoli o chiavi esterne per correlazioni puramente operative (es. notificare il cliente di un carrello abbandonato), il sistema si affida a una sintesi dei dati al volo (Pipeline JOIN).

### Il Cambio di Paradigma
- **Vecchio Approccio (Sprint 06 originario)**: Prevedeva un array radice `context` parallelo ad `actions`, richiedendo modifiche allo schema D1 (`ALTER TABLE`), logiche di parsing complesse e costringendo gli autori a una grammatica astrusa nei template.
- **Nuovo Approccio (06-Fix)**: Abolisce il blocco radice `context`. Introduce una nuova Azione nativa denominata **`set_variable`**. Essendo le azioni eseguite in sequenza deterministica, l'Azione #1 può estrarre un set di dati e salvarlo in una variabile, rendendolo immediatamente consumabile dall'Azione #2 (es. `send_mail` o `webhook`) con una pulizia sintattica assoluta.

### Vocabolario Nativo del Botanical Engine
Il parametro di cardinalità rispecchia rigorosamente la tassonomia del motore:
- **`fruit`**: Il singolo record/frutto sintetizzato da un Seed.
- **`branch`**: Un intero ramo/collezione di record estratti, esposto sotto forma di metriche e aggregati pronti all'uso.

---

## 2. Integrazione con il Knowledge Graph (Graphify)

Consultando l'infrastruttura del Knowledge Graph (`graphify-out/GRAPH_REPORT.md`), il nuovo flusso si innesta sui seguenti nodi portanti:
- **Core Abstractions**: Interagisce in modo diretto con il `ContentRepository` (God Node #10) per interrogare i Seed bersaglio in isolamento.
- **UI Layer Communities**: Sfrutta le primitive esistenti `cn()` (God Node #1), `Button()` (God Node #2) e i layout consolidati nella Community `C6` (Dashboard Widgets) e `C52` (Automations API) per il rendering delle schede azione.

---

## 3. Struttura del Payload JSON

L'azione si integra in modo retrocompatibile nella colonna testuale JSON `actions` esistente nel database D1:

```jsonc
"actions": [
  // 1. Esecuzione della Pipeline JOIN: Carica il Frutto (Singolo Cliente)
  {
    "type": "set_variable",
    "name": "cliente",
    "seed_slug": "clienti",
    "load_type": "fruit",
    "filters": [
      { "field": "id", "operator": "eq", "value": "{{this.customer_id}}" }
    ]
  },
  // 2. Esecuzione della Pipeline JOIN: Carica il Ramo (Ordini Attivi del Cliente)
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
  // 3. Consumo Trasparente nei Template
  {
    "type": "send_mail",
    "to": "{{cliente.email}}",
    "subject": "Riepilogo per {{cliente.name}}",
    "body_template": "Hai completato {{ordini_attivi.count}} ordini per un totale di {{ordini_attivi.sum.total}}€."
  }
]
```

---

## 4. Deliverables e Piano di Lavoro

### [ ] Task A: Estensione dei Tipi Core
**File**: `packages/core/src/automations.types.ts`
- Rimuovere le definizioni di `AutomationContextLoad` e l'attributo `context` sull'interfaccia `Automation`.
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

### [ ] Task B: Pulizia Migrazioni D1
**File**: `apps/api/migrations/`
- Interrompere o eliminare la migrazione pianificata `0030_automations_context.sql`. Non è necessaria alcuna operazione di `ALTER TABLE`.

### [ ] Task C: Implementazione dell'Esecutore Dedicato
**File**: `apps/api/src/features/automations/action-executors/set-variable.executor.ts`
- Creare il nuovo esecutore per `set_variable` che riceve l'`ActionContext`.
- Logica di esecuzione:
  1. Interpolare dinamicamente i valori di `filters[*].value` usando lo stato corrente.
  2. Eseguire `contentRepository.findMany` sul Seed bersaglio.
  3. Se `load_type === 'fruit'`: salvare `items[0] ?? null` nel dizionario `ctx.variables[action.name]`.
  4. Se `load_type === 'branch'`: calcolare e salvare un oggetto contenente:
     - `count`: `items.length`
     - `sum`: mappa derivata sommando i rami numerici.
     - `avg`: mappa derivata delle medie.
     - `pluck`: dizionario di liste testuali troncate a 100 elementi.

### [ ] Task D: Refactoring dell'Interpolazione (Interpolate v2)
**File**: `apps/api/src/features/automations/automation-runner.utils.ts`
- Aggiornare `ActionContext` per includere `variables: Record<string, unknown>`.
- Ottimizzare la funzione `interpolate` affinché accetti un unico dizionario unito:
  ```typescript
  const templateScope = {
    this: ctx.entry,
    ...ctx.variables
  }
  ```
- Ciò garantisce che ogni esecutore a valle risolva i percorsi puntati senza alcuna grammatica speciale (es. `{{cliente.name}}`).

### [ ] Task E: Dashboard UI e IntelliSense Dinamico
**Cartella**: `apps/dashboard/src/features/automations/components/`
- Creare il componente `SetVariableForm.tsx` (scheda per l'editor visivo basata su `react-hook-form` e componenti UI Shadcn).
- Integrare l'IntelliSense UI (menu a tendina o popover per inserire le variabili) affinché legga in tempo reale l'array `actions` in fase di stesura: qualsiasi azione di tipo `set_variable` che precede l'azione attiva inietta le sue chiavi esposte tra i suggerimenti.

### [ ] Task F: Suite di Test
**Cartella**: `apps/api/src/features/automations/__tests__/`
- Scrivere `set-variable.executor.test.ts` per validare l'estrazione corretta di un *Fruit* e di un *Branch* con aggregati calcolati.
- Verificare la resilienza contro Seed mancanti o filtri vuoti (degrado sicuro a `null` o `0` senza eccezioni bloccanti).

---

## 5. Criteri di Accettazione

- [ ] L'azione `set_variable` viene salvata ed eseguita in modo nativo e sequenziale senza alterare la colonna D1.
- [ ] Il vocabolario del motore si riflette perfettamente nei tipi (`load_type` accetta esclusivamente `'fruit'` o `'branch'`).
- [ ] Un'azione a valle (es. invio email) risolve con successo i campi di un *Fruit* (`{{var.field}}`) e gli aggregati di un *Branch* (`{{var.count}}`, `{{var.sum.x}}`).
- [ ] L'editor UI consente l'inserimento dell'azione visivamente, offrendo i campi del filtro tramite i pattern consolidati nel CMS.
