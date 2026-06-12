// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { defineWidget } from '@beechcms/widget-sdk'
import { configSchema, defaultConfig } from './config.js'
import { HelloWorldWidget } from './hello-world-widget.js'
import { HelloWorldConfigPanel } from './config-panel.js'

/**
 * Living documentation of the `@beechcms/widget-sdk` surface. Register via
 * `apps/dashboard/src/widgets.custom.ts`:
 *
 * ```ts
 * import { helloWorldWidget } from 'beech-widget-hello-world'
 * registerWidget(helloWorldWidget)
 * ```
 */
export const helloWorldWidget = defineWidget({
  type: 'beech-widget-hello-world',
  labelKey: 'Hello World',
  descriptionKey: 'Shows how many entries a content type has.',
  icon: 'Sparkles',
  category: 'custom',
  configSchema,
  defaultConfig,
  component: HelloWorldWidget,
  minColumnSpan: 3,
  ConfigPanel: HelloWorldConfigPanel,
})
