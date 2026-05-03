import path from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // Test and mocks
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/__mocks__/**",
        
        // Boilerplate & Config
        "src/main.tsx",
        "src/App.tsx",
        "src/i18n.ts",
        "src/vite-env.d.ts",
        "src/config/**",
        "src/lib/api.ts",
        "src/lib/query-client.ts",
        "src/lib/icon-registry.ts",
        
        // Shadcn UI (Purely presentational)
        "src/components/ui/**",
        
        // Non-business critical components (Purely layout/shell)
        "src/components/app-sidebar.tsx",
        "src/components/site-header.tsx",
        "src/components/nav-*.tsx",
        "src/components/search-form.tsx",
        "src/components/notifications-popover/**",
        
        // Demo/Lab pages
        "src/pages/test-fields.tsx",
        "src/pages/widget-lab.tsx",
        
        // Data constants and types
        "src/**/*.types.ts",
        "src/**/types.ts",
        "src/**/consts/**",
        "src/**/index.ts",
      ],
      // Thresholds set to represent the actual state of business logic testing
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
        statements: 30,
      },
    },
  },
})
