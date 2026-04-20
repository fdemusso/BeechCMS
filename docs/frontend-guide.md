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

---

## 1. Overview

The dashboard is a React + Vite SPA served from `apps/dashboard`. It communicates exclusively with the Hono API over HTTP — there is no direct database access. Its primary responsibilities are:

- Rendering content forms and tables **driven entirely by the `Seed` schema** from `@beech/core`, not by hardcoded layouts.
- Managing all server state through **TanStack Query**, with typed query keys and deterministic cache invalidation.
- Exposing a **pluggable field rendering system** that allows new data types to be added without modifying existing view code.

The dashboard follows the **Vertical Slice Architecture** transition described in `docs/architecture.md`. New feature code belongs in `apps/dashboard/src/features/<feature-name>/` with an `index.ts` public API. Shared UI primitives live in `components/ui/`. The FieldRenderers system lives in `components/fields/` because it is consumed by multiple features (the table view, the entry editor, and the gallery peek panel).

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

All display and edit components share a minimal, stable interface defined in `components/fields/types.ts`:

```typescript
// components/fields/types.ts

export interface FieldDisplayProps {
   branch: Branch;        // Full Branch definition (id, alias, label, type, format, options…)
   value: unknown;        // Sourced from entry.data[branch.alias]
   maxLength?: number;    // Optional truncation hint for text/json in table cells
}

export interface FieldEditProps {
   branch: Branch;        // Full Branch definition
   value: unknown;        // Current form state value
   onChange: (value: unknown) => void;  // Controlled component callback
}
```

The `Branch` type comes directly from `@beech/core/src/types.ts`. A field renderer never fetches data — it only renders what it receives. This makes every renderer independently unit-testable in isolation.

### 2.3 The Registry

`components/fields/registry.ts` contains the two maps and their accessor functions:

```typescript
// components/fields/registry.ts

import type { ComponentType } from 'react';
import type { BranchType } from '@beech/core';
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

The `Partial<Record<BranchType, ...>>` type is intentional. Unregistered types silently fall back to `DefaultDisplay` (renders `unknown` as a string or `—`) and `DefaultEdit` (renders a plain `<input type="text">`). This makes the system **fail-safe** by design: a new `BranchType` added to `@beech/core` without a corresponding renderer will still produce a usable, non-crashing UI.

### 2.4 Entry Points: FieldDisplay & FieldEdit

The two public entry points are thin delegators. They perform the registry lookup and forward all props to the resolved component:

```typescript
// components/fields/FieldDisplay.tsx
import { getDisplayComponent } from './registry';
import type { FieldDisplayProps } from './types';

export function FieldDisplay(props: FieldDisplayProps) {
   const { branch } = props;
   const Component = getDisplayComponent(branch.type);
   return <Component {...props} />;
}

// components/fields/FieldEdit.tsx
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
import { FieldDisplay, FieldEdit } from 'components/fields';
import type { FieldDisplayProps, FieldEditProps } from 'components/fields';
// Advanced: access the registry directly
import { getDisplayComponent, getEditComponent } from 'components/fields';
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
| `file` | Thumbnail if URL resolves to an image; file icon otherwise. `asset-list`: stack preview | Dropzone upload, image preview, Replace / Remove actions. `multiple: true` or `format: 'asset-list'`: multi-file add, reorder, delete |
| *(unregistered)* | `DefaultDisplay` — string or `—` | `DefaultEdit` — `<Input type="text">` |

The `richtext` edit renderer is implemented in `features/richtext-editor/` as a vertical slice and re-exported via a thin wrapper at `components/fields/edit/richtext.tsx`. This is the VSA pattern in action: the complex TipTap logic is self-contained in its slice; the registry consumes only the public API.

---

## 3. TanStack Query — Server State Strategy

TanStack Query v5 manages all remote data. There is a strict rule: **no server state in Zustand or React context**. Server data lives in the Query cache. Local UI state (open modals, selected rows, filter inputs) lives in `useState` or Zustand.

### 3.1 Query Key Architecture

Query keys are defined as typed constants co-located with their hook, not scattered as inline strings. This pattern is sourced directly from the dashboard feature hooks:

```typescript
// features/dashboard/hooks/use-dashboard-stats.ts

export const DASHBOARD_QUERY_KEYS = {
   all:       ['dashboard']              as const,
   stats:     ['dashboard', 'stats']    as const,
   cloudflare:['dashboard', 'cloudflare'] as const,
   activity:  ['dashboard', 'activity'] as const,
   health:    ['dashboard', 'health']   as const,
   breakdown: ['dashboard', 'breakdown'] as const,
};
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

All components use the `cn` utility from `lib/utils` for conditional class merging. It combines `clsx` (conditional classes) with `tailwind-merge` (de-duplicates conflicting Tailwind classes):

```typescript
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
   return twMerge(clsx(inputs));
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

## 5. The EntryEditorPage — Putting It Together

