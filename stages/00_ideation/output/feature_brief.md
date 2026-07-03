# Feature Brief: Promozione del Modulo Fields da Vertical Slice a Shared Component Library

| Stato | Proposto |
|---|---|
| **Ambito** | Dashboard Client (`apps/dashboard`) |
| **Componenti Chiave** | [FieldDisplay.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/FieldDisplay.tsx), [FieldEdit.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/FieldEdit.tsx), [relation.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/edit/relation.tsx) |
| **Riferimenti Architetturali** | [vertical-slice.md](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/docs/vertical-slice.md), [ponytail_arch.md](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/_config/ponytail_arch.md) |

---

## 1. Contesto e Problema

Nel design attuale di BeechCMS, il modulo `fields` (incluso [FieldDisplay.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/FieldDisplay.tsx)) si trova all'interno della directory delle vertical slice (`apps/dashboard/src/features/fields`).

Questo posizionamento genera diverse criticità architetturali:
1. **Violazione VSA dei Cross-Feature Imports**: Slices verticali isolate (come `content-kanban` ed `entry-editor`) devono necessariamente importare [FieldDisplay](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/FieldDisplay.tsx) e [FieldEdit](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/FieldEdit.tsx) per renderizzare i dati dei singoli campi. Questo viola la regola: *"Never import from apps/dashboard/src/features/<other-feature>/"*.
2. **Accoppiamento Bidirezionale e Circolare**: Il renderer [relation.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/edit/relation.tsx) (figlio di `fields`) deve effettuare query e risolvere schemi, importando direttamente API e costanti da `content-management` e `shared`. Questo crea un ciclo di dipendenze:
   `content-list.tsx` (Page) $\rightarrow$ `content-kanban` (Feature) $\rightarrow$ `fields` (Feature) $\rightarrow$ `content-management` (Feature) $\rightarrow$ `content-list.tsx`.
3. **Mancanza di Astrazione**: `fields` si comporta come una infrastruttura trasversale (Design System/Component Library), ma eredita i vincoli e la forma di una slice di business, senza averne la reale natura.

---

## 2. Obiettivi

* **Isolamento delle Slice**: Rimuovere qualsiasi dipendenza diretta tra fette verticali di business e il modulo dei campi.
* **Astrazione del Component Rendering**: Promuovere `fields` a componente condiviso globale (`Shared/Common Component`).
* **Disaccoppiamento delle API**: Eliminare gli import concreti di client API o chiavi di query esterne da parte dei componenti di visualizzazione dei campi.

---

## 3. Soluzione Proposta (Technical Blueprint)

### A. Riposizionamento nel Monorepo
Il modulo `fields` viene estratto da `features/` e promosso a componente condiviso dell'applicazione:
* **Nuovo Percorso**: `apps/dashboard/src/components/fields/` (accessibile tramite l'alias `@/components/fields`).

### B. Inversione delle Dipendenze tramite React Context
Per evitare che il componente [relation.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/edit/relation.tsx) importi client API di business o hooks da altre slice, viene introdotto un meccanismo di dependency injection a runtime.

1. **Creazione del Contesto (`apps/dashboard/src/components/fields/context.tsx`)**:
```typescript
import * as React from 'react'

export interface FieldsContextType {
  /** Hook per risolvere lo schema/seed attivo */
  useSchemaHook: (slug: string) => { seed: any; isLoading: boolean }
  /** Funzione di ricerca delle relazioni nel database */
  searchRelations: (slug: string, query: string) => Promise<any[]>
}

export const FieldsContext = React.createContext<FieldsContextType | null>(null)

export function useFieldsConfig() {
  const ctx = React.useContext(FieldsContext)
  if (!ctx) {
    throw new Error("useFieldsConfig must be used within a FieldsProvider")
  }
  return ctx
}
```

2. **Consumo del Contesto in [relation.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/fields/edit/relation.tsx)**:
Rimuovere gli import da `@/features/content-management` e consumare i metodi del contesto:
```typescript
import { useFieldsConfig } from "../context"

export function RelationEdit({ branch, value, onChange }: FieldEditProps) {
  const { useSchemaHook, searchRelations } = useFieldsConfig()
  // ... utilizzo delle funzioni iniettate anziché del client API diretto
}
```

3. **Iniezione a Livello Root/Bootstrap**:
Il provider viene configurato nel composition root (`App.tsx` o `main.tsx`) iniettando le API reali definite da `content-management`:
```typescript
import { FieldsContext } from "@/components/fields/context"
import { useActiveSeed } from "@/features/schema"
import { contentApi } from "@/features/content-management"

export function App() {
  return (
    <FieldsContext.Provider value={{
      useSchemaHook: useActiveSeed,
      searchRelations: async (slug, query) => {
        const res = await contentApi.fetchList(slug, { search: query })
        return res.items
      }
    }}>
      <RouterProvider router={router} />
    </FieldsContext.Provider>
  )
}
```

---

## 4. Impatto sul Codice Esistente

* **Import Aggiornati**: Tutti i file che importavano `FieldDisplay` o `FieldEdit` da `@/features/fields` verranno aggiornati per puntare a `@/components/fields`.
* **Architettura Pulita**: Risoluzione immediata del veto architetturale di Ponytail in merito alle dipendenze cross-slice per la visualizzazione dei campi.
* **Testing**: I test unitari dei componenti di rendering (es. `field-display-policy.test.tsx`) potranno girare in modo isolato mockingando semplicemente il `FieldsContext`, senza caricare dipendenze del client API o dello store.
