// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import type { DashboardWidgetInstance } from '@beechcms/core'
import { AlertTriangle } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { resolveWidgetIcon } from '../widget-icon'
import { getWidgetDefinition, isWidgetDisabled } from '../../registry/widget-registry'
import {
  ActionsGhost,
  ChartGhost,
  ChecklistGhost,
  FormGhost,
  GalleryGhost,
  GenericGhost,
  ListGhost,
  MeterGhost,
  PieGhost,
  StatGhost,
  StatTrioGhost,
  StatusGhost,
  TableGhost,
  TextGhost,
  type ArchetypeProps,
} from './archetypes'

/** Which ghost draws which built-in widget. Anything else (custom widgets) gets the generic card. */
const ARCHETYPE_BY_TYPE: Record<string, { Ghost: React.ComponentType<ArchetypeProps>; variant?: string }> = {
  'core/stat': { Ghost: StatGhost },
  'core/publication-stats': { Ghost: StatTrioGhost },
  'core/line-chart': { Ghost: ChartGhost, variant: 'line' },
  'core/area-chart': { Ghost: ChartGhost, variant: 'area' },
  'core/bar-chart': { Ghost: ChartGhost, variant: 'bar' },
  'core/pie-chart': { Ghost: PieGhost },
  'core/content-pulse': { Ghost: PieGhost },
  'core/data-table': { Ghost: TableGhost },
  'core/recent-content': { Ghost: ListGhost },
  'core/pending-drafts': { Ghost: ListGhost },
  'core/recent-activity': { Ghost: ListGhost },
  'core/activity-feed': { Ghost: ListGhost },
  'core/media-gallery': { Ghost: GalleryGhost },
  'core/text': { Ghost: TextGhost },
  'core/quick-draft': { Ghost: FormGhost },
  'core/quick-actions': { Ghost: ActionsGhost },
  'core/setup-checklist': { Ghost: ChecklistGhost },
  'core/storage': { Ghost: MeterGhost },
  'core/site-status': { Ghost: StatusGhost },
  'core/system-health': { Ghost: StatusGhost },
}

const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** A widget bound to a seed that has not been picked yet cannot show anything on the dashboard. */
export function widgetNeedsSetup(widget: DashboardWidgetInstance): boolean {
  return widget.config?.seedSlug === ''
}

/** What a ghost draws from: change any of it and the ghost redraws, change nothing else and it does not. */
function ghostKey(widget: DashboardWidgetInstance): string {
  const c = widget.config ?? {}
  return [widget.id, widget.type, widget.title, str(c.variant), str(c.seedSlug), str(c.content), str(c.align)].join('|')
}

function UnavailableGhost({ widget, disabled }: { readonly widget: DashboardWidgetInstance; readonly disabled: boolean }) {
  const { t } = useTranslation()
  const def = getWidgetDefinition(widget.type)
  return (
    <div className="flex min-h-24 h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-400/60 p-4 text-center">
      <AlertTriangle className="size-4 text-amber-500" />
      <p className="text-sm text-muted-foreground">
        {disabled ? t('dashboard.widgetRegistry.disabled') : t('dashboard.widgetRegistry.unknown')}{' '}
        <span className="font-mono font-semibold">{def ? t(def.labelKey) : widget.type}</span>
      </p>
    </div>
  )
}

/**
 * One widget as the builder draws it: inert, data-less, shaped like the card the dashboard will show. It is
 * memoised on exactly what it draws, because the builder clones the whole draft on every change and the
 * widget objects never keep their identity.
 */
export const WidgetGhost = React.memo(
  function WidgetGhost({ widget }: { readonly widget: DashboardWidgetInstance }) {
    const { t } = useTranslation()
    const def = getWidgetDefinition(widget.type)
    if (!def || isWidgetDisabled(widget.type)) return <UnavailableGhost widget={widget} disabled={Boolean(def)} />

    const entry = ARCHETYPE_BY_TYPE[widget.type]
    const Ghost = entry?.Ghost ?? GenericGhost
    const seedSlug = str(widget.config?.seedSlug)
    const variant = entry?.variant ?? str(widget.config?.variant)

    const tag = widgetNeedsSetup(widget) ? (
      <Badge variant="outline" className="border-amber-400/60 text-[10px] text-amber-600">
        {t('dashboard.builder.widget.needsSetup')}
      </Badge>
    ) : seedSlug ? (
      <Badge variant="secondary" className="text-[10px]">{seedSlug}</Badge>
    ) : undefined

    const Icon = resolveWidgetIcon(def.icon)
    return (
      <div aria-hidden className="pointer-events-none select-none">
        <Ghost
          seed={widget.id}
          variant={variant}
          text={str(widget.config?.content)}
          align={widget.config?.align === 'center' ? 'center' : 'left'}
          shell={{ icon: Icon, title: widget.title || t(def.labelKey), tag }}
        />
      </div>
    )
  },
  (prev, next) => ghostKey(prev.widget) === ghostKey(next.widget),
)
