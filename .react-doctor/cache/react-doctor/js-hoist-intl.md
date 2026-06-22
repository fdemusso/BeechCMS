# `react-doctor/js-hoist-intl`

Hoist `new Intl.NumberFormat(...)` to module scope or wrap in `useMemo` — Intl constructors allocate dozens of objects per locale lookup

- **Category:** Performance
- **Severity:** warn
- **Source:** oxlint-plugin-react-doctor
- **Framework:** global
- **Enabled when:** always

## Validation prompt

Use this to decide whether a fired diagnostic is real or a false positive.

The rule fires on new Intl.X(...) where X is one of NumberFormat, DateTimeFormat, Collator, RelativeTimeFormat, ListFormat, PluralRules, Segmenter, or DisplayNames, AND the NewExpression sits inside a function body (FunctionDeclaration / FunctionExpression / ArrowFunctionExpression). Module-scope constructions are skipped. False positive when locale or options depend on per-call dynamic input that can't be cached.

## Fix prompt

Use this once validation confirms the diagnostic is real.

Hoist to module scope: const numberFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }); In React, when locale or options vary, wrap with useMemo(() => new Intl.NumberFormat(locale), [locale]). Each constructor loads and allocates locale-data tables that are expensive to rebuild per render or per list item. https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl
