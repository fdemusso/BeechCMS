// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { WidgetSdkClient } from '@beechcms/widget-sdk'

/** Reads like a request: the widget route's URL and its query, answered as `{ data }`. */
export type WidgetGet = (url: string, config: { params: Record<string, unknown> }) => Promise<{ data: unknown }>

/**
 * A widget SDK client for tests whose every route is answered by one `get('/widget/<route>/<seed>',
 * { params })` spy, so a test states which URL it expects and what comes back without rebuilding
 * the nested `hc` shape by hand.
 */
export function widgetClientFromGet(get: WidgetGet): WidgetSdkClient {
  const route = <Name extends keyof WidgetSdkClient>(name: Name): WidgetSdkClient[Name] => ({
    ':seed': {
      $get: async ({ param, query }: { param: { seed: string }; query: object }) => ({
        json: async () => (await get(`/widget/${name}/${param.seed}`, { params: { ...query } })).data,
      }),
    },
  }) as unknown as WidgetSdkClient[Name]

  return {
    aggregate: route('aggregate'),
    growth: route('growth'),
    timeseries: route('timeseries'),
    distribution: route('distribution'),
    list: route('list'),
  }
}
