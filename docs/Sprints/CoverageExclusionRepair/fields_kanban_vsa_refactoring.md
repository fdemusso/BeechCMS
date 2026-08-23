### Pre-Computation Analysis
a) **God Nodes identified via the CLI:**
- `cn()` — 251 connections
- `Button()` — 42 connections
- `publicProblem()` — 33 connections
- `StaticContentRepository` — 23 connections
- `Input()` — 22 connections
- `cleanStr()` — 20 connections
- `createBeechApp()` — 19 connections
- `Env` — 19 connections
- `Card()` — 19 connections
- `CardContent()` — 19 connections
*Also note:* `ContentKanban` has degree 6, `IViewRegistry` has degree 4.

b) **Exact architectural boundaries affected:**
- `@beechcms/core`: Not affected.
- `apps/api`: Not affected.
- `apps/dashboard`: Affected. Specifically:
  - `apps/dashboard/src/features/content-kanban/` (layout restructuring, component and helper folder reorganization, index.ts barrel cleanup).
  - `apps/dashboard/src/features/content-gallery/index.ts` (updated import for `IViewRegistry`).
  - `apps/dashboard/src/features/content-toolbar/` (type extraction of `IViewRegistry`, `ViewDefinition`, and `ToolbarTool` to `shared` folder).
  - `apps/dashboard/src/features/shared/` (new file `view-registry.ts` containing the shared registry types, and export additions in `index.ts`).
  - `apps/dashboard/src/pages/content-list.tsx` (updated imports to load through the proper `content-kanban` barrel file instead of importing internal modules).
  - `apps/dashboard/src/test/` (updated test imports for `kanban-card.test.tsx`, `kanban-card-display.test.ts`, `use-kanban-column-query.test.ts`, `card-config-dialog.test.tsx`).

c) **Output of `graphify affected` impact analysis:**
*Note:* The installed CLI `graphify` version `0.7.15` does not support the `affected` command. However, a manual dependency check using `graphify explain` and `graphify path` on `IViewRegistry` and `ContentKanban` confirms:
1. `ContentKanban` is imported by `content-list.tsx` and exported by `index.ts`.
2. `IViewRegistry` is imported by `content-kanban/index.ts` and `content-gallery/index.ts` from `content-toolbar/view-registry.ts`.
3. `CardConfigDialog` and `useKanbanViewConfig` are imported directly by `content-list.tsx` and the test files, bypassing the barrel.
4. Moving types and fixing imports resolves all VSA violations without introducing any circular dependencies or breaking changes.

### VETO Audit
- **Botanical Dialect check:** Respects the Botanical Invariant. There are zero database queries or D1 operations bypassed because the scope is purely client-side React code in `apps/dashboard`. All client-side communication with the backend is done via existing API modules (`@/lib/content-api`).
- **Vertical Slice Architecture check:** The plan directly addresses two VSA isolation violations:
  1. Removes cross-feature imports between `content-kanban` / `content-gallery` and `content-toolbar` by moving shared registry contracts (`IViewRegistry`, `ViewDefinition`) to `features/shared/view-registry.ts`.
  2. Resolves barrel bypassing by ensuring `content-list.tsx` imports all `content-kanban` exports via the public `@/features/content-kanban` entry point.
- **YAGNI & Minimalist check:** Approved. No new features or layers are added. Only file locations and import statements are corrected to align with the directory layout of Section 10 of `vertical-slice.md`.
- **Verdict:** APPROVED (respects all rules in `ponytail_arch.md` and constraints).
- **Handoff:** `HANDOFF -> caveman_coder`

---

# Sprint Plan: Ristrutturazione di Fields & Ottimizzazione di Content-Kanban per Vertical Slice Architecture

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================
This sprint is critical to enforce architectural boundaries and fix Vertical Slice Architecture (VSA) violations in the dashboard application. Currently, `content-kanban` and `content-gallery` depend on internal components of `content-toolbar` (via direct imports of `IViewRegistry` and `ViewDefinition` from `features/content-toolbar/view-registry.ts`), which tightly couples these features together. Furthermore, the dashboard page `content-list.tsx` bypasses the `content-kanban` barrel file (`index.ts`) by directly importing sub-modules (`card-config-dialog` and `use-kanban-view-config`).

