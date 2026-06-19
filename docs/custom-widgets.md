# Custom Dashboard Widgets

The Beech CMS dashboard widget catalog is a **public extension point**.
Third-party widgets are pnpm packages, registered **at build time**, and
configured in the dashboard builder exactly like built-in widgets.

## Security model (read this first)

Per decision **D9**, the dashboard is a static SPA deployed to the edge.
There is **no runtime plugin loader, no remote code execution, and no
sandbox**. A custom widget is **trusted code compiled into the operator's
own dashboard build** — the same trust level as any other pnpm dependency.

Consequences:

- Only install widget packages you trust, the same way you'd vet any
  dependency.
- **Never put secrets in widget config.** Widget config is stored
  server-side in the `dashboard_layouts` table and is readable by **any
  authenticated dashboard user** via the layout API — it is not a secure
  store.
- Widgets consume the same authenticated `/api/widget/*` and
  `/api/content/stats/*` endpoints as built-ins, via the injected HTTP
  client — they cannot reach endpoints the logged-in user couldn't already
  reach.

## Quick start

### 1. Scaffold a package

```bash
mkdir my-widget && cd my-widget
pnpm init -y
pnpm install @beechcms/widget-sdk
pnpm install --save-dev typescript @types/react
```

Declare `react` and `@tanstack/react-query` as **peer dependencies** —
the dashboard provides both:

```jsonc
// package.json
{
  "name": "@acme/beech-widget-weather",
  "peerDependencies": {
    "react": "^19.0.0",
    "@tanstack/react-query": "^5.0.0"
  },
  "dependencies": {
    "@beechcms/widget-sdk": "^0.6.0"
  }
}
```

### 2. Define the widget

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

const configSchema = z.object({
  seedSlug: z.string().catch(''),
  window: z.enum(['week', 'month', 'year', 'all']).catch('month'),
})
type WeatherConfig = z.infer<typeof configSchema>

function WeatherWidget({ config }: DashboardWidgetProps<WeatherConfig>) {
  const { data, isLoading, isError, refetch } = useWidgetAggregate(config.seedSlug, { op: 'count' }, config.window)

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
        <WidgetEmpty icon={Cloud} title="No data" />
      </WidgetShell>
    )
  }
  return (
    <WidgetShell title="Weather" icon={Cloud}>
      <div>{data?.value}</div>
    </WidgetShell>
  )
}

export const weatherWidget = defineWidget({
  type: '@acme/beech-widget-weather',
  labelKey: 'Weather',
  descriptionKey: 'Shows entry counts for a content type.',
  icon: 'Cloud',
  category: 'custom',
  configSchema,
  defaultConfig: { seedSlug: '', window: 'month' },
  component: WeatherWidget,
  minColumnSpan: 3,
  // ConfigPanel?: ComponentType<{ config: WeatherConfig; onChange: (next: WeatherConfig) => void }>
})
```

### 3. Install it in the dashboard

The **only supported installation mechanism** is
`apps/dashboard/src/widgets.custom.ts`:

```ts
import { registerWidget } from '@/features/dashboard'
import { weatherWidget } from '@acme/beech-widget-weather'

