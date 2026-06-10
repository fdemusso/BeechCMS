# `react-doctor/no-prop-callback-in-effect`

Lift the shared state into a Provider so both sides read the same source — no useEffect-driven sync needed

- **Category:** State & Effects
- **Severity:** warn
- **Source:** oxlint-plugin-react-doctor
- **Framework:** global
- **Enabled when:** always

## Validation prompt

Use this to decide whether a fired diagnostic is real or a false positive.

Fires when a useEffect or useLayoutEffect with at least one non-prop Identifier in its deps calls a prop-named function (e.g. onChange(state)) at the effect's top level or inside if/try/for/switch blocks — the lift-state-via-callback anti-pattern. Calls nested inside setTimeout, addEventListener, or other sub-handlers are intentionally excluded; those belong to prefer-use-effect-event.

## Fix prompt

Use this once validation confirms the diagnostic is real.

Move the shared state into a Context Provider that both the child and the parent read via useContext or use(), so there is one source of truth and no useEffect-driven mirror. Alternatively, lift the state to the parent and pass value + setter down as props. See https://react.dev/learn/you-might-not-need-an-effect#passing-data-to-the-parent
