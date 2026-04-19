# 🧩 Dashboard Widgets & Grid System

BeechCMS uses a **pluggable, grid-based dashboard** designed for maximum flexibility. Both the BeechCMS developer and external programmers integrating the CMS for their clients can customize the dashboard in minutes — without touching layout code.

---

## 🏗️ The 8-Column Grid

The dashboard uses a **8-column CSS Grid** layout.

| Property | Value |
| :--- | :--- |
| Columns | **8** (`lg:grid-cols-8`) |
| Row sizing | Auto (`auto-rows-min`) |
| Gap | `1.5rem` (`gap-6`) |
| Responsive collapse | 4 cols at `md`, 2 cols at `sm`, 1 col on mobile |

Widgets declare their width and height as grid spans in the configuration:

```typescript
span: { w: 4, h: 2 }   // spans 4 columns and 2 rows
```

> [!IMPORTANT]
> Span values are **automatically clamped** by the grid renderer.  
> A widget with `w: 10` on an 8-column grid will be clamped to `w: 8`.  
> Heights are clamped to a maximum of 12 rows. Negative or zero values fall back to 1.

---

## 🛡️ Widget Error Boundary

Every widget is automatically wrapped in a `WidgetErrorBoundary`.

- If a widget throws a runtime error, a **graceful fallback card** is shown instead of a blank screen.
- The boundary logs the error to the console with the widget's ID for easy debugging.
- The rest of the dashboard continues to render normally.

**You do not need to add the boundary manually.** The `WidgetRegistry` applies it automatically.

---

## 🎨 `DashboardWidgetShell` — Standard Container

Use `DashboardWidgetShell` to give your widget the **BeechCMS glass-card look** without repeating styling.

```tsx
import { DashboardWidgetShell } from "@/features/dashboard"

export function MyWidget() {
  return (
    <DashboardWidgetShell>
      <h3 className="font-semibold">My Widget Title</h3>
      <p className="text-muted-foreground">Content here…</p>
    </DashboardWidgetShell>
  )
}
```

### Props

| Prop | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `children` | `ReactNode` | — | Widget content |
| `className` | `string` | — | Extra Tailwind classes |
| `bare` | `boolean` | `false` | Skip all glass styling (use for full-bleed widgets e.g. image galleries) |

---

## 🛠️ How to Create a New Widget — Step-by-Step

### Step 1 — Register the Type
Add your widget name to the `WidgetType` union in:
`apps/dashboard/src/features/dashboard/types/widget.types.ts`

```typescript
export type WidgetType =
  | "stat"
  | "recent-activity"
  | "my-widget"    // ← add here
```

### Step 2 — Create the Component
Create a new file in:
`apps/dashboard/src/features/dashboard/components/`

```tsx
// my-widget.tsx
import { DashboardWidgetShell } from "./dashboard-widget-shell"

export function MyWidget() {
  return (
    <DashboardWidgetShell>
      <p className="text-sm text-muted-foreground">Hello from MyWidget!</p>
    </DashboardWidgetShell>
  )
}
```

> [!TIP]  
> Use `DashboardWidgetShell` for the standard glass-card look.  
> Use `<DashboardWidgetShell bare>` if you want full control over the outer container.

### Step 3 — Register in the Registry
Open `widget-registry.tsx` and add your case:

```tsx
// widget-registry.tsx
import { MyWidget } from "./my-widget"

// ... inside WidgetContent:
if (type === "my-widget") return <MyWidget />
```

### Step 4 — Add to the Layout Config
Open `apps/dashboard/src/features/dashboard/config/dashboard.config.ts` and add an instance:

```typescript
{ id: "my-widget-1", type: "my-widget", x: 0, y: 5, span: { w: 4, h: 1 } }
```

Done. ✅ The widget will appear on the dashboard at the next page load.

---

## 📋 Widget Instance Reference

| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier. Used for error boundary log messages. |
| `type` | `WidgetType` | Component to render — must match a case in `WidgetRegistry`. |
| `x` | `number` | Intended starting column (0-based). Informational only; layout is managed by grid order. |
| `y` | `number` | Intended starting row. Informational only. |
| `span.w` | `number` | Column span (1–8). Clamped automatically. |
| `span.h` | `number` | Row span (1–12). Clamped automatically. |
| `title` | `string?` | Optional title override. Widgets can read this from `instance.title`. |
| `props` | `Record<string, any>?` | Arbitrary config passed to the widget via the registry. |

---

## 🏛️ Architecture Diagram

```
dashboard-page.tsx
  └── grid loop (clamped spans)
        └── WidgetErrorBoundary      ← crash isolation
              └── WidgetRegistry     ← type → component resolver
                    └── <WidgetComponent />
                          └── DashboardWidgetShell  ← optional, for glass styling
```

---

## 📚 Related Files

| File | Purpose |
| :--- | :--- |
| `types/widget.types.ts` | Type definitions for all widgets and the dashboard config |
| `config/dashboard.config.ts` | Layout configuration (which widgets, where, how large) |
| `components/widget-registry.tsx` | Type → component resolver |
| `components/widget-error-boundary.tsx` | Crash isolation per widget |
| `components/dashboard-widget-shell.tsx` | Standard glass-card container |
| `pages/dashboard-page.tsx` | Grid renderer |
