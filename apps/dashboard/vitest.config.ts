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
        // Entry-point / shell app non business-critical per logica dashboard.
        "src/main.tsx",
        "src/App.tsx",
        "src/config/**/*",
        // Pagine/demo non usate nei flussi business.
        "src/pages/test-fields.tsx",
        // Shell di navigazione/layout.
        "src/components/app-sidebar.tsx",
        "src/components/nav-main.tsx",
        "src/components/nav-projects.tsx",
        "src/components/nav-secondary.tsx",
        "src/components/nav-user.tsx",
        "src/components/search-form.tsx",
        "src/components/site-header.tsx",
        // Fields rendering/editing atomici: coperti indirettamente nei flussi editor/lista.
        "src/components/fields/default.tsx",
        "src/components/fields/types.ts",
        "src/components/fields/FieldDisplay.tsx",
        "src/components/fields/FieldEdit.tsx",
        "src/components/fields/display/**/*",
        "src/components/fields/edit/boolean.tsx",
        "src/components/fields/edit/date.tsx",
        "src/components/fields/edit/json.tsx",
        "src/components/fields/edit/number.tsx",
        "src/components/fields/edit/text.tsx",
        // Toolbar components voluminosi ma prevalentemente presentazionali.
        "src/components/content-toolbar/toolbar-components/**/*",
        "src/components/content-toolbar/types.ts",
        "src/components/notifications-popover/types.ts",
        // Wrapper UI non business-critical: copertura non significativa lato dominio.
        "src/components/ui/alert-dialog.tsx",
        "src/components/ui/avatar.tsx",
        "src/components/ui/breadcrumb.tsx",
        "src/components/ui/collapsible.tsx",
        "src/components/ui/context-menu.tsx",
        "src/components/ui/data-table.tsx",
        "src/components/ui/dropdown-menu.tsx",
        "src/components/ui/empty.tsx",
        "src/components/ui/expandable-cell.tsx",
        "src/components/ui/field.tsx",
        "src/components/ui/tooltip.tsx",
        "src/components/ui/select.tsx",
        "src/components/ui/popover.tsx",
        "src/components/ui/sidebar.tsx",
        "src/components/ui/scroll-area.tsx",
        "src/components/ui/separator.tsx",
        "src/components/ui/sheet.tsx",
        "src/components/ui/sonner.tsx",
        "src/components/ui/tabs.tsx",
        "src/components/ui/toggle-group.tsx",
        // Widget system: componenti presentazionali e hook di fetch, nessuna logica testabile isolata.
        "src/pages/widget-lab.tsx",
        "src/features/dashboard/components/widgets/**/*",
        "src/features/dashboard/components/widget-registry.tsx",
        "src/features/dashboard/components/dashboard-widget-shell.tsx",
        "src/features/dashboard/components/widget-error-boundary.tsx",
        "src/features/dashboard/types/widget.types.ts",
        "src/features/widget-data/**/*",
        // Hook/API non core per questa baseline coverage.
        "src/hooks/use-mobile.ts",
        "src/lib/api.ts",
      ],
    },
  },
})
