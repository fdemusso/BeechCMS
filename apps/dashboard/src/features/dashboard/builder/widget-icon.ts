// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

import {
  Chart,
  ChartBar,
  ChartLine,
  Checklist,
  ClipboardAdd,
  Clipboard,
  History,
  Images,
  Sparkles,
  Text,
} from '@/components/icons'
import { resolveIcon, type IconComponent } from '@/lib/icon-registry'

/**
 * The icons widgets name in their definitions that the shared registry (built for content types) does not
 * hold. Kept here so the registry's picker for content types does not grow a list of dashboard-only icons.
 */
const WIDGET_ICONS: Record<string, IconComponent> = {
  LineChart: ChartLine,
  BarChart3: ChartBar,
  AreaChart: Chart,
  History,
  HeartPulse: History,
  Sparkles,
  FilePlus: ClipboardAdd,
  ClipboardList: Clipboard,
  Images,
  ListChecks: Checklist,
  Type: Text,
}

export function resolveWidgetIcon(name: string | undefined): IconComponent {
  return (name && Object.hasOwn(WIDGET_ICONS, name) ? WIDGET_ICONS[name] : undefined) ?? resolveIcon(name)
}