registerWidget(weatherWidget)
```

Add the package as a dependency of `apps/dashboard/package.json`, then
rebuild the dashboard. The widget appears in the builder picker under
**Custom**, can be configured, saved, and rendered.

If the package is later uninstalled (or its registration commented out),
any stored layout referencing the widget degrades to an
"unavailable widget" placeholder on render and is passed through unchanged
on the next save — the layout is never corrupted.

## Contract reference

### `defineWidget<TConfig>(definition)`

Identity helper — returns `definition` unchanged, but:

- Gives full type inference for `TConfig` across `configSchema`,
  `defaultConfig`, `component`, and `ConfigPanel`.
- Throws if `definition.type` starts with `core/` (reserved for built-ins).
- Throws if `definition.type` doesn't match `WIDGET_TYPE_REGEX`
  (`/^[a-z0-9@][a-z0-9@/_-]*$/`).

### `WidgetDefinition<TConfig>`

| Field | Type | Notes |
|---|---|---|
| `type` | `string` | Namespaced: your pnpm package name, optionally `pkg/sub-name` for multi-widget packs (e.g. `@acme/beech-widgets/clock`). |
| `labelKey` | `string` | Picker label. Built-ins use i18n keys; custom widgets may use a plain string. |
| `descriptionKey` | `string?` | Picker description. |
| `icon` | `string?` | Lucide icon name for the picker. |
| `category` | `'stats' \| 'charts' \| 'content' \| 'system' \| 'custom'` | `registerWidget` **forces `'custom'`** for any `type` without the `core/` prefix, regardless of what you declare. |
| `configSchema` | `z.ZodType<TConfig>` | Must parse successfully on a partial/empty object — use `.catch()`/`.optional()` everywhere so a stored layout never fails to load. |
| `defaultConfig` | `TConfig` | Used when placing a new instance. |
| `component` | `ComponentType<DashboardWidgetProps<TConfig>>` | Receives `{ instance, config }`. |
| `minColumnSpan` | `number?` | Builder hint: minimum column span out of 12. |
| `ConfigPanel` | `ComponentType<{ config: TConfig; onChange: (next: TConfig) => void }>?` | Rendered in the builder's config sheet. Absent ⇒ "no options" notice. |

### Data hooks

All hooks share the dashboard's `['widget', ...]` query-key scheme, so
built-in and custom widgets fetching the same data share the TanStack Query
cache:

- `useWidgetAggregate(seedSlug, formula, window)`
- `useWidgetGrowth(seedSlug, formula, window)`
- `useWidgetTimeseries(seedSlug, formula, window, groupColumn)`
- `useWidgetDistribution(seedSlug, column, window, limit)`
- `useWidgetList(seedSlug, params)`

`formula: AggregateFormula`, `window: TimeWindow` ('week' | 'month' | 'year'
| 'all'), and `DistributionSlice` are re-exported from the SDK.

These hooks call `useWidgetSdkClient()` internally — they only work inside
a `<WidgetSdkProvider>`, which the dashboard mounts once in `main.tsx` with
its authenticated Axios instance. **Never import or hardcode an HTTP client
in a widget** — always go through these hooks.

### Presentational primitives

- `WidgetShell` — card chrome (border, padding, optional header with
  `title`/`icon`/`action`, or `bare` for full-bleed content).
- `WidgetEmpty` — "nothing to show" placeholder (`icon`, `title`,
  `description?`).
- `WidgetError` — error state with optional retry button
  (`message?`, `onRetry?`, `retryLabel?`). Has no i18n dependency — pass
  localized strings yourself if needed.

## Config conventions

- **`seedSlug` key ⇒ auto-cleanup.** If `config.seedSlug` is set and that
  seed is later deleted from the schema, the widget instance is
  automatically dropped from the layout — you don't need to handle a
  "seed no longer exists" state.
- **8 KB cap.** The serialized `config` object for a single widget instance
  must stay under 8 KB.
- **No secrets.** See the security section above.

## i18n

`labelKey`/`descriptionKey` accept plain strings for custom widgets — the
picker does not require them to resolve through `i18next`. If your widget
needs localized UI copy, bring your own translation strings/library inside
your component; the SDK does not impose one.

## Versioning

Declare `@beechcms/widget-sdk`, `react`, and `@tanstack/react-query` as
**peer dependency ranges**, not exact pins, so your widget stays compatible
across dashboard upgrades that bump patch/minor versions of these packages.

## Type collisions

`registerWidget` throws if `type` is already registered. Namespace your
`type` with your package name (e.g. `@acme/beech-widget-weather`) — a
collision is a packaging bug to fix, not something the dashboard resolves
at runtime.

## Worked example

`examples/widget-hello-world/` in this repo is a minimal, fully working
widget package exercising the whole SDK surface (`defineWidget`, a config
schema, `ConfigPanel`, and a `useWidgetAggregate` call) — use it as a
template.

## CLI scaffolding

There is currently no `beech create-widget` scaffold command. This is a
natural follow-up for the `docs/Sprints/dev-cli/` series; for now, copy
`examples/widget-hello-world/`.
