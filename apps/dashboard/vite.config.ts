import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/admin/',
  build: {
    outDir: 'dist/admin',
  },
  plugins: [react(), tailwindcss()],
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