The `EntryEditorPage` (`pages/entry-editor.tsx`) is the canonical consumer of the FieldRenderers system. It demonstrates how the registry, TanStack Query, and the schema-driven model converge:

```tsx
// Simplified structure of EntryEditorPage

const seed = getSeed(slug);  // From @beech/core — never hardcoded

// TanStack Query: fetch existing entry in edit mode
const { data: entry } = useQuery({
   queryKey: CONTENT_QUERY_KEYS.detail(slug, id),
   queryFn: () => contentApi.fetchById(slug, id),
   enabled: !!id,  // Skip in create mode
});

// Local form state — uncontrolled from the Query cache perspective
const [formData, setFormData] = useState<Record<string, unknown>>(
        entry?.data ?? {}
);

const handleInputChange = (alias: string, value: unknown) => {
   setFormData(prev => ({ ...prev, [alias]: value }));
};

// Adaptive layout: richtext field → 70/30 split; no richtext → single column
const hasRichtext = seed.branches.some(b => b.type === 'richtext');

return (
        <form onSubmit={handleSave}>
           <div className={hasRichtext ? 'grid grid-cols-[1fr_300px]' : 'max-w-2xl mx-auto'}>
              {seed.branches.map(branch => (
                      // The registry is invoked here — EntryEditorPage has zero knowledge
                      // of what component will be rendered for each type.
                      <FieldEdit
                              key={branch.id}
                              branch={branch}
                              value={formData[branch.alias]}
                              onChange={val => handleInputChange(branch.alias, val)}
                      />
              ))}
           </div>
        </form>
);
```

Key observations:
- `seed.branches.map(...)` drives the form. There is no hardcoded list of fields anywhere in the page.
- The page does not contain any `switch (branch.type)` logic — that is fully delegated to the registry.
- `formData[branch.alias]` — field access always uses aliases, never internal IDs (`br01`). The Botanical Engine's translation happens at the API boundary, not in the UI.
- JSON field validation (checking that the string is valid JSON before submitting) is the **only** field-type-specific logic that stays in the page. All other type-specific behaviour is encapsulated in the individual renderers.

---

## 6. How to Add a New Field Type

This is the complete, step-by-step procedure for adding a new field type (e.g., `url`) to the system. The procedure is designed so that **no existing view file is modified**.

### Step 1 — Extend `BranchType` in `@beech/core`

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

This is the only change to `@beech/core`. Turborepo will compile `@beech/core` before the apps, so the new type becomes available immediately.

### Step 2 — Add Validation in `@beech/core` (if required)

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
// apps/dashboard/src/components/fields/display/url.tsx

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
// apps/dashboard/src/components/fields/edit/url.tsx

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
// apps/dashboard/src/components/fields/registry.ts
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
   id: 'br05',
           alias: 'website',
        label: 'Sito Web',
        type: 'url',
}
```

### Step 7 — Write co-located tests

```typescript
// apps/dashboard/src/components/fields/display/url.test.tsx
import { render, screen } from '@testing-library/react';
import { UrlDisplay } from './url';

const branch = { id: 'br05', alias: 'website', label: 'Sito', type: 'url' as const };

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
| 3 | `components/fields/display/url.tsx` | New file |
| 4 | `components/fields/edit/url.tsx` | New file |
| 5 | `components/fields/registry.ts` | Add 2 imports + 2 object entries |
| 6 | `packages/core/src/seeds.ts` | Optional — add a `Branch` to a seed for testing |
| 7 | `display/url.test.tsx`, `edit/url.test.tsx` | New co-located test files |

**Zero modifications** to `FieldDisplay.tsx`, `FieldEdit.tsx`, `EntryEditorPage`, the table view, the gallery view, or any other consumer. The registry dispatch handles it all.

---

## 7. Content Views — Toolbar, Table & Gallery

### 7.1 ContentToolbar Architecture

`ContentToolbar` (`apps/dashboard/src/components/content-toolbar/`) is the orchestrator for all content list views. It receives the active `Seed` and drives filtering, sorting, search, grouping, and view switching — all without knowing which view (table or gallery) is rendered below it. Views are passed as children.

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
// apps/dashboard/src/components/content-toolbar/shared.ts
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

The hook `useToolbarFilters` (`apps/dashboard/src/hooks/use-toolbar-filters.ts`) builds the list of filterable columns from `seed.branches` at runtime. Two system columns are always prepended:

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

`ContentGallery` (`apps/dashboard/src/components/content-gallery/`) is a drop-in replacement for `DataTable` inside `ContentToolbar`. It receives the same already-filtered, already-sorted `ContentEntry[]` dataset that the table view uses — it introduces **no additional fetches**.

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
// apps/dashboard/src/components/content-gallery/resolve-card-fields.ts
export interface ResolvedCardFields {
  coverBranch: Branch | null
  titleBranch: Branch | null
  excerptBranch: Branch | null
  dateBranch: Branch | null
  tagsBranch: Branch | null
}
```