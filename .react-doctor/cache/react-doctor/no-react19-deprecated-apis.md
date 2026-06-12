# `react-doctor/no-react19-deprecated-apis`

Pass `ref` as a regular prop on function components — `forwardRef` is no longer needed in React 19+. Replace `useContext(X)` with `use(X)` for branch-aware context reads. Only enabled on projects detected as React 19+.

- **Category:** Architecture
- **Severity:** warn
- **Source:** oxlint-plugin-react-doctor
- **Framework:** global
- **Enabled when:** always

## Validation prompt

Use this to decide whether a fired diagnostic is real or a false positive.

Fires when forwardRef or useContext are imported from react (named, default, or namespace import — React.forwardRef and React.useContext member access included) on a detected React 19+ project. Both still execute correctly; the rule is an upgrade hint. useContext lacks the conditional/branch/loop support that use() provides, and forwardRef is unnecessary because refs are regular props on function components in React 19+.

## Fix prompt

Use this once validation confirms the diagnostic is real.

Drop the forwardRef wrapper and accept ref as a regular prop on the function component (props.ref). Replace useContext(MyContext) with use(MyContext) imported from react — use() can be called inside conditionals and loops, which useContext cannot. See https://react.dev/blog/2024/12/05/react-19#ref-as-a-prop
