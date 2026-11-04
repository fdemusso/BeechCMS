// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// react-scan instruments every render, so it skews any timing taken with it on (LCP, long frames, request timing).
// Opt-in: start the dev server with VITE_REACT_SCAN=on when hunting wasted renders. `import.meta.env.DEV` is replaced
// at build time, so the dynamic import below (and the library, a devDependency) never reaches the production bundle.
if (typeof window !== 'undefined' && import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === 'on') {
  void import('react-scan').then(({ scan }) => scan({ enabled: true }))
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
import { queryCachePersistence } from '@/lib/query-cache-persistence'
import { ME_QUERY_KEY, schemaQueryOptions } from '@/features/shared'
import { WidgetSdkProvider } from '@beechcms/widget-sdk'
import { rpc } from '@/lib/rpc'
import '@/lib/i18n'
import App from './App.tsx'
import './widgets.custom'

// Schema and profile survive a reload of this tab: the page starts from them and revalidates in the background.
queryCachePersistence.start([schemaQueryOptions().queryKey, ME_QUERY_KEY])

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
