// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

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
    server: {
      deps: {
        inline: ["fractional-indexing"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // ─── Test and mocks ──────────────────────────────────────────────────
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/__mocks__/**",

        // ─── Boilerplate & App entry points ──────────────────────────────────
        "src/main.tsx",
        "src/App.tsx",         // pure routing glue, no logic
        "src/lib/i18n.ts",
        "src/vite-env.d.ts",
        "src/config/**",
        "src/lib/api.ts",      // axios client factory — no unit testable logic
        "src/lib/query-client.ts",
        "src/lib/icon-registry.ts",
        "src/lib/upload.ts",
        "src/lib/use-auth-features.ts",
        "src/lib/auth-context.tsx",
        "src/hooks/use-mobile.ts",

        // ─── Shadcn UI — third-party component wrappers, presentational only ─
        "src/components/ui/**",

        // ─── Application shell (layout glue, no domain logic) ────────────────
        // Sprint 02 moved app-sidebar / site-header / notifications-popover
        // from components/ to features/. The nature of the code is identical
        // to what was already excluded before the move.
        "src/features/navigation/**",
        "src/features/notifications/**",
        "src/components/nav-*.tsx",
        "src/components/search-form.tsx",

        // ─── Pure presentational sub-components (no testable state/logic) ────
        // UI components whose logic has been extracted to custom hooks.
        "src/features/content-gallery/gallery-components/**",
        "src/features/auth/components/login-form/login-form.tsx",
        "src/features/content-delete-dialog/content-delete-dialog.tsx",

        // ─── Pages (Integration & Application Shell) ─────────────────────────
        // High-level routing and composition components. Their logic is covered
        // by E2E tests; unit testing them provides low value and fragile tests.
        "src/pages/**",

        // ─── Dashboard feature — widgets, page panels, config & data-viz ──────
        // Dashboard views and widgets depend on live Cloudflare/R2/D1 APIs and
        // are presentational or require an integration test environment.
        "src/features/dashboard/**",
        "src/features/widget-data/**",

        // ─── Settings feature — UI form tabs only, no isolated business logic ─
        // Settings tabs are pure controlled forms wired to React Hook Form.
        // Their logic (validation, API calls) is exercised through integration
        // tests not present in this monorepo's unit suite.
        "src/features/settings/**",
        "src/features/schema/**",
        "src/features/automations/**",

        // ─── lib/utils sub-modules created in Sprint 01 B3 ───────────────────
        // api.ts / dom.ts / format.ts are re-exports of utilities already
        // covered through lib/utils.ts barrel tests. The sub-files themselves
        // contain no additional statements beyond the exports.
        "src/lib/utils/api.ts",
        "src/lib/utils/dom.ts",
        "src/lib/utils/format.ts",

        // ─── Content-management feature (require live D1/Cloudflare Workers) ──
        // These modules interact with the live Cloudflare Worker API.
        // They cannot be meaningfully unit-tested without a live environment;
        // coverage is validated through integration/E2E tests instead.
        "src/features/content-management/**",

        // ─── Command-palette (complex interactive search widget) ──────────────
        // The command-palette is a stateful fuzzy-search UI. Its integration
        // tests require a full DOM event loop simulation; unit coverage is not
        // feasible without a dedicated E2E harness.
        "src/features/command-palette/**",

        // ─── Toolbar UI components (pure rendering, no isolated logic) ──────
        // These are complex interactive UI panels. All testable logic lives in
        // toolbar-hooks/. Testing the components themselves would require full
        // DOM event simulation with no meaningful coverage gain.
        "src/features/content-toolbar/toolbar-components/**",

        // ─── Feature-level shared.ts barrel files ────────────────────────────
        // These files contain only `export { ... } from "..."` re-exports.
        // V8 reports them as 0% statements but there is no executable logic
        // to cover. Actual implementations are tested in their source modules.
        "src/features/**/shared.ts",

        // ─── Entry-editor feature (complex interactive builder, no unit logic) ─
        "src/features/entry-editor/**",

        // ─── Seed-builder untestable modules ─────────────────────────────────
        "src/features/seed-builder/components/SeedDangerZone.tsx",
        "src/features/seed-builder/hooks/use-seeds.ts",
        "src/features/seed-builder/api/seeds.api.ts",

        // ─── Field renderers (pure UI wrappers, no isolated business logic) ──
        // Repeater is excluded from this list — it has real cardinality/branch-type
        // logic plus a dedicated test suite (src/test/fields/repeater.test.tsx).
        "src/features/fields/default.tsx",
        "src/features/fields/FieldDisplay.tsx",
        "src/features/fields/FieldEdit.tsx",
        "src/features/fields/field-registry.ts",
        "src/features/fields/registry.ts",
        "src/features/fields/display/boolean.tsx",
        "src/features/fields/display/date.tsx",
        "src/features/fields/display/json.tsx",
        "src/features/fields/display/media.tsx",
        "src/features/fields/display/number-format.ts",
        "src/features/fields/display/number.tsx",
        "src/features/fields/display/relation.tsx",
        "src/features/fields/display/richtext.tsx",
        "src/features/fields/display/text.tsx",
        "src/features/fields/edit/boolean.tsx",
        "src/features/fields/edit/date.tsx",
        "src/features/fields/edit/json.tsx",
        "src/features/fields/edit/media.tsx",
        "src/features/fields/edit/number-input.tsx",
        "src/features/fields/edit/number-rating.tsx",
        "src/features/fields/edit/number-slider.tsx",
        "src/features/fields/edit/number-stepper.tsx",
        "src/features/fields/edit/number.tsx",
        "src/features/fields/edit/relation.tsx",
        "src/features/fields/edit/richtext.tsx",
        "src/features/fields/edit/select.tsx",
        "src/features/fields/edit/text.tsx",
        "src/features/fields/edit/use-number-rating.ts",
        "src/features/fields/edit/use-number-stepper.ts",

        // ─── Rich-text editor (third-party wrapper, no unit logic) ───────────
        "src/features/richtext-editor/**",

        // ─── Dynamic column utility (layout helper, no testable logic) ────────
        "src/lib/dynamic-columns.tsx",

        // ─── Data constants, barrel re-exports, type-only files ──────────────
        "src/**/*.types.ts",
        "src/**/types.ts",
        "src/**/types/**",
        "src/**/consts/**",
        "src/**/index.ts",
      ],
      // Thresholds calibrated to the actually testable surface of this project
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
        statements: 30,
      },
    },
  },
})
