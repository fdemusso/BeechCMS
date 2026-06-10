# `react-doctor/only-export-components`

Move non-component exports out of files that export components.

- **Category:** Architecture
- **Severity:** warn
- **Source:** oxlint-plugin-react-doctor
- **Framework:** global
- **Enabled when:** always
- **Documentation:** <https://oxc.rs/docs/guide/usage/linter/rules/react/only-export-components>

## Validation prompt

Use this to decide whether a fired diagnostic is real or a false positive.

Fires only in .tsx/.jsx files (or .js with checkJS) that also export at least one React component, when the same module also exports a non-component value (utility fn, object, enum, createContext result), uses `export *`, ships an anonymous/unnamed default export, or defines a local component alongside exports — anything that breaks Vite/react-refresh Fast Refresh boundaries. Stable constants are NOT flagged (allowConstantExport defaults true), and `use[A-Z]` hook exports plus names in allowExportNames are always allowed. False positive: files conventionally exempted by basename (main/index/bootstrap entrypoints, icons/assets/utils/constants/types/hooks/*ShapeUtil/*Node files, test/spec/stories/cypress) are skipped, so a finding on such a path is likely stale or a misclassified filename.

## Fix prompt

Use this once validation confirms the diagnostic is real.

Split the module so the component file exports only components (and constants/hooks if your toolchain allows them): move utility functions, enums, objects, and `createContext(...)` calls into a sibling non-component file and re-import them (`import { ChatContext } from './context'`). Name anonymous defaults (`export default function Foo() {}` instead of `export default () => {}`), and replace `export *` with explicit named exports. If a non-component export is genuinely HMR-safe (e.g. a Remix `loader`/`meta`), add it to the rule's `allowExportNames` setting rather than disabling the rule. See https://oxc.rs/docs/guide/usage/linter/rules/react/only-export-components