Reorganizing `content-kanban` files into clean subfolders (`components/`, `hooks/`, `utils/`) aligns the feature with the directory structure layout, decreases cognitive load, and cleans up the public API of the feature by exposing only necessary entry points. Moving registry contracts to `features/shared/` enables features to register themselves without direct dependencies on other feature implementations, maintaining Cloudflare and monorepo purity.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================
The existing architecture and context variables are as follows:
- **Client routing and pages**: `apps/dashboard` is built using Vite + React. `apps/dashboard/src/pages/content-list.tsx` is the primary entry point for managing content lists and supports multiple views: table, gallery, and kanban.
- **Cross-feature registry coupling**: Views register themselves using the `viewRegistry` singleton in `content-toolbar/view-registry.ts`. Both `content-kanban` and `content-gallery` import `IViewRegistry` directly from `features/content-toolbar/view-registry.ts`, bypassing barrel files and coupling themselves directly to the toolbar slice.
- **Folder structure of content-kanban**: The components and helpers are flat under `features/content-kanban/` or split into arbitrary subdirectories like `drag/` and `card-config/`, violating section 10 layout recommendations.
- **Exports over-exposure**: `features/content-kanban/index.ts` exports private drag-and-drop helpers (`useKanbanBoard`, `useKanbanDrag`, `positionBetween`, `rebalanceKeys`) that have zero external consumers, violating encapsulation.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================
#### Reorganized Files (Moved):
1. `apps/dashboard/src/features/content-kanban/content-kanban.tsx` -> `apps/dashboard/src/features/content-kanban/components/content-kanban.tsx`
2. `apps/dashboard/src/features/content-kanban/kanban-card.tsx` -> `apps/dashboard/src/features/content-kanban/components/kanban-card.tsx`
3. `apps/dashboard/src/features/content-kanban/kanban-card-overlay.tsx` -> `apps/dashboard/src/features/content-kanban/components/kanban-card-overlay.tsx`
4. `apps/dashboard/src/features/content-kanban/kanban-column.tsx` -> `apps/dashboard/src/features/content-kanban/components/kanban-column.tsx`
5. `apps/dashboard/src/features/content-kanban/kanban-column-virtualizer.tsx` -> `apps/dashboard/src/features/content-kanban/components/kanban-column-virtualizer.tsx`
6. `apps/dashboard/src/features/content-kanban/card-config/card-config-dialog.tsx` -> `apps/dashboard/src/features/content-kanban/components/card-config-dialog.tsx` (removes `card-config/` folder)
7. `apps/dashboard/src/features/content-kanban/drag/use-kanban-board.ts` -> `apps/dashboard/src/features/content-kanban/utils/use-kanban-board.ts`
8. `apps/dashboard/src/features/content-kanban/drag/use-kanban-drag.ts` -> `apps/dashboard/src/features/content-kanban/utils/use-kanban-drag.ts`
9. `apps/dashboard/src/features/content-kanban/drag/use-kanban-autoscroll.ts` -> `apps/dashboard/src/features/content-kanban/utils/use-kanban-autoscroll.ts`
10. `apps/dashboard/src/features/content-kanban/drag/fractional.ts` -> `apps/dashboard/src/features/content-kanban/utils/fractional.ts` (removes `drag/` folder)
11. `apps/dashboard/src/features/content-kanban/kanban-card-display.ts` -> `apps/dashboard/src/features/content-kanban/utils/kanban-card-display.ts`

#### New Files:
12. `apps/dashboard/src/features/shared/view-registry.ts` (holds shared contracts: `IViewRegistry`, `ViewDefinition`, and `ToolbarTool`)

#### Modified Files:
13. `apps/dashboard/src/features/shared/index.ts` (re-exports `view-registry.ts` symbols)
14. `apps/dashboard/src/features/content-toolbar/shared.ts` (uses `ToolbarTool` from shared folder)
15. `apps/dashboard/src/features/content-toolbar/view-registry.ts` (imports types from shared folder)
16. `apps/dashboard/src/features/content-gallery/index.ts` (uses `IViewRegistry` from shared folder)
17. `apps/dashboard/src/features/content-kanban/index.ts` (barrel file updates: registers with shared `IViewRegistry`, cleans exports, references new locations)
18. `apps/dashboard/src/pages/content-list.tsx` (cleans up imports, imports everything from `@/features/content-kanban` barrel)
19. `apps/dashboard/src/test/kanban-card.test.tsx` (updates imports to `components/kanban-card`)
20. `apps/dashboard/src/test/kanban-card-display.test.ts` (updates imports to `utils/kanban-card-display`)
21. `apps/dashboard/src/test/use-kanban-column-query.test.ts` (updates mocks and imports to `utils/kanban-card-display`)
22. `apps/dashboard/src/test/card-config-dialog.test.tsx` (updates imports to `components/card-config-dialog`)

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================
#### 1. Creation of Shared Contracts in `apps/dashboard/src/features/shared/view-registry.ts`
```typescript
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { DashboardView } from '@beechcms/core'

export type ToolbarTool =
  | 'filter'
  | 'sort'
  | 'automation'
  | 'search'
  | 'settings'
  | 'create'

export interface ViewDefinition {
  type: DashboardView
  labelKey: string
  enabledTools: ToolbarTool[]
}

export interface IViewRegistry {
  register(def: ViewDefinition): void
  get(type: DashboardView): ViewDefinition | undefined
  list(): ViewDefinition[]
}
```

