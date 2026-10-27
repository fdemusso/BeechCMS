// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Instruments every render, so it is itself a load-time cost. Dev only, and
// opt-out with VITE_REACT_SCAN=off when profiling the app's own performance.
if (typeof window !== 'undefined' && import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN !== 'off') {
  // Dynamic import so the library never lands in the production bundle.
  void import('react-scan').then(({ scan }) =>
    scan({
      enabled: true,
      log: true, // Registra anche i log in console
    }),
  )
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@/lib/theme'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import 'katex/dist/katex.min.css'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { WidgetSdkProvider } from '@beechcms/widget-sdk'
import { rpc } from '@/lib/rpc'
import '@/lib/i18n'
import App from './App.tsx'
import './widgets.custom'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WidgetSdkProvider client={rpc.api.widget}>
        <ThemeProvider>
          <TooltipProvider>
            <App />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </WidgetSdkProvider>
    </QueryClientProvider>
  </StrictMode>,
)
