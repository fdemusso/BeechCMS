// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'

/**
 * `seedSlug` is the magic key: when present, the dashboard auto-removes
 * this widget instance if the referenced seed is ever deleted.
 */
export const configSchema = z.object({
  seedSlug: z.string().catch(''),
  title: z.string().optional().catch(undefined),
  window: z.enum(['week', 'month', 'year', 'all']).catch('month'),
})

export type HelloWorldConfig = z.infer<typeof configSchema>

export const defaultConfig: HelloWorldConfig = {
  seedSlug: '',
  window: 'month',
}
