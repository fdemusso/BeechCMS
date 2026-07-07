// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import 'katex/dist/katex.min.css'
import './index.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { WidgetSdkProvider } from '@beechcms/widget-sdk'
import { api } from '@/lib/api'
import '@/lib/i18n'
import '@/features/content-toolbar/view-registry.bootstrap'
import App from './App.tsx'
import './widgets.custom'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WidgetSdkProvider client={api}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange enableColorScheme storageKey="beech-theme">
          <TooltipProvider>
            <App />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </WidgetSdkProvider>
    </QueryClientProvider>
  </StrictMode>,
)
