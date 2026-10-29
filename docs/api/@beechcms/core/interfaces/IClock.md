[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IClock

# Interface: IClock

Time abstraction. Hides direct calls to [Date.now](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/now) so callers can
swap in deterministic clocks during tests without resorting to global
timer mocks (e.g. vi.useFakeTimers, sinon, monkey-patching Date).

## Methods

### now()

> **now**(): `number`

Returns the current Unix timestamp in milliseconds.
Equivalent to Date.now() in production.
Overridable in tests for deterministic time-sensitive assertions.

#### Returns

`number`

***

### nowSeconds()

> **nowSeconds**(): `number`

Returns the current Unix timestamp in whole seconds.
Equivalent to Math.floor(Date.now() / 1000) in production.
Used by JWT issuance, session expiry, and analytics day-bucket computations.

#### Returns

`number`
