// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Component } from "react"
import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

interface Props {
  widgetId: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * WidgetErrorBoundary — wraps individual widgets to prevent one
 * failing widget from crashing the entire dashboard.
 *
 * When a widget throws, the boundary renders a graceful fallback
 * card instead of a blank screen.
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // In production you could pipe this to an observability service
    console.error(`[BeechCMS] Widget "${this.props.widgetId}" crashed:`, error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-rose-300/40 bg-rose-500/5 p-4 text-center">
          <AlertTriangle className="h-5 w-5 text-rose-400" />
          <p className="text-xs font-medium text-rose-400">
            Widget non disponibile
          </p>
          <p className="text-[10px] text-muted-foreground">
            ID: <span className="font-mono">{this.props.widgetId}</span>
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
