// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { WIDGET_TYPE_REGEX } from '@beechcms/core'
import type { WidgetDefinition } from './widget-definition.js'

/**
 * Identity helper that gives widget authors full type inference for
 * `defineWidget<TConfig>(...)` while validating the widget `type`.
 *
 * - `type` must match {@link WIDGET_TYPE_REGEX}.
 * - The `core/` prefix is reserved for built-in widgets and is rejected.
 */
export function defineWidget<TConfig>(definition: WidgetDefinition<TConfig>): WidgetDefinition<TConfig> {
  if (definition.type.startsWith('core/')) {
    throw new Error(
      `defineWidget: type "${definition.type}" uses the reserved "core/" prefix, which is reserved for built-in widgets.`,
    )
  }
  if (!WIDGET_TYPE_REGEX.test(definition.type)) {
    throw new Error(
      `defineWidget: type "${definition.type}" is invalid. It must match ${WIDGET_TYPE_REGEX}.`,
    )
  }
  return definition
}
