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
        "src/**/*.test.{ts,tsx}",
        "**/*.d.ts",
        "src/test/**/*",
        // Wrapper UI non business-critical: copertura non significativa lato dominio.
        "src/components/ui/tooltip.tsx",
        "src/components/ui/select.tsx",
        "src/components/ui/popover.tsx",
        "src/components/ui/sidebar.tsx",
        "src/components/ui/scroll-area.tsx",
      ],
    },
  },
})
