// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { HelloWorldConfig } from './config.js'

const INPUT_CLASS =
  'w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30'
const LABEL_CLASS = 'text-xs text-muted-foreground'

/** Minimal settings form rendered by the dashboard builder's config sheet. */
export function HelloWorldConfigPanel({
  config,
  onChange,
}: {
  config: HelloWorldConfig
  onChange: (next: HelloWorldConfig) => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={LABEL_CLASS}>Content type (seed slug)</label>
        <input
          className={INPUT_CLASS}
          value={config.seedSlug}
          placeholder="articoli"
          onChange={(e) => onChange({ ...config, seedSlug: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <label className={LABEL_CLASS}>Title (optional)</label>
        <input
          className={INPUT_CLASS}
          value={config.title ?? ''}
          placeholder="Hello World"
          onChange={(e) => onChange({ ...config, title: e.target.value || undefined })}
        />
      </div>
      <div className="space-y-1.5">
        <label className={LABEL_CLASS}>Window</label>
        <select
          className={INPUT_CLASS}
          value={config.window}
          onChange={(e) => onChange({ ...config, window: e.target.value as HelloWorldConfig['window'] })}
        >
          <option value="week">Week</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="all">All time</option>
        </select>
      </div>
    </div>
  )
}
