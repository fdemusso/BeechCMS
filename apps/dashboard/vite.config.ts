// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  build: {
    outDir: 'dist/admin',
  },
  plugins: [
    react(), 
    tailwindcss(),
    visualizer({
      filename: 'stats.html',
      open: false, // metti a true se vuoi che si apra in automatico dopo la build
      gzipSize: true,
      brotliSize: true,
    }) as any, // "as any" per evitare conflitti di tipi con vite in alcune versioni
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8789', // Indirizzo del Worker locale
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://127.0.0.1:8789',
        changeOrigin: true,
      },
    },
  },
})
