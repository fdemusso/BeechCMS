---
title: Custom Dashboard Widgets
group: User & Builder Guide
category: Extending
---

# Custom Dashboard Widgets

The BeechCMS dashboard widget catalog is a **public extension point**. Developers can build, share, and register custom widgets as modular packages to display interactive analytics, external metrics, and custom visualizations inside the React admin dashboard.

## Security Model

> [!CAUTION]
> ### Critical Security Rules for Custom Widgets
> 
> 1. **Trusted Build-Time Code**: The BeechCMS dashboard is an edge-native static SPA. There is **no runtime sandbox or remote code execution**. A custom widget is trusted code compiled directly into your dashboard build. Only install packages you trust.
> 2. **Never Put Secrets in Widget Config**: Widget configuration is stored in the database (`dashboard_layouts`) and is readable by **any authenticated dashboard user**. Never store API secrets, private tokens, or database credentials inside widget config.
> 3. **Permission Boundaries**: Widgets use the authenticated session of the active user. They cannot access endpoints or data that the logged-in user lacks permissions to view.

## Quickstart

### Scaffold Package

Create a new widget package workspace:

```bash
mkdir my-widget && cd my-widget
pnpm init -y
pnpm install @beechcms/widget-sdk
pnpm install --save-dev typescript @types/react
```

Declare `react` and `@tanstack/react-query` as **peer dependencies**:

```jsonc
// package.json
{
  "name": "@acme/beech-widget-weather",
  "version": "1.0.0",
  "peerDependencies": {
    "react": "^19.0.0",
    "@tanstack/react-query": "^5.0.0"
  },
  "dependencies": {
    "@beechcms/widget-sdk": "^0.6.0"
  }
}
```

### Define Widget

Create your widget component and schema definition:

```tsx
import { z } from 'zod'
import {
  defineWidget,
  WidgetShell,
  WidgetEmpty,
  WidgetError,
  useWidgetAggregate,
  type DashboardWidgetProps,
} from '@beechcms/widget-sdk'
import { Cloud } from 'lucide-react'

// 1. Zod schema for widget settings
const configSchema = z.object({
  seedSlug: z.string().catch(''),
  window: z.enum(['week', 'month', 'year', 'all']).catch('month'),
})
type WeatherConfig = z.infer<typeof configSchema>

// 2. Main widget presentation component
function WeatherWidget({ config }: DashboardWidgetProps<WeatherConfig>) {
  const { data, isLoading, isError, refetch } = useWidgetAggregate(
    config.seedSlug,
    { op: 'count' },
    config.window
  )

  if (isError) {
    return (
      <WidgetShell title="Weather" icon={Cloud}>
        <WidgetError onRetry={() => refetch()} />
      </WidgetShell>
    )
  }

  if (!isLoading && !data?.value) {
    return (
      <WidgetShell title="Weather" icon={Cloud}>
        <WidgetEmpty icon={Cloud} title="No data available" />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell title="Weather" icon={Cloud}>
      <div className="text-2xl font-bold">{data?.value}</div>
    </WidgetShell>
  )
}

// 3. Widget definition export
export const weatherWidget = defineWidget({
  type: '@acme/beech-widget-weather',
  labelKey: 'Weather',
  descriptionKey: 'Displays metrics and counts for selected Seeds.',
  icon: 'Cloud',
  category: 'custom',
  configSchema,
  defaultConfig: { seedSlug: '', window: 'month' },
  component: WeatherWidget,
  minColumnSpan: 3,
})
```

### Register in Dashboard

Register your widget in `apps/dashboard/src/widgets.custom.ts`:

```typescript
import { registerWidget } from '@/features/dashboard'
import { weatherWidget } from '@acme/beech-widget-weather'

registerWidget(weatherWidget)
```

Add your package to `apps/dashboard/package.json` and build the dashboard. Your widget will immediately appear in the visual **Dashboard Builder** under the **Custom** category.

> [!NOTE]
> If a widget package is uninstalled later, stored layouts degrade gracefully to an "Unavailable Widget" placeholder without corrupting the layout or breaking the dashboard.

## SDK Reference

### `defineWidget` Helper

The `defineWidget<TConfig>()` helper provides full TypeScript type inference across configs, props, and panels:

- Validates that `type` follows namespacing conventions (`WIDGET_TYPE_REGEX`).
- Prevents reserved prefix collisions (the `core/` prefix is reserved for built-in widgets).

### Widget Definition Schema

| Property | Type | Description |
| :--- | :--- | :--- |
| `type` | `string` | Unique namespaced package identifier (e.g. `@acme/beech-widget-analytics`). |
| `labelKey` | `string` | Display name shown in the widget picker. |
| `descriptionKey` | `string?` | Short description explaining the widget's function. |
| `icon` | `string?` | Lucide icon name displayed on the widget card. |
| `category` | `'custom'` | Category in the builder picker (forced to `'custom'` for third-party widgets). |
| `configSchema` | `z.ZodType<TConfig>` | Zod validation schema. Always use `.catch()` or `.optional()` for backward compatibility. |
| `defaultConfig` | `TConfig` | Initial values populated when an editor adds the widget. |
| `component` | `ComponentType` | React component rendering the widget. Receives `{ instance, config }`. |
| `minColumnSpan` | `number?` | Minimum grid width out of 12 columns (default: 3). |
| `ConfigPanel` | `ComponentType?` | Optional custom settings panel rendered in the builder sheet. |

### Data Hooks

The SDK provides typed hooks that automatically share the TanStack Query cache with the rest of the dashboard:

- **`useWidgetAggregate(seedSlug, formula, window)`**: Computes counts, sums, or averages over a time window (`week`, `month`, `year`, `all`).
- **`useWidgetGrowth(seedSlug, formula, window)`**: Calculates percentage growth compared to the previous period.
- **`useWidgetTimeseries(seedSlug, formula, window, groupColumn)`**: Generates interval-bucketed time-series data for line/bar charts.
- **`useWidgetDistribution(seedSlug, column, window, limit)`**: Computes categorical distributions for pie and donut charts.
- **`useWidgetList(seedSlug, params)`**: Fetches recent Fruits with sorting and filtering.

```typescript
// Example: Computing monthly publication totals
const { data, isLoading } = useWidgetAggregate('posts', { op: 'count' }, 'month')
```

### Presentational Primitives

The SDK includes standard UI primitives to ensure visual consistency:

- **`WidgetShell`**: Standard card container with borders, padding, and optional header action buttons.
- **`WidgetEmpty`**: Clean empty-state placeholder with customizable icon and message.
- **`WidgetError`**: Error boundary card with an automatic retry button.

## Best Practices

### Config Guidelines
- **Automatic Seed Cleanup**: If your widget uses `config.seedSlug` and that Seed is later deleted by an admin, the dashboard automatically cleans up orphan widget instances.
- **Payload Limit**: Keep the serialized JSON configuration object under 8 KB.

### Localization & i18n
Custom widgets can use plain text strings for `labelKey` and `descriptionKey`. If your widget requires multilingual UI strings, you can bundle your own translation dictionaries within your component.

### Dependency Versioning
Always declare `@beechcms/widget-sdk`, `react`, and `@tanstack/react-query` as **peer dependencies** so that your widget stays compatible across dashboard updates.

## Example Package

You can find a complete, working reference package in the repository under [`docs/examples/widget-hello-world/`](file:///Users/flaviodemusso/Documents/Progetti/BeechCMS/docs/examples/widget-hello-world/), demonstrating schema validation, custom configuration panels, and data aggregation hooks.