Add export statement in `apps/dashboard/src/features/shared/index.ts`:
```typescript
export * from "./view-registry"
```

#### 2. Clean Up `content-toolbar/shared.ts`
Replace the local definition of `ToolbarTool` with:
```typescript
import type { ToolbarTool } from "@/features/shared"
export type { ToolbarTool }
```

#### 3. Update `content-toolbar/view-registry.ts`
Replace local definitions with imports:
```typescript
import type { DashboardView } from '@beechcms/core'
import type { IViewRegistry, ViewDefinition } from '@/features/shared'

export class ViewRegistryImpl implements IViewRegistry {
  private readonly map = new Map<DashboardView, ViewDefinition>()
  register(def: ViewDefinition): void { this.map.set(def.type, def) }
  get(type: DashboardView): ViewDefinition | undefined { return this.map.get(type) }
  list(): ViewDefinition[] { return [...this.map.values()] }
}

export const viewRegistry: IViewRegistry = new ViewRegistryImpl()
```

#### 4. Update `content-gallery/index.ts`
Change line 12:
```typescript
import type { IViewRegistry } from '@/features/shared'
```

#### 5. Restructuring `content-kanban` Barrel File (`apps/dashboard/src/features/content-kanban/index.ts`)
```typescript
export { ContentKanban } from './components/content-kanban'
export { CardConfigDialog } from './components/card-config-dialog'
export { useKanbanViewConfig } from './hooks/use-kanban-view-config'

import type { IViewRegistry } from '@/features/shared'
export function registerContentKanbanView(registry: IViewRegistry): void {
  registry.register({
    type: 'kanban',
    labelKey: 'content.list.kanban',
    enabledTools: ['filter', 'search', 'settings', 'create']
  })
}

export type {
  KanbanCardDisplayModel,
  KanbanColumnModel,
  KanbanColumnFetchState,
  KanbanBoardConfig,
  ContentKanbanProps,
  SavedEntryInfo
} from './types'

export { useKanbanEntrySync } from './hooks/use-kanban-entry-sync'
export * from './constants'
```

#### 6. Spostamento file e aggiornamento import
Ensure all internal files of `content-kanban` reference their relocated dependencies correctly:
- Components (e.g. `content-kanban.tsx`, `kanban-column.tsx`, `kanban-column-virtualizer.tsx`, `kanban-card.tsx`, `kanban-card-overlay.tsx`) import constants/types via `../constants` and `../types`, and internal hooks/utils via relative paths.
- Hooks import constants/types via `../constants` and `../types`, and utilities via `../utils/`.
- Utilities import constants/types via `../constants` and `../types`.

#### 7. Update `apps/dashboard/src/pages/content-list.tsx`
Change lines 27-29:
```typescript
import { ContentKanban, useKanbanEntrySync, CardConfigDialog, useKanbanViewConfig } from "@/features/content-kanban"
```

==========================================================================
SECTION 5 — VALIDATION
==========================================================================
To validate the compilation and testing of the changes:
1. Run ESLint: `pnpm run lint` or `npx eslint apps/dashboard/src`
2. Run Type-Checking: `pnpm run type-check` or `npx tsc --noEmit` in `apps/dashboard/`
3. Run Vitest Tests: `pnpm run test` or `pnpm --filter @beechcms/dashboard test`

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================
- [ ] Direct imports from `content-kanban/card-config/*` or `content-kanban/hooks/*` in `content-list.tsx` are completely removed.
- [ ] `content-kanban` features are structured cleanly under `components/`, `hooks/`, and `utils/` subdirectories.
- [ ] No drag-and-drop internal helpers (`useKanbanBoard`, `useKanbanDrag`, etc.) are exposed in `content-kanban/index.ts`.
- [ ] No direct imports of `content-toolbar` files are present in `content-kanban` or `content-gallery`.
- [ ] `IViewRegistry`, `ViewDefinition` and `ToolbarTool` are defined in `features/shared/view-registry.ts` and successfully exported.
- [ ] `pnpm run type-check` runs without errors.
- [ ] `pnpm run test` runs and all tests pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================
- Adding any new features or behaviors to the Kanban dashboard.
- Modifying styles (CSS) or HTML structure of the layout.
- Making database modifications, SQLite schemas, or backend API changes under `apps/api` or `@beechcms/core`.
- Rewriting tests; only import path corrections in tests are permitted.
