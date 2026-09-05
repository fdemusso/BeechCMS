# Custom Widgets SDK

BeechCMS supports two complementary extension paradigms to enrich the admin experience:

<p align="center">
  <img src="/images/widget-architecture.svg" alt="BeechCMS Dual Custom Widget Architecture" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

1. **Dashboard Analytics Widgets**: First-class React components compiled directly into the admin dashboard build to display interactive analytics, metrics, and custom charts.
2. **Sandboxed Iframe Field Widgets**: Isolated runtime controls embedded inside the Entry Editor communicating via a bidirectional PostMessage protocol.

---

## Security Model

> [!CAUTION]
> ### Security Boundaries
> 1. **Dashboard Analytics Widgets (Trusted Build-Time Code)**: The BeechCMS dashboard is an edge-native static SPA. There is no remote code execution; widgets are trusted React code compiled directly into the dashboard bundle. Never store private API secrets or master keys inside widget configuration (`dashboard_layouts` is accessible to authenticated users).
> 2. **Field Widgets (Isolated Runtime Sandbox)**: Custom field widgets execute within an iframe sandbox (`allow-scripts allow-forms allow-same-origin`) with zero access to parent cookies, local storage, or session tokens.

---

## Paradigm 1: Dashboard Analytics Widgets

Dashboard widgets are authored as React packages using `@beechcms/widget-sdk` and registered in `apps/dashboard/src/widgets.custom.ts`.

### 1. Define Settings Schema & Widget

```tsx
// my-widget.tsx
import { z } from 'zod'
import {
  defineWidget,
  WidgetShell,
  WidgetEmpty,
  WidgetError,
  useWidgetAggregate,
  type DashboardWidgetProps
} from '@beechcms/widget-sdk'
import { Activity } from 'lucide-react'

// 1. Zod schema for widget user configuration
const configSchema = z.object({
  seedSlug: z.string().catch('posts'),
  window: z.enum(['week', 'month', 'year', 'all']).catch('month')
})

type WidgetConfig = z.infer<typeof configSchema>

// 2. Main presentation component
function MetricsWidget({ config }: DashboardWidgetProps<WidgetConfig>) {
  const { data, isLoading, isError, refetch } = useWidgetAggregate(
    config.seedSlug,
    { op: 'count' },
    config.window
  )

  if (isError) {
    return (
      <WidgetShell title="Content Growth" icon={Activity}>
        <WidgetError onRetry={() => refetch()} />
      </WidgetShell>
    )
  }

  if (!isLoading && !data?.value) {
    return (
      <WidgetShell title="Content Growth" icon={Activity}>
        <WidgetEmpty icon={Activity} title="No records found" />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell title="Content Growth" icon={Activity}>
      <div className="text-3xl font-extrabold">{data?.value}</div>
      <p className="text-xs text-muted-foreground">Entries created this {config.window}</p>
    </WidgetShell>
  )
}

// 3. Export definition
export default defineWidget<WidgetConfig>({
  type: 'analytics.content-growth',
  labelKey: 'Content Growth',
  descriptionKey: 'Tracks total entries created over time',
  icon: Activity,
  category: 'analytics',
  configSchema,
  defaultConfig: { seedSlug: 'posts', window: 'month' },
  component: MetricsWidget,
  minColumnSpan: 1
})
```

### 2. Available SDK Hooks & UI Primitives

| SDK Primitive | Type | Description |
| :--- | :--- | :--- |
| `useWidgetAggregate` | Hook | Aggregates entries (`count`, `sum`, `avg`, `min`, `max`) over a time window. |
| `useWidgetGrowth` | Hook | Calculates percentage growth compared to preceding period. |
| `useWidgetTimeseries`| Hook | Returns bucketed time-series data for line/bar charts. |
| `useWidgetDistribution` | Hook | Calculates field value breakdowns for pie/doughnut charts. |
| `useWidgetList` | Hook | Fetches recent entries from a seed for activity tables. |
| `WidgetShell` | Component | Standard container providing card styling, title, icon, and actions. |
| `WidgetEmpty` | Component | Empty state placeholder with optional icon and call-to-action. |
| `WidgetError` | Component | Error fallback with automatic retry button. |

### 3. Registration in Dashboard

Register your widget in `apps/dashboard/src/widgets.custom.ts`:

```typescript
import { registerWidget } from '@beechcms/widget-sdk'
import contentGrowthWidget from './widgets/content-growth'

registerWidget(contentGrowthWidget)
```

---

## Paradigm 2: Sandboxed Iframe Field Widgets

Field widgets replace standard form controls in the Entry Editor with custom, sandboxed interactive components (such as visual color pickers, markdown editors, or geocoding map selectors).

### Widget Manifest (`widget.json`)

Distributable packages include a `widget.json` manifest:

```json
{
  "$schema": "https://beechcms.dev/schemas/widget-v1.json",
  "name": "@acme/beech-color-picker",
  "version": "1.0.0",
  "displayName": "Color Picker",
  "description": "Hex & RGBA color picker with visual swatch",
  "entry": "dist/index.html",
  "targetBranchTypes": ["text"],
  "options": {
    "defaultColor": "#FF6584"
  }
}
```

### PostMessage Communication Protocol

Host editor and iframe communicate bi-directionally using typed messages:

- **`BEECH_INIT` (Host &rarr; Widget)**: Sent when iframe loads, transmitting `{ type, value, schema, disabled, locale, theme }`.
- **`BEECH_CHANGE` (Widget &rarr; Host)**: Dispatched on input change, transmitting `{ type, value }`.
- **`BEECH_RESIZE` (Widget &rarr; Host)**: Dispatched to request dynamic iframe expansion, transmitting `{ type, height }`.

### Authoring a Custom Field Widget

```typescript
// src/main.ts
import { initWidgetBridge } from '@beechcms/widget-sdk'

const colorInput = document.getElementById('color') as HTMLInputElement
const hexLabel = document.getElementById('hex') as HTMLSpanElement

const bridge = initWidgetBridge({
  onInit: ({ value, disabled, theme }) => {
    if (value && typeof value === 'string') {
      colorInput.value = value
      hexLabel.textContent = value
    }
    colorInput.disabled = disabled
    document.body.className = theme
  },
  onThemeChange: (theme) => {
    document.body.className = theme
  }
})

colorInput.addEventListener('input', (e) => {
  const target = e.target as HTMLInputElement
  hexLabel.textContent = target.value
  bridge.sendChange(target.value)
})
```
