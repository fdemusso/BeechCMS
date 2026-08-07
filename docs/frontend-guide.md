---
title: Frontend Integration Guide
group: User & Builder Guide
category: Frontend & APIs
---

# Frontend Guide — Beech CMS Dashboard

This document describes the architecture of the React dashboard: how the FieldRenderers registry decouples UI from schema, how TanStack Query manages server state, how the Tailwind 4 + Shadcn component system is composed, and the precise steps required to add a new field type without touching any existing view code.

---

## Table of Contents

1. [Overview](#1-overview)
2. [The FieldRenderers Registry Pattern](#2-the-fieldrenderers-registry-pattern)
    - [The Problem It Solves](#21-the-problem-it-solves)
    - [Props Contracts](#22-props-contracts)
    - [The Registry](#23-the-registry)
    - [Entry Points: FieldDisplay & FieldEdit](#24-entry-points-fielddisplay--fieldedit)
    - [Behaviour Per Type](#25-behaviour-per-type)
3. [TanStack Query — Server State Strategy](#3-tanstack-query--server-state-strategy)
    - [Query Key Architecture](#31-query-key-architecture)
    - [Mutations & Cache Invalidation](#32-mutations--cache-invalidation)
    - [Stale Times & Refetch Policy](#33-stale-times--refetch-policy)
4. [Component System: Tailwind 4 + Shadcn](#4-component-system-tailwind-4--shadcn)
    - [The `cn` Utility](#41-the-cn-utility)
    - [Shadcn Primitives & the `data-slot` Pattern](#42-shadcn-primitives--the-data-slot-pattern)
    - [CVA for Variant Components](#43-cva-for-variant-components)
5. [The EntryEditorPage — Putting It Together](#5-the-entryeditorpage--putting-it-together)
6. [How to Add a New Field Type](#6-how-to-add-a-new-field-type)
7. [Content Views — Toolbar, Table & Gallery](#7-content-views--toolbar-table--gallery)
   - [ContentToolbar Architecture](#71-contenttoolbar-architecture)
   - [How Filters Derive from Seed.branches](#72-how-filters-derive-from-seedbranches)
   - [Gallery & Toolbar Integration](#73-gallery--toolbar-integration)
8. [Widget Data Layer](#8-widget-data-layer)
   - [Purpose & Design Goals](#81-purpose--design-goals)
   - [Feature Slice Structure](#82-feature-slice-structure)
   - [Types](#83-types)
   - [React Hooks](#84-react-hooks)
   - [Client-Side Formula Evaluation](#85-client-side-formula-evaluation)
   - [Pilot Widgets](#86-pilot-widgets)
   - [How to Add a New Widget](#87-how-to-add-a-new-widget)
   - [Dashboard Renderer & Widget Registry](#88-dashboard-renderer--widget-registry)
9. [Dashboard Seed Config — Sidebar & UI Behaviour](#9-dashboard-seed-config--sidebar--ui-behaviour)
   - [How it works](#91-how-it-works)
   - [Icon Registry](#92-icon-registry)
   - [Sidebar Grouping](#93-sidebar-grouping)
   - [Feature Toggles](#94-feature-toggles)
   - [Adding a new icon](#95-adding-a-new-icon)
10. [Authentication Context & In-Memory Token](#10-authentication-context--in-memory-token)
    - [Overview](#101-overview)
    - [Files](#102-files)
    - [AuthProvider Lifecycle](#103-authprovider-lifecycle)
    - [useAuth() Hook](#104-useauth-hook)
    - [ProtectedRoute](#105-protectedroute)
    - [Axios Interceptors](#106-axios-interceptors)

---

## 1. Overview

The dashboard is a React + Vite SPA served from `apps/dashboard`. It communicates exclusively with the Hono API over HTTP — there is no direct database access. Its primary responsibilities are:

- Rendering content forms and tables **driven entirely by the `Seed` schema** from `@beechcms/core`, not by hardcoded layouts.
- Managing all server state through **TanStack Query**, with typed query keys and deterministic cache invalidation.
- Exposing a **pluggable field rendering system** that allows new data types to be added without modifying existing view code.

The dashboard follows the **Vertical Slice Architecture** transition described in `docs/architecture.md`. New feature code belongs in `apps/dashboard/src/features/<feature-name>/` with an `index.ts` public API. Shared UI primitives live in `components/ui/`. The FieldRenderers system lives in `features/fields/` as a dedicated slice because it is consumed by multiple features (the table view, the entry editor, and the gallery peek panel).

---

## 2. The FieldRenderers Registry Pattern


### 2.1 The Problem It Solves

Before the FieldRenderers were introduced, the table view and the edit dialog both contained large `switch (branch.type)` blocks to determine which input or display component to render for each field. Every new `BranchType` required modifying both files. This is a classic **shotgun surgery** code smell — one logical change forces edits in multiple unrelated locations.

The registry pattern replaces every `switch` with two lookup maps. Adding a new type means creating two components and registering them in one file. No existing view file is touched.


**Before (coupled) — each view owns its own dispatch logic:**

```tsx
// Table.tsx — had to be updated for every new type
switch (branch.type) {
   case 'text':     return <span>{value}</span>;
   case 'number':   return <span>{Number(value).toLocaleString()}</span>;
   case 'richtext': return <span>{stripHtml(value)}</span>;
        // Adding 'url' meant editing THIS file AND EntryEditorPage.tsx
}
```

**After (registry) — views are permanently decoupled from type logic:**

    FieldDisplay.tsx  ──→  registry.ts  ──→  display/text.tsx
                                         ──→  display/number.tsx
                                         ──→  display/richtext.tsx
                                         ──→  display/url.tsx       ← new type: zero view changes

    FieldEdit.tsx     ──→  registry.ts  ──→  edit/text.tsx
                                         ──→  edit/number.tsx
                                         ──→  edit/richtext.tsx
                                         ──→  edit/url.tsx          ← same: zero view changes

The dispatch is entirely owned by `getDisplayComponent(branch.type)` and
`getEditComponent(branch.type)` in `registry.ts`. No view file (`Table`,
`EntryEditorPage`, `GalleryPeekPanel`) contains any knowledge of individual
field types.

### 2.2 Props Contracts

All display and edit components share a minimal, stable interface defined in `features/fields/types.ts`:

```typescript
// features/fields/types.ts

export interface FieldDisplayProps {
   branch: Branch;        // Full Branch definition (alias, label, type, format, options…)
   value: unknown;        // Sourced from entry.data[branch.alias]
   maxLength?: number;    // Optional truncation hint for text/json in table cells
}

export interface FieldEditProps {
   branch: Branch;        // Full Branch definition
   value: unknown;        // Current form state value
   onChange: (value: unknown) => void;  // Controlled component callback
}
```

The `Branch` type comes directly from `@beechcms/core/src/types.ts`. A field renderer never fetches data — it only renders what it receives. This makes every renderer independently unit-testable in isolation.

### 2.3 The Registry

`features/fields/registry.ts` contains the two maps and their accessor functions:

```typescript
// features/fields/registry.ts

import type { ComponentType } from 'react';
import type { BranchType } from '@beechcms/core';
import type { FieldDisplayProps, FieldEditProps } from './types';

// --- Display renderers (read-only) ---
import { TextDisplay }    from './display/text';
import { NumberDisplay }  from './display/number';
import { BooleanDisplay } from './display/boolean';
import { DateDisplay }    from './display/date';
import { JsonDisplay }    from './display/json';
import { RichtextDisplay } from './display/richtext';
import { MediaDisplay }   from './display/media';
import { DefaultDisplay, DefaultEdit } from './default';

// --- Edit renderers ---
import { TextEdit }    from './edit/text';
import { NumberEdit }  from './edit/number';
import { BooleanEdit } from './edit/boolean';
import { DateEdit }    from './edit/date';
import { JsonEdit }    from './edit/json';
import { RichtextEdit } from './edit/richtext';
import { MediaEdit }   from './edit/media';

export const displayRegistry: Partial<Record<BranchType, ComponentType<FieldDisplayProps>>> = {
   text:     TextDisplay,
   number:   NumberDisplay,
   boolean:  BooleanDisplay,
   date:     DateDisplay,
   json:     JsonDisplay,
   richtext: RichtextDisplay,
   file:     MediaDisplay,
};

export const editRegistry: Partial<Record<BranchType, ComponentType<FieldEditProps>>> = {
   text:     TextEdit,
   number:   NumberEdit,
   boolean:  BooleanEdit,
   date:     DateEdit,
   json:     JsonEdit,
   richtext: RichtextEdit,
   file:     MediaEdit,
};

// Returns the registered display component, or DefaultDisplay for unknown types
export function getDisplayComponent(type: BranchType): ComponentType<FieldDisplayProps> {
   return displayRegistry[type] ?? DefaultDisplay;
}

// Returns the registered edit component, or DefaultEdit for unknown types
export function getEditComponent(type: BranchType): ComponentType<FieldEditProps> {
   return editRegistry[type] ?? DefaultEdit;
}
```

The `Partial<Record<BranchType, ...>>` type is intentional. Unregistered types silently fall back to `DefaultDisplay` (renders `unknown` as a string or `—`) and `DefaultEdit` (renders a plain `<input type="text">`). This makes the system **fail-safe** by design: a new `BranchType` added to `@beechcms/core` without a corresponding renderer will still produce a usable, non-crashing UI.

### 2.4 Entry Points: FieldDisplay & FieldEdit

The two public entry points are thin delegators. They perform the registry lookup and forward all props to the resolved component:

```typescript
// features/fields/FieldDisplay.tsx
import { getDisplayComponent } from './registry';
import type { FieldDisplayProps } from './types';

export function FieldDisplay(props: FieldDisplayProps) {
   const { branch } = props;
   const Component = getDisplayComponent(branch.type);
   return <Component {...props} />;
}

// features/fields/FieldEdit.tsx
import { getEditComponent } from './registry';
import type { FieldEditProps } from './types';

export function FieldEdit(props: FieldEditProps) {
   const { branch } = props;
   const Component = getEditComponent(branch.type);
   return <Component {...props} />;
}
```

Consumers never import display or edit sub-modules directly. They always import from the barrel:

```typescript
import { FieldDisplay, FieldEdit } from '@/features/fields';
import type { FieldDisplayProps, FieldEditProps } from '@/features/fields';
// Advanced: access the registry directly
import { getDisplayComponent, getEditComponent } from '@/features/fields';
```

### 2.5 Behaviour Per Type

| Type | `FieldDisplay` behaviour | `FieldEdit` behaviour |
|---|---|---|
| `text` | Truncated text via `ExpandableCell` (default 50 chars) | `<Input type="text">` — sanitized string |
| `number` | `Intl.NumberFormat` (`it-IT`, max 2 decimal places) | `<Input type="number" step="any">` |
| `boolean` | Badge: green `Sì` / grey `No` | `<Checkbox>` with label |
| `date` | `toLocaleDateString('it-IT', { year, month: 'short', day })` | `<Input type="date">` |
| `json` | Coloured collapsible tag badges; other values: truncated monospace. If `branch.options` is set, shows clickable preset badges | `<Textarea>` with JSON hint; if `branch.options` present, shows pre-defined badges as add/remove shortcuts |
| `richtext` | Plain text (HTML stripped), truncated via `ExpandableCell` | Full TipTap editor (Bold, Italic, H2, Bullet List, Ordered List, Link, Table, Math) |
| `file` | Thumbnail if URL resolves to an image; file icon otherwise. | Dropzone upload, image preview, Replace / Remove actions. |
| *(unregistered)* | `DefaultDisplay` — string or `—` | `DefaultEdit` — `<Input type="text">` |

The `richtext` edit renderer is implemented in `features/richtext-editor/` as a vertical slice and re-exported via a thin wrapper at `features/fields/edit/richtext.tsx`. This is the VSA pattern in action: the complex TipTap logic is self-contained in its slice; the registry consumes only the public API.

---

## 3. TanStack Query — Server State Strategy

TanStack Query v5 manages all remote data. There is a strict rule: **no server state in Zustand or React context**. Server data lives in the Query cache. Local UI state (open modals, selected rows, filter inputs) lives in `useState` or Zustand.

### 3.1 Query Key Architecture

Query keys are defined as typed constants centralized in shared modules to avoid cross-slice import inversions, not scattered as inline strings. For example, dashboard keys live in a shared dictionary:

```typescript
// features/shared/query-keys.ts

export const DASHBOARD_QUERY_KEYS = {
  all: ["dashboard"] as const,
  stats: () => [...DASHBOARD_QUERY_KEYS.all, "stats"] as const,
  cloudflare: () => [...DASHBOARD_QUERY_KEYS.all, "cloudflare"] as const,
  activity: () => [...DASHBOARD_QUERY_KEYS.all, "activity"] as const,
  health: () => [...DASHBOARD_QUERY_KEYS.all, "health"] as const,
  breakdown: () => [...DASHBOARD_QUERY_KEYS.all, "breakdown"] as const,
  setupChecklist: () => [...DASHBOARD_QUERY_KEYS.all, "setup-checklist"] as const,
} as const
```

For content data, the key hierarchy follows `[resource, operation, ...params]`:

```typescript
// Recommended pattern for content feature hooks
export const CONTENT_QUERY_KEYS = {
   all:    (seed: string) => ['content', seed]              as const,
   list:   (seed: string, query: ContentQuery) => ['content', seed, 'list', query] as const,
   detail: (seed: string, id: string)          => ['content', seed, 'detail', id]  as const,
};
```

**Why typed constants matter:** String-based query keys fail silently — a typo in an `invalidateQueries` call means stale data is never evicted. Typed constants produce a compile error.

### 3.2 Mutations & Cache Invalidation

After a mutation (create, update, delete), the cache is invalidated at the broadest appropriate key scope. Invalidating `['content', seed]` evicts both the list and any open detail queries for that seed, forcing a refetch:

```typescript
// Pattern used across content management hooks
export function useCreateContent(seed: string) {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: (payload: ContentPayload) => contentApi.create(seed, payload),
      onSuccess: () => {
         // Invalidate all queries for this seed — list + details
         queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all(seed) });
      },
   });
}

export function useUpdateContent(seed: string, id: string) {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: (payload: ContentPayload) => contentApi.update(seed, id, payload),
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all(seed) });
      },
   });
}

export function useDeleteContent(seed: string) {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: (id: string) => contentApi.delete(seed, id),
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.all(seed) });
      },
   });
}
```

### 3.3 Stale Times & Refetch Policy

| Hook | `staleTime` | `refetchInterval` | Rationale |
|---|---|---|---|
| `useDashboardStats` | `5 * 60 * 1000` (5 min) | — | Stats are not real-time; excessive refetch wastes D1 quota |
| `useRecentActivity` | `60 * 1000` (1 min) | `60 * 1000` | Activity feed should update periodically without user action |
| `useSystemHealth` | `5 * 60 * 1000` | — | Health check is low-frequency |
| `useCloudflareStats` | `5 * 60 * 1000` | — | Edge analytics data is not sub-minute accurate |
| Content list queries | `0` (default) | — | Always fresh after navigation; invalidated on mutation |

The `staleTime: 5 * 60 * 1000` pattern seen in `use-dashboard-stats.ts` is intentional — dashboard widgets fetch once per mount and refresh every 5 minutes, not on every re-render or window focus event.

---

## 4. Component System: Tailwind 4 + Shadcn

The dashboard uses **Tailwind CSS v4** with **Shadcn/ui** primitives, layered on **Radix UI** headless components. This stack was chosen for three reasons:
1. **Zero runtime** — Tailwind generates static CSS; no runtime style injection.
2. **Accessibility by default** — Radix handles focus management, keyboard navigation, and ARIA attributes.
3. **Composability** — each primitive is a thin wrapper around Radix that applies the design system tokens without locking down the DOM structure.

### 4.1 The `cn` Utility

All components use the `cn` utility from `lib/utils/cn` for conditional class merging. It combines `clsx` (conditional classes) with `tailwind-merge` (de-duplicates conflicting Tailwind classes). The original `lib/utils.ts` is kept as a thin backward-compatible barrel re-exporting the sub-modules:

```typescript
// lib/utils/cn.ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Usage — overriding a default class from a shared component:

```tsx
// Without cn: both classes present, last one wins — fragile
<Badge className="bg-primary bg-red-500" />  // unpredictable

// With cn: tailwind-merge correctly resolves the conflict
<Badge className={cn("bg-primary", isError && "bg-red-500")} />
// → "bg-red-500" when isError, "bg-primary" otherwise
```

### 4.2 Shadcn Primitives & the `data-slot` Pattern

Every Shadcn component exposes a `data-slot` attribute on its root element. This attribute is the hook for parent components to apply contextual styles without prop drilling:

```tsx
// components/ui/card.tsx (excerpt)
function Card({ className, ...props }: React.ComponentProps<'div'>) {
   return (
           <div
                   data-slot="card"
                   className={cn('bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm', className)}
                   {...props}
           />
   );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
   return (
           <div
                   data-slot="card-content"
                   className={cn('px-6', className)}
                   {...props}
           />
   );
}
```

A parent can style a child based on its `data-slot` value using Tailwind's attribute selectors:

```tsx
// Target all card-content children from a parent context
<div className="[&_[data-slot=card-content]]:px-0">
   <Card>...</Card>
</div>
```

This pattern appears throughout the Shadcn components (e.g., `data-slot="badge"`, `data-slot="tooltip-content"`, `data-slot="alert-dialog-header"`) and is the mechanism that allows compound components to be styled compositionally without breaking encapsulation.

### 4.3 CVA for Variant Components

Components with multiple visual variants use **`class-variance-authority` (CVA)** to define variant maps at the component level:

```typescript
// components/ui/badge.tsx (excerpt)
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
        // Base classes (always applied)
        'inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium',
        {
           variants: {
              variant: {
                 default:     'bg-primary text-primary-foreground',
                 secondary:   'bg-secondary text-secondary-foreground',
                 destructive: 'bg-destructive text-white',
                 outline:     'border-border text-foreground',
                 ghost:       'hover:bg-accent hover:text-accent-foreground',
              },
           },
           defaultVariants: { variant: 'default' },
        }
);

function Badge({ className, variant = 'default', asChild = false, ...props }) {
   const Comp = asChild ? Slot.Root : 'span';
   return (
           <Comp
                   data-slot="badge"
   data-variant={variant}
   className={cn(badgeVariants({ variant }), className)}
   {...props}
   />
);
}
```

CVA keeps variant logic out of component render functions. Adding a new variant is a one-line addition to the `variants` object — no conditional logic in JSX.

---

## 5. SchemaFormShell & EntryEditorDialog — Putting It Together

In BeechCMS, content editing has migrated from a standalone page to a dynamic modal-based system centered around **`SchemaFormShell`** (`apps/dashboard/src/features/entry-editor/renderer/schema-form-shell.tsx`) in the `entry-editor` slice.

The `SchemaFormShell` is a presentation-only, domain-agnostic component driven by a **`SchemaFormViewModel`** interface. This enables the **same UI shell** to render and process two very different forms:
1. **Content Entries** (via `useEntryEditorDialog` hook in `entry-editor` slice).
2. **Seed Definitions** (via `useSeedEditorDialog` hook in `seed-builder` slice, utilizing the `repeater` field renderer for editing fields).

```
useEntryEditorDialog() ──┐
                         ├── implements SchemaFormViewModel ──→ SchemaFormShell
useSeedEditorDialog()  ──┘
```

### 5.1 The SchemaFormViewModel Interface

The view-model decouples the presentation shell from the features' logic (CRUD API calls, invalidation, layout builder routing):

```typescript
// features/entry-editor/renderer/schema-form-view-model.ts
export interface SchemaFormViewModel {
  title: string
  isCreate: boolean
  isLoading: boolean
  isSaving: boolean
  isDeleting: boolean
  seed: Seed
  formData: DbPayload
  capabilities: SchemaFormCapabilities
  dangerZoneSlot?: React.ReactNode
  errors: Record<string, string>
  onFieldChange: (alias: string, value: unknown) => void
  onSave: () => Promise<void>
  onDelete?: () => Promise<void>
}
```

### 5.2 Form Layout Rendering

Instead of looping directly over `seed.branches`, the shell delegates rendering to `<LayoutRenderer layout={layout} ... />`, which supports tabbed grids, section cards, and customizable multi-column form layouts designed via the drag-and-drop Layout Builder.

```tsx
// Inside apps/dashboard/src/features/entry-editor/renderer/schema-form-shell.tsx
return (
  <div className="flex flex-col gap-6">
    <LayoutRenderer
      layout={layout}
      seed={vm.seed}
      values={vm.formData}
      errors={vm.errors}
      onChange={vm.onFieldChange}
      readOnly={vm.isSaving}
    />
    
    {/* Destructive actions for Seeds (Danger Zone) */}
    {vm.capabilities.dangerZone && !vm.isCreate && vm.dangerZoneSlot}
  </div>
)
```

Key features:
- **No `switch (branch.type)` in the form**: Fully delegated to the `FieldEdit` registry.
- **Unified styling**: Modals, titles, buttons, and state indicators share the exact same UI markup.
- **Danger Zone Support**: The Seed Builder UI injects its destructive options slot (`dangerZoneSlot`) dynamically through the capability configuration.

---

## 6. How to Add a New Field Type

This is the complete, step-by-step procedure for adding a new field type (e.g., `url`) to the system. The procedure is designed so that **no existing view file is modified**.

### Step 1 — Extend `BranchType` in `@beechcms/core`

```typescript
// packages/core/src/types.ts

export type BranchType =
        | 'text'
        | 'number'
        | 'boolean'
        | 'json'
        | 'date'
        | 'richtext'
        | 'file'
        | 'url';   // ← add here
```

This is the only change to `@beechcms/core`. Turborepo will compile `@beechcms/core` before the apps, so the new type becomes available immediately.

### Step 2 — Add Validation in `@beechcms/core` (if required)

If the new type requires server-side validation/sanitization, extend `buildBranchSchema` and `validateBranchValue` in `packages/core/src/validation.ts`:

```typescript
// packages/core/src/validation.ts
// Add a case inside the switch in buildBranchSchema():

case 'url':
const schema = stringSchema
        .transform(value => sanitizePlainString(value))
        .refine(value => isValidHttpUrl(value), { message: 'Expected url-string' });
return nullable ? z.union([schema, z.null()]) : schema;
```

### Step 3 — Create the Display Renderer

```typescript
// apps/dashboard/src/features/fields/display/url.tsx

import type { FieldDisplayProps } from '../types';

export function UrlDisplay({ value }: FieldDisplayProps) {
   if (!value || typeof value !== 'string') {
      return <div className="text-muted-foreground">—</div>;
   }
   return (
           <a
                   href={value}
   target="_blank"
   rel="noopener noreferrer"
   className="text-primary underline underline-offset-2 text-sm truncate max-w-xs block"
           >
           {value}
           </a>
);
}
```

### Step 4 — Create the Edit Renderer

```typescript
// apps/dashboard/src/features/fields/edit/url.tsx

import { Input } from 'components/ui/input';
import type { FieldEditProps } from '../types';

export function UrlEdit({ branch, value, onChange }: FieldEditProps) {
   const str = (value as string) ?? '';
   return (
           <Input
                   id={branch.alias}
   type="url"
   value={str}
   placeholder="https://..."
   onChange={e => onChange(e.target.value)}
   />
);
}
```

### Step 5 — Register Both Renderers

```typescript
// apps/dashboard/src/features/fields/registry.ts
// Add the two imports:
import { UrlDisplay } from './display/url';
import { UrlEdit }    from './edit/url';

// Add to displayRegistry:
export const displayRegistry: Partial<Record<BranchType, ComponentType<FieldDisplayProps>>> = {
   // ... existing entries ...
   url: UrlDisplay,   // ← add
};

// Add to editRegistry:
export const editRegistry: Partial<Record<BranchType, ComponentType<FieldEditProps>>> = {
   // ... existing entries ...
   url: UrlEdit,      // ← add
};
```

### Step 6 — Add to a Seed (optional, for testing)

```typescript
// packages/core/src/seeds.ts — extend any existing seed
{
  alias: 'website',
  label: 'Sito Web',
  type: 'url',
}
```

### Step 7 — Write co-located tests

```typescript
// apps/dashboard/src/features/fields/display/url.test.tsx
import { render, screen } from '@testing-library/react';
import { UrlDisplay } from './url';

const branch = { alias: 'website', label: 'Sito', type: 'url' as const };

describe('UrlDisplay', () => {
   it('renders a link for a valid URL', () => {
      render(<UrlDisplay branch={branch} value="https://example.com" />);
      expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.com');
   });

   it('renders a dash for null value', () => {
      render(<UrlDisplay branch={branch} value={null} />);
      expect(screen.getByText('—')).toBeInTheDocument();
   });
});
```

### Summary

| Step | File modified | Scope of change |
|---|---|---|
| 1 | `packages/core/src/types.ts` | Add one union member to `BranchType` |
| 2 | `packages/core/src/validation.ts` | Add one `case` to the Zod schema builder |
| 3 | `features/fields/display/url.tsx` | New file |
| 4 | `features/fields/edit/url.tsx` | New file |
| 5 | `features/fields/registry.ts` | Add 2 imports + 2 object entries |
| 6 | `packages/core/src/seeds.ts` | Optional — add a `Branch` to a seed for testing |
| 7 | `display/url.test.tsx`, `edit/url.test.tsx` | New co-located test files |

**Zero modifications** to `FieldDisplay.tsx`, `FieldEdit.tsx`, `SchemaFormShell`, the table view, the gallery view, or any other consumer. The registry dispatch handles it all.

---

## 7. Content Views — Toolbar, Table & Gallery

### 7.1 ContentToolbar Architecture

`ContentToolbar` (`apps/dashboard/src/features/content-toolbar/`) is the orchestrator for all content list views. It receives the active `Seed` and drives filtering, sorting, search, grouping, and view switching — all without knowing which view (table or gallery) is rendered below it. Views are passed as children.

```
Seed (branches)
      │
      ▼
ContentToolbar
  ├── View Switcher      → onChangeView(viewId)
  ├── Filter Pills       → onFiltersChange(ToolbarFiltersState)
  ├── Sort Menu          → onSortChange({ columnId, desc })
  ├── Search Bar         → onSearchChange(value) / onSubmitSearch(value)
  └── Settings Menu      → page size, column visibility, group by, conditional formats
      │
      ▼
  children (DataTable | ContentGallery)
```

State orchestration is fully encapsulated in `useContentToolbar`. The component is controlled: the parent (`ContentListPage`) owns all state and passes it down as props. This makes the toolbar independently testable and reusable across any view type defined in `ViewType`.

Available view types (`ViewType`): `"table" | "gallery" | "grid" | "kanban" | "chart"`. Only `table` and `gallery` are currently implemented; the others are defined for forward compatibility.

Each view declares which tools it exposes via `UserViewInstance.enabledTools`. Tools absent from the array are removed from the DOM entirely — not just hidden.

```typescript
// apps/dashboard/src/features/content-toolbar/shared.ts
export type ToolbarTool = "filter" | "sort" | "automation" | "search" | "settings" | "create"

export interface UserViewInstance {
  id: string
  label: string
  type: ViewType
  enabledTools: ToolbarTool[]
  conditionalFormats?: ConditionalFormatRule[]
}
```

### 7.2 How Filters Derive from `Seed.branches`

The hook `useToolbarFilters` (`apps/dashboard/src/features/content-toolbar/toolbar-hooks/use-toolbar-filters.ts`) builds the list of filterable columns from `seed.branches` at runtime. Two system columns are always prepended:

| `columnId` | `FilterGroupType` | Source |
|---|---|---|
| `slug` | `system` | Always present |
| `status` | `select` | Values from `availableStatusOptions` (fed by `/api/content/:slug/facets`) |

Branch columns are mapped using this logic (verified against source):

| `branch.type` condition | `FilterGroupType` assigned |
|---|---|
| `number` | `number` |
| `date` | `date` |
| `boolean` | `boolean` |
| `json` **and** alias contains `"tag"` (case-insensitive) | `tags` |
| everything else (`text`, `richtext`, `file`, `json` without "tag") | `text` ← catch-all |

The `FilterGroupType` determines which operators are available in the filter UI:

| Type | Available operators |
|---|---|
| `text`, `system` | `contains`, `eq`, `is_empty`, `is_not_empty` |
| `number`, `date` | `gt`, `lt`, `gte`, `lte`, `eq`, `is_empty`, `is_not_empty` |
| `boolean` | `eq`, `is_empty`, `is_not_empty` |
| `select` | `eq`, `is_empty`, `is_not_empty` |
| `tags` | `contains`, `is_empty`, `is_not_empty` |

### 7.3 Gallery & Toolbar Integration

`ContentGallery` (`apps/dashboard/src/features/content-gallery/`) is a drop-in replacement for `DataTable` inside `ContentToolbar`. It receives the same already-filtered, already-sorted `ContentEntry[]` dataset that the table view uses — it introduces **no additional fetches**.

Card fields are resolved schema-driven by `resolveCardFields` (`resolve-card-fields.ts`). The heuristics, verified against source:

| Card slot | Resolution rule |
|---|---|
| **Cover** | First `file` branch whose alias contains `"cover"`, `"image"`, `"foto"`, or `"photo"` |
| **Title** | First branch whose alias is exactly `"title"` or `"name"` |
| **Excerpt** | First `richtext` or `text` branch that is not the title branch |
| **Date** | First `date` branch |
| **Tags** | First `json` branch whose alias contains `"tag"` |

All slots are nullable — if no branch matches a heuristic, that slot is omitted from the card. The peek panel (opened on card click) uses `FieldDisplay` from the registry, making it automatically consistent with the table view.

```typescript
// apps/dashboard/src/features/content-gallery/resolve-card-fields.ts
export interface ResolvedCardFields {
  coverBranch: Branch | null
  titleBranch: Branch | null
  excerptBranch: Branch | null
  dateBranch: Branch | null
  tagsBranch: Branch | null
}
```

---

## 8. Widget Data Layer

### 8.1 Purpose & Design Goals

The Widget Data Layer is a VSA feature slice at `apps/dashboard/src/features/widget-data/` that provides a **single, stable interface** for all dashboard widgets to query content data. It exists to solve four problems:

1. **Botanical Engine complexity is invisible to widgets.** Widget components never deal with internal IDs — they pass API aliases (e.g. `"price"`, `"created_at"`) and get back resolved values from real SQL columns.
2. **Switching data source = changing one prop.** Every hook accepts a `seed` string. Pointing a widget at a different content type requires changing only that one argument.
3. **Formula/expression evaluation** for computed metrics (sum, avg, growth delta) is available both server-side (via dedicated API endpoints) and client-side (pure utility, no round-trip when data is already cached).
4. **Consistent cache behaviour.** Each hook declares its own `staleTime` and `refetchInterval` calibrated to the nature of the data (aggregates: 5 min; leaderboards: 2 min; lists: always fresh).

### 8.2 Feature Slice Structure

```text
apps/dashboard/src/features/widget-data/
├── index.ts          ← public barrel (types + hooks + evaluateFormula only)
├── types.ts          ← all shared TypeScript types
├── widget.api.ts     ← internal Axios wrappers (NOT re-exported)
├── query-keys.ts     ← WIDGET_QUERY_KEYS constants (NOT re-exported)
├── formula.ts        ← evaluateFormula() — pure client-side computation
└── hooks/
    ├── use-widget-aggregate.ts
    ├── use-widget-growth.ts
    ├── use-widget-leaderboard.ts
    ├── use-widget-list.ts
    └── use-widget-timeseries.ts
```

`widget.api.ts` and `query-keys.ts` are internal implementation details — they are not re-exported from `index.ts` and must not be imported directly by widget components.

### 8.3 Types

All types are imported from `@/features/widget-data`:

```typescript
// Discriminated union for server-side aggregate expressions
type AggregateFormula =
  | { op: 'count' }
  | { op: 'sum';          column: string }
  | { op: 'avg';          column: string }
  | { op: 'min';          column: string }
  | { op: 'max';          column: string }
  | { op: 'countWhere';   column: string; value: unknown }
  | { op: 'percentageOf'; numeratorColumn: string; denominatorColumn: string }

type TimeWindow = 'week' | 'month' | 'year' | 'all'
type SortDirection = 'asc' | 'desc'

// Entry returned by /list — always alias-resolved, never br_XX keys
type ResolvedEntry = Record<string, unknown> & {
  id: string; slug: string; status: string
  createdAt: number; updatedAt: number
}

interface GrowthResult {
  current: number; previous: number
  percentageChange: number  // positive = growth
  trend: 'up' | 'down' | 'flat'
}

interface LeaderboardEntry { id: string; label: string; score: number | string }
interface AggregateResult  { value: number; window: TimeWindow }
interface TimeseriesResult { points: Array<{ label: string; value: number }> }

interface ListParams {
  columns?: string[]; search?: string
  filters?: Array<{ column: string; op: string; value: unknown }>
  orderBy?: string; orderDir?: SortDirection
  limit?: number; offset?: number
}
interface ListResult { entries: ResolvedEntry[]; total: number }
```

`column` values inside `AggregateFormula` and `ListParams` are always **API aliases**, never internal IDs. System columns (`id`, `slug`, `status`, `created_at`, `updated_at`) are accepted directly.

### 8.4 React Hooks

All hooks are imported from `@/features/widget-data` and return `{ data, isLoading, isError, error }`.

| Hook | Signature | `staleTime` | `refetchInterval` |
|---|---|---|---|
| `useWidgetAggregate` | `(seed, formula, window?)` | 5 min | — |
| `useWidgetGrowth` | `(seed, formula, window, windowColumn?)` | 5 min | 5 min |
| `useWidgetLeaderboard` | `(seed, scoreColumn, options?)` | 2 min | 2 min |
| `useWidgetList` | `(seed, params)` | 0 (always fresh) | — |
| `useWidgetTimeseries` | `(seed, valueColumn, groupColumn, window)` | 5 min | — |

**Usage example — `useWidgetGrowth`:**

```typescript
import { useWidgetGrowth } from "@/features/widget-data"

const { data, isLoading, isError } = useWidgetGrowth(
  "articoli",
  { op: "count" },
  "month"
)
// data: { current: 14, previous: 9, percentageChange: 55.6, trend: "up" }
```

**`useWidgetLeaderboard` options:**

```typescript
const { data } = useWidgetLeaderboard("prodotti", "price", {
  limit: 5,
  orderBy: "desc",   // 'asc' | 'desc'
  labelAlias: "name" // override for label column (default: seed.displayNameAlias)
})
```

**`useWidgetList` with filters:**

```typescript
const { data } = useWidgetList("articoli", {
  search: "react",
  filters: [{ column: "status", op: "eq", value: "published" }],
  orderBy: "created_at",
  orderDir: "desc",
  limit: 10,
  offset: 0,
})
// data: { entries: ResolvedEntry[], total: number }
```

### 8.5 Client-Side Formula Evaluation

`evaluateFormula(entries, formula)` from `@/features/widget-data` evaluates an `AggregateFormula` purely in the browser against an array of `ResolvedEntry` objects already in cache. Use it to derive metrics from data fetched via `useWidgetList` without an extra round-trip.

```typescript
import { evaluateFormula } from "@/features/widget-data"

const total = evaluateFormula(entries, { op: "sum", column: "price" })
const ratio = evaluateFormula(entries, {
  op: "percentageOf",
  numeratorColumn: "published_count",
  denominatorColumn: "total_count",
})
```

`column` values must be API aliases present in the `ResolvedEntry` objects. Non-numeric values are coerced to `0` via `parseFloat`.

### 8.6 Pilot Widgets

Reference widgets ship in `apps/dashboard/src/features/dashboard/components/widgets/` and are isolated via the sub-barrel `features/dashboard/widgets.ts`:

| File | Hook used | Key props |
|---|---|---|
| `growth-widget.tsx` | `useWidgetGrowth` | `seed`, `formula`, `window`, `title`, `icon?`, `detailPath` |
| `kpi-widget.tsx` | `useWidgetAggregate` | `seed`, `formula`, `title`, `icon`, `detailPath` |
| `leaderboard-widget.tsx` | `useWidgetLeaderboard` | `seed`, `scoreColumn`, `title`, `detailPath`, `limit?` |

All three follow the same pattern:
- **Loading state:** `<Skeleton>` placeholders matching the expected layout shape
- **Error state:** `<p className="text-sm text-destructive">` inline message — no full-page error
- **Shell:** `<DashboardWidgetShell>` from `@/features/dashboard` — provides the card chrome, header, and optional `action` slot (used for trend badges and detail links)

**`GrowthWidget` renders:**
- Large current value (`text-4xl font-bold tabular-nums`)
- Trend badge in the shell `action` slot: green `TrendingUp` / red `TrendingDown` / neutral `Minus`, showing `+55.6%` / `-12.0%` / `0.0%`
- "vs periodo precedente: N" below the value
- "Vedi di più →" link at the bottom

**`LeaderboardWidget` renders:**
- Rank badges: positions 1–3 use amber-400 (gold), slate-400 (silver), amber-700 (bronze); positions 4+ use a neutral muted badge
- Score in a `Badge` variant pill on the right of each row

### 8.7 How to Add a New Widget

1. **Choose a hook** from `@/features/widget-data` that matches the data shape you need, or compose `useWidgetList` + `evaluateFormula` for custom aggregations.

2. **Create the widget file** in `apps/dashboard/src/features/dashboard/components/widgets/` and export it in `widgets.ts`:

```typescript
// my-widget.tsx
import { DashboardWidgetShell } from "@/features/dashboard"
import { useWidgetAggregate } from "@/features/widget-data"
import type { AggregateFormula, TimeWindow } from "@/features/widget-data"
import { Skeleton } from "@/components/ui/skeleton"

export interface MyWidgetProps {
  seed: string
  formula: AggregateFormula
  window?: TimeWindow
  title: string
}

export function MyWidget({ seed, formula, window = "all", title }: MyWidgetProps) {
  const { data, isLoading, isError } = useWidgetAggregate(seed, formula, window)

  if (isLoading) return (
    <DashboardWidgetShell title={title}>
      <Skeleton className="h-10 w-1/2" />
    </DashboardWidgetShell>
  )
  if (isError || !data) return (
    <DashboardWidgetShell title={title}>
      <p className="text-sm text-destructive">Errore nel caricamento.</p>
    </DashboardWidgetShell>
  )

  return (
    <DashboardWidgetShell title={title}>
      <p className="text-4xl font-bold">{data.value.toLocaleString()}</p>
    </DashboardWidgetShell>
  )
}
```

3. **Register the widget type** with `registerWidget()` — see [8.8 Dashboard Renderer & Widget Registry](#88-dashboard-renderer--widget-registry). The `widget.types.ts`, `widget-registry.tsx` and `dashboard.config.ts` files this step used to reference have been removed.

### 8.8 Dashboard Renderer & Widget Registry

The dashboard home page (`apps/dashboard/src/features/dashboard/pages/dashboard-page.tsx`) does not hardcode a bento grid. It renders a `DashboardLayout` (from `@beechcms/core`) through a generic **Pages → Sections → Columns → Widgets** renderer, driven by a typed widget registry.

**Layout source — `useDashboardLayout()`:**

```typescript
import { useDashboardLayout } from "@/features/dashboard"

const { layout, isStored, isLoading } = useDashboardLayout()
```

- Fetches `GET /dashboard-layout`. If the stored `layout` is `null` (never customized), falls back to `generateDefaultDashboardLayout(seeds)` from `@beechcms/core` — memoized on `seeds` so widget/section/page ids stay stable across re-renders.
- `isStored` is `false` while showing the generated default — the Sprint 05 builder uses this to decide whether "Save" creates a new layout or updates the existing one.

**Renderer — `<DashboardLayoutRenderer layout={layout} />`:**

| Level | Component | Behaviour |
|---|---|---|
| Page | `DashboardLayoutRenderer` | `layout.pages` selected via `?page=<slug>` (Shadcn `Tabs`, `variant="line"`). A single page renders without a tab strip. An unknown or missing slug falls back to the first page. |
| Section | `DashboardSection` | 12-unit grid (`grid-cols-1 md:grid-cols-6 lg:grid-cols-12`), reusing the `.bento-cell` utility. Column widths come from `section.columnSpans`, or an equal split with the remainder distributed left-to-right. `section.label` renders a header unless `hideLabel` is set; `section.collapsible` adds a collapse toggle. |
| Column | `DashboardColumn` | Vertical stack (`flex flex-col gap-6`) of `DashboardWidgetInstance`s, in array order. |
| Widget | `DashboardWidgetHost` | Looks up `instance.type` in the registry, validates `instance.config` against the definition's `configSchema`, and renders the widget inside `WidgetErrorBoundary`. |

Unknown types and invalid configs never blank the dashboard:
- `instance.type` not in the registry → a dashed placeholder showing `dashboard.widgetRegistry.unknown` plus the raw type string (e.g. a `@acme/weather` widget on a site that hasn't installed the matching plugin).
- `configSchema.safeParse(instance.config)` fails → `console.warn` and the widget renders with `definition.defaultConfig` instead of crashing.

**Registering a widget type:**

All built-ins live in `apps/dashboard/src/features/dashboard/registry/builtin-widgets.tsx`, namespaced `core/<name>` (custom widget packs use `@scope/name`):

```typescript
import { z } from "zod"
import { registerWidget } from "./widget-registry"
import type { DashboardWidgetProps } from "./widget-definition"

const myWidgetConfigSchema = z.object({
  seedSlug: z.string().catch(""),
  variant: z.enum(["list", "cards"]).optional().catch(undefined),
})
type MyWidgetConfig = z.infer<typeof myWidgetConfigSchema>

function MyWidgetAdapter({ config }: DashboardWidgetProps<MyWidgetConfig>) {
  return <MyWidget seedSlug={config.seedSlug} variant={config.variant} />
}

registerWidget<MyWidgetConfig>({
  type: "core/my-widget",
  labelKey: "dashboard.widgetRegistry.widgets.myWidget.label",
  icon: "Sparkles",          // Lucide icon name, used by the Sprint 05 picker
  category: "content",       // "stats" | "charts" | "content" | "system" | "custom"
  configSchema: myWidgetConfigSchema,
  defaultConfig: { seedSlug: "", variant: "list" },
  component: MyWidgetAdapter,
  minColumnSpan: 6,           // builder hint (Sprint 05)
})
```

- **`configSchema` must be lenient** — every field needs `.catch()` or `.optional().catch(undefined)` so a partial or stale stored config always parses into *something* rather than failing outright.
- Add a `dashboard.widgetRegistry.widgets.<key>.label` entry to `src/locales/en.json` and `it.json` — shown in the widget picker.
- `registerWidget` throws if `type` is already registered — types share a flat global namespace, so pick a specific name.
- `builtin-widgets.tsx` is imported only for its side effects, from `features/dashboard/index.ts`. Nothing else needs to import it directly.
- An optional `ConfigPanel: ComponentType<{ config: TConfig; onChange: (next: TConfig) => void }>` on the registration is rendered inside the Sprint 05 widget config `Sheet` (see 8.9). Widgets without a `ConfigPanel` show a localized "no configurable options" message.

### 8.9 Dashboard Builder (Sprint 05)

Admin-only (`canEditDashboard(user?.role)` from `@beechcms/core`, `'admin'` only) drag-and-drop editor for the `DashboardLayout`. Lives in `apps/dashboard/src/features/dashboard/builder/`, exported via that folder's `index.ts` and re-exported from `features/dashboard/index.ts`.

**Entry point** — `dashboard-page.tsx` shows a "Customize" button (`Settings` icon) next to the welcome header when `canEdit` is true; clicking it opens `<DashboardBuilderDialog open={...} onOpenChange={...} initialLayout={layout} />` as a full-screen `Dialog`.

**State — `useDashboardBuilder({ initialLayout })`:**

- Holds a `draft: DashboardLayout` (deep-cloned from `initialLayout`) plus `storedInitial` for `isDirty` comparison (`JSON.stringify` diff).
- All mutators (`addPage`, `renamePage`, `removePage`, `movePage`, `addSection`, `updateSection`, `removeSection`, `moveSection`, `duplicateSection`, `setColumnPreset`, `addWidget`, `updateWidgetConfig`, `updateWidgetTitle`, `moveWidget`, `moveWidgetToPage`, `removeWidget`, `replaceWidget`, `reset`) go through a `structuredClone`-based `mutate` helper — never mutate `draft` in place.
- `COLUMN_PRESETS` (also exported) = `[[12],[6,6],[8,4],[4,8],[4,4,4],[3,3,3,3]]`. `setColumnPreset` applies the "shrink rule": when the new preset has fewer columns, surplus columns' widgets are appended (in order) to the last surviving column rather than discarded.
- `removePage` refuses to remove the last page (`pages.length <= 1`).
- `moveWidget({ from, to })` / `moveWidgetToPage(from, toPageId)` return `boolean` indicating whether the move was applied (used by `BuilderPane`'s `onDragEnd` to decide whether to show a warning toast).
- Reducer behaviour is covered by `apps/dashboard/src/test/dashboard/builder/use-dashboard-builder.test.ts`.

**UI tree** (all in `features/dashboard/builder/`):

| File | Role |
|---|---|
| `dashboard-builder-dialog.tsx` | Full-screen `Dialog`; owns `useDashboardBuilder`, `handleSave` (validates via `validateDashboardLayout` then `PUT /dashboard-layout`), `handleReset` (`DELETE /dashboard-layout`). Invalidates `DASHBOARD_QUERY_KEYS.layout()` on success. |
| `builder-pane.tsx` | Single `DndContext` (dnd-kit) for pages, sections and widgets; routes `onDragEnd` by id prefix (`page:`, `section:`, `widget:`); Preview toggle (renders `DashboardLayoutRenderer` for the active page); Save/Reset/Cancel footer; owns the reset-confirm and discard-confirm `ConfirmDialog`s. |
| `page-tabs-manager.tsx` | Sortable page tabs, inline rename, add/remove (last page undeletable). |
| `section-card.tsx` | Section header (rename, hide label, collapsible, column-preset submenu via `COLUMN_PRESETS`, duplicate, remove) + `grid grid-cols-12` of `ColumnStack`s. |
| `column-stack.tsx` | Sortable list of `WidgetChip`s within one column, plus "Add Widget". |
| `widget-chip.tsx` | One widget row — icon, title, "Move to page" submenu (other pages), Configure, Remove. Shows an `AlertTriangle` + "Unavailable" badge when `getWidgetDefinition(widget.type)` returns `undefined` (unknown widget type), but the widget instance is preserved. |
| `widget-picker-dialog.tsx` | Dialog listing `listWidgetDefinitions()` grouped by `category` (`stats > charts > content > system > custom`). |
| `widget-config-sheet.tsx` | `Sheet` with the widget's title field plus its `ConfigPanel` (or a "no options" message). |
| `config-fields.tsx` | Shared config-panel primitives: `TextField`, `TextAreaField`, `NumberField`, `SwitchField`, `VariantSelect`, `SeedSelect`, `BranchAliasSelect`, `WindowSelect`, `FormulaEditor` (covers every `AggregateFormula` op). |
| `use-dashboard-builder.ts` | Reducer hook + `COLUMN_PRESETS` (see above). |
| `api/dashboard-layout.api.ts` | `dashboardBuilderApi.saveLayout(layout)` (`PUT /dashboard-layout`) and `resetLayout()` (`DELETE /dashboard-layout`). |

**Save validation** — `handleSave` calls `validateDashboardLayout(draft, { seedSlugs, knownWidgetTypes: knownWidgetTypes() })` from `@beechcms/core` before saving:
- Widgets whose `config.seedSlug` references a seed that no longer exists are silently stripped (with a warning) — `result.cleaned` is what gets sent to the API.
- Unknown widget types only produce a warning and are **never** stripped — they round-trip through save/reload and render as "Unavailable" chips in the builder / placeholders in the renderer.
- If `result.ok` is `false`, the first error is toasted and the save is aborted.

**Cross-page rules** — sections can only be reordered within their own page (`builder-pane.tsx` toasts `dashboard.builder.warnNoCrossPageSection` and ignores the drop if a cross-page section move is attempted). Widgets can move across pages via the "Move to page" submenu or by dragging into a different page's column.

---

## 10. Authentication Context & In-Memory Token

### 10.1 Overview

The dashboard uses a React context (`AuthContext`) to manage authentication state. The JWT access token is stored exclusively in a **module-level variable** (`_accessToken` in `apps/dashboard/src/lib/api.ts`) — it never touches `localStorage` or any browser storage. This prevents XSS-based token theft.

The refresh token remains in an `HttpOnly SameSite=Strict` cookie and is handled entirely by the browser — the dashboard never reads or writes it.

### 10.2 Files

| File | Role |
|---|---|
| `apps/dashboard/src/lib/api.ts` | Declares `_accessToken`, exports `getAccessToken / setAccessToken / clearAccessToken`. Axios interceptors read and update it. |
| `apps/dashboard/src/lib/auth-context.tsx` | `AuthProvider`, `useAuth()` hook. Manages `{ status, user }` React state. |
| `apps/dashboard/src/App.tsx` | Wraps `<RouterProvider>` in `<AuthProvider>`. `ProtectedRoute` consumes `useAuth()`. |

### 10.3 AuthProvider Lifecycle

```
App mount
  └─ AuthProvider mounts
       └─ useEffect: POST /auth/refresh (withCredentials)
            ├─ success → setAccessToken(token), setUser(decoded), status = 'authenticated'
            └─ failure → clearAccessToken(), status = 'unauthenticated'
```

On page reload the access token is gone (it was in-memory). `AuthProvider` silently re-issues it via the `HttpOnly` refresh cookie before any protected route renders.

### 10.4 `useAuth()` Hook

```typescript
import { useAuth } from '@/lib/auth-context'

const { status, user, setToken, clearToken } = useAuth()
// status: 'loading' | 'authenticated' | 'unauthenticated'
// user:   { email: string; name?: string } | null
```

**Rules:**
- `useAuth()` **must** be called inside a component that is a descendant of `<AuthProvider>`. It throws if called outside.
- Use `user` from `useAuth()` wherever user identity is needed (sidebar, header, etc.). Do not call `localStorage.getItem` or any token-decoding function in component code.
- Call `setToken(token)` after a successful login to update the in-memory token and React state atomically.
- Call `clearToken()` to log out from client state; pair it with `POST /auth/logout` to revoke the refresh token server-side.

### 10.5 ProtectedRoute

```tsx
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { status } = useAuth()
  if (status === 'loading') return <SplashScreen />        // initial refresh in progress
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  return <>{children}</>
}
```

`SplashScreen` is a minimal full-screen spinner shown only during the initial `POST /auth/refresh` call at app mount. It is never shown again after the first resolution.

### 10.6 Axios Interceptors

The request interceptor in `api.ts` reads `getAccessToken()` and injects `Authorization: Bearer <token>` on every outbound request.

The 401 response interceptor:
1. Calls `POST /auth/refresh` once (guarded by `isRefreshing` flag to prevent concurrent refresh storms).
2. On success: calls `setAccessToken(newToken)` and retries all queued requests.
3. On failure: calls `clearAccessToken()` and redirects to `/login`.

The interceptor does **not** call `clearToken()` from `AuthContext` — it only manages the module variable. The redirect to `/login` is enough to reset the React tree and trigger a new `AuthProvider` mount.

---

## 9. Dashboard Seed Config — Sidebar & UI Behaviour

The sidebar and per-content-type UI behaviour are driven by the optional `dashboard` field on each `Seed`. This is the **only** source of truth for dashboard UI configuration — no slug-to-icon maps, no separate registries.

### 9.1 How it works

1. `defineSeed({ ..., dashboard: { icon, group, order, hidden, features } })` — declared alongside the Seed, never in a separate file.
2. The `GET /api/schema` endpoint returns all seeds including their `dashboard` field. `useSchema()` in `apps/dashboard/src/features/schema/hooks/use-schema.ts` fetches this once and caches it for 5 minutes.
3. `buildContentMenu(seeds, defaultGroupLabel)` in `apps/dashboard/src/config/dashboard-menu.ts` groups, sorts, and filters the seeds, returning `NavGroup[]`.
4. `AppSidebar` renders one `NavMain` section per group, in the order they appear in `NavGroup[]`.

### 9.2 Icon Registry

**File:** `apps/dashboard/src/lib/icon-registry.ts`

Icon names are strings on the wire (safe to serialize to JSON). The registry resolves them to `LucideIcon` components client-side:

```typescript
import { resolveIcon } from '@/lib/icon-registry'

const Icon = resolveIcon('Newspaper')   // → LucideIcon component
const Fallback = resolveIcon(undefined) // → Folder (default)
```

Unknown names always fall back to `Folder` — they never throw.

### 9.3 Sidebar Grouping

Seeds with the same `dashboard.group` string share a sidebar section. Seeds with no `group` fall into the default section (labelled with the i18n key `sidebar.contents`). Within a group, seeds are sorted by `dashboard.order` (ascending; default 99).

```
Sidebar
├── Navigation          ← static: Dashboard, Settings
├── Blog                ← group: seeds with dashboard.group = 'Blog', sorted by order
│   ├── Posts           ← order: 1
│   └── Comments        ← order: 2
└── Shop                ← group: seeds with dashboard.group = 'Shop'
    ├── Products        ← order: 1
    └── Orders          ← order: 2
```

Set `dashboard.hidden: true` to exclude a seed from the sidebar entirely (it remains accessible via direct URL).

### 9.4 Feature Toggles

`dashboard.features` controls which UI elements appear in the content views. All values default to `true` for `search` and `filter`; `export` and `bulkDelete` default to `false`.

| Key | Default | Effect |
|---|---|---|
| `search` | `true` | Show search bar in the content list toolbar |
| `filter` | `true` | Show column filters in the content list toolbar |
| `export` | `false` | Show export (CSV/JSON) button in the toolbar |
| `bulkDelete` | `false` | Show bulk-delete action in the content list |

> **Note:** feature toggle rendering is opt-in — each component must read `seed.dashboard?.features` and conditionally render. The schema provides the data; consuming components must implement the check.

### 9.5 Adding a New Icon

1. Import the Lucide icon in `apps/dashboard/src/lib/icon-registry.ts`.
2. Add it to both the import list and the `ICON_MAP` object using its PascalCase name as key.
3. Reference it by name string in any Seed's `dashboard.icon` field.

```typescript
// icon-registry.ts — add to both import and ICON_MAP
import { Rocket } from 'lucide-react'

const ICON_MAP = {
  // ...existing icons
  Rocket,
}
```

```typescript
// seeds.ts
defineSeed({ slug: 'launches', dashboard: { icon: 'Rocket' } })
```

> **Do not** create custom `fetch` calls inside widget components. All data access must go through the hooks in `@/features/widget-data`. If none of the existing hooks fit, add a new one following the pattern in `hooks/use-widget-aggregate.ts`.