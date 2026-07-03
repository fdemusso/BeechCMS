# Feature Brief: Ristrutturazione di Fields & Ottimizzazione di Content-Kanban per Vertical Slice Architecture

| Stato | In Corso (Fields: Risolto | Kanban: Proposto) |
|---|---|
| **Ambito** | Dashboard Client (`apps/dashboard`) |
| **Componenti Chiave** | [FieldDisplay.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/components/fields/FieldDisplay.tsx), [content-kanban](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban), [content-list.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/pages/content-list.tsx) |
| **Riferimenti Architetturali** | [vertical-slice.md](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/docs/vertical-slice.md), [ponytail_arch.md](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/_config/ponytail_arch.md) |

---

## 1. Stato dei Lavori ed Evoluzione

Il modulo `fields` (incluso [FieldDisplay.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/components/fields/FieldDisplay.tsx)) è stato rimosso dalle vertical slice e promosso a Shared Component Library sotto la directory `@/components/fields`. Questo risolve l'accoppiamento improprio di [kanban-card.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/kanban-card.tsx#L4) verso la vecchia feature slice `fields`.

Rimangono da indirizzare alcune violazioni architetturali e organizzative all'interno della vertical slice [content-kanban](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban).

---

## 2. Analisi dei Problemi Rimanenti (Content-Kanban)

1. **Bypassing del Barrel File**: La pagina [content-list.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/pages/content-list.tsx) accede direttamente a moduli interni di `content-kanban` per importare [CardConfigDialog](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/card-config/card-config-dialog.tsx#L27) e lo hook [useKanbanViewConfig](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/hooks/use-kanban-view-config.ts#L7). Ciò viola il principio dell'importazione esclusiva tramite `index.ts`.
2. **Import Cross-Feature di Tipizzazione**: Il file [index.ts](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/index.ts#L2) di `content-kanban` importa l'interfaccia [IViewRegistry](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-toolbar/view-registry.ts#L13) direttamente dalla feature sorella `content-toolbar`, accoppiando in modo rigido le due slice.
3. **Sovra-esposizione di Dettagli Interni**: Il file [index.ts](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/index.ts) della feature esporta funzioni di supporto ed utility per il drag-and-drop (`useKanbanBoard`, `useKanbanDrag`, `positionBetween`, `rebalanceKeys`) che non hanno consumatori esterni e dovrebbero rimanere incapsulate nella slice.
4. **Mancato Rispetto del Layout di Cartelle**: I componenti React si trovano tutti alla radice della feature invece di essere organizzati sotto la cartella `/components` come previsto dalle linee guida del dashboard.

---

## 3. Soluzioni Dettagliate e Piani di Azione

### A. Riorganizzazione Interna dei File (Allineamento VSA)
Spostare tutti i file componenti ed helper di `content-kanban` all'interno di una struttura di cartelle coerente con la sezione 10 di [vertical-slice.md](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/docs/vertical-slice.md):

* **Struttura finale pianificata**:
  ```
  features/content-kanban/
  ├── index.ts                   # Esportazioni pubbliche (pulite e ridotte)
  ├── constants.ts               # Feature constants
  ├── types.ts                   # Tipi della feature
  ├── components/                # Componenti React interni
  │   ├── content-kanban.tsx
  │   ├── kanban-card.tsx
  │   ├── kanban-card-overlay.tsx
  │   ├── kanban-column.tsx
  │   ├── kanban-column-virtualizer.tsx
  │   └── card-config-dialog.tsx # (Spostato da card-config/)
  ├── hooks/                     # Custom hook della feature
  │   ├── use-kanban-columns.ts
  │   ├── use-kanban-column-query.ts
  │   ├── use-kanban-entry-sync.ts
  │   └── use-kanban-view-config.ts
  └── utils/                     # Logiche di drag-and-drop e utilities
      ├── use-kanban-board.ts    # (Spostato da drag/)
      ├── use-kanban-drag.ts     # (Spostato da drag/)
      ├── use-kanban-autoscroll.ts # (Spostato da drag/)
      ├── fractional.ts          # (Spostato da drag/)
      └── kanban-card-display.ts
  ```

### B. Bonifica del Barrel File ([index.ts](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/index.ts))
Modificare l'esportazione pubblica della slice per:
1. **Esportare gli elementi necessari alla pagina**: Aggiungere l'esportazione di [CardConfigDialog](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/card-config/card-config-dialog.tsx#L27) e [useKanbanViewConfig](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-kanban/hooks/use-kanban-view-config.ts#L7).
2. **Nascondere i dettagli di trascinamento e calcolo**: Rimuovere le esportazioni di `useKanbanBoard`, `useKanbanDrag`, `positionBetween`, `rebalanceKeys` e `buildKanbanCardDisplayModel`.
3. **Aggiornare gli Import in [content-list.tsx](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/pages/content-list.tsx)**: Modificare gli import in testa alla pagina per caricare tutti gli elementi da `@/features/content-kanban`:
   ```typescript
   import { ContentKanban, useKanbanEntrySync, CardConfigDialog, useKanbanViewConfig } from "@/features/content-kanban"
   ```

### C. Risoluzione dell'Import Cross-Feature di `IViewRegistry`
Per disaccoppiare `content-kanban` da `content-toolbar`:
1. Spostare la definizione dell'interfaccia [IViewRegistry](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/apps/dashboard/src/features/content-toolbar/view-registry.ts#L13) e del tipo `ViewDefinition` sotto una risorsa condivisa (es. `apps/dashboard/src/features/shared/` o come tipo generico in `@beechcms/core` se applicabile a più moduli).
2. Riferire la nuova interfaccia sia in `content-toolbar` che in `content-kanban`, azzerando la dipendenza diretta tra le due feature.
