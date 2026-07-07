# `react-doctor/prefer-tag-over-role`

Replace role with the semantic HTML element when one exists.

- **Category:** Accessibility
- **Severity:** warn
- **Source:** oxlint-plugin-react-doctor
- **Framework:** global
- **Enabled when:** always
- **Documentation:** <https://oxc.rs/docs/guide/usage/linter/rules/jsx_a11y/prefer-tag-over-role>

## Validation prompt

Use this to decide whether a fired diagnostic is real or a false positive.

Fires only on a generic `<div>` or `<span>` (after JSX-element-type resolution) that carries a static `role` string which maps to at least one built-in HTML element with that implicit ARIA role — e.g. `<div role="button">`, `<span role="navigation">`, `<div role="list">`. Roles with no semantic equivalent (`role="unknown"`, `role="tablist"`) and roles applied to non-generic tags (`<header role="banner">`, `<ul role="list">`) never fire. False positive / non-trigger: a dynamically computed role like `role={someVar}` or `role={cond ? "button" : "link"}` is skipped because the static check can't read a non-literal value, so don't expect those to be flagged.

## Fix prompt

Use this once validation confirms the diagnostic is real.

Swap the generic element for the native tag that carries the role implicitly and drop the now-redundant `role`: `<div role="button">` becomes `<button>`, `<span role="navigation">` becomes `<nav>`. When a role maps to multiple tags the rule suggests only the first match in its internal table, so `<div role="list">` becomes `<menu>` (not `<ul>`) — review the suggestion and substitute the contextually correct element if another fits better. Native elements bring built-in keyboard, focus, and semantics that a role alone does not, so reach for the real element rather than reintroducing ARIA. See https://oxc.rs/docs/guide/usage/linter/rules/jsx_a11y/prefer-tag-over-role
