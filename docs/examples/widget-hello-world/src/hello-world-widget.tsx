// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { Sparkles } from 'lucide-react'
import { WidgetShell, WidgetEmpty, WidgetError, useWidgetAggregate, type DashboardWidgetProps } from '@beechcms/widget-sdk'
import type { HelloWorldConfig } from './config.js'

/** Renders the entry count for `config.seedSlug` over `config.window`. */
export function HelloWorldWidget({ config }: DashboardWidgetProps<HelloWorldConfig>) {
  const { data, isLoading, isError, refetch } = useWidgetAggregate(config.seedSlug, { op: 'count' }, config.window)

  if (!config.seedSlug) {
    return (
      <WidgetShell title={config.title ?? 'Hello World'} icon={Sparkles}>
        <WidgetEmpty icon={Sparkles} title="Pick a content type" description="Choose a seed in the widget settings." />
      </WidgetShell>
    )
  }

  if (isError) {
    return (
      <WidgetShell title={config.title ?? 'Hello World'} icon={Sparkles}>
        <WidgetError onRetry={() => refetch()} />
      </WidgetShell>
    )
  }

  return (
    <WidgetShell title={config.title ?? 'Hello World'} icon={Sparkles}>
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <span className="text-3xl font-semibold text-foreground">{isLoading ? '…' : data?.value ?? 0}</span>
        <span className="text-xs text-muted-foreground">entries in "{config.seedSlug}" ({config.window})</span>
      </div>
    </WidgetShell>
  )
}
