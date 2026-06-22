# `react-doctor/no-pass-data-to-parent`

Disallow passing data to parents in an effect.

- **Category:** State & Effects
- **Severity:** warn
- **Source:** eslint-plugin-react-you-might-not-need-an-effect
- **Framework:** global
- **Enabled when:** eslint-plugin-react-you-might-not-need-an-effect installed in project
- **Documentation:** <https://react.dev/learn/you-might-not-need-an-effect#passing-data-to-the-parent>

## Validation prompt

Use this to decide whether a fired diagnostic is real or a false positive.

Fires on a cleanup-less useEffect that synchronously calls a prop function (e.g. onChange(value)) where the argument is NOT itself a prop, state, ref, ref.current, or simple literal/object/array constant — meaning the child generated or fetched the value, then is shipping it back up. False positive: the child genuinely owns an external subscription (resize observer, WebSocket) the parent cannot subscribe to.

## Fix prompt

Use this once validation confirms the diagnostic is real.

Move the data acquisition (fetch, computation, subscription) up to the parent and pass the result down through props — top-down flow eliminates the extra render and clarifies ownership. If the logic must stay reusable, extract it into a custom hook the parent calls: const data = useThing(); then forward data via props. In a custom hook variant of this rule, return the value instead of forwarding through a callback. See https://react.dev/learn/you-might-not-need-an-effect#passing-data-to-the-parent
