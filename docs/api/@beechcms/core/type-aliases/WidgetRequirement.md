[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / WidgetRequirement

# Type Alias: WidgetRequirement

> **WidgetRequirement** = \{ `kind`: `"global-permission"`; `permission`: [`Permission`](Permission.md); \} \| \{ `kind`: `"seed-read"`; \} \| \{ `kind`: `"any-seed-read"`; \}

What a widget needs to be usable. Absent = usable by every caller.

## Union Members

### Type Literal

\{ `kind`: `"global-permission"`; `permission`: [`Permission`](Permission.md); \}

`permission` held at the global scope (`'*'`).

***

### Type Literal

\{ `kind`: `"seed-read"`; \}

`content:read` on `config.seedSlug`; a config naming no seed needs `content:read` on at least one seed.

***

### Type Literal

\{ `kind`: `"any-seed-read"`; \}

`content:read` on at least one scope.
