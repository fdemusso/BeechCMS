[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LOCALE\_CODE\_RE

# Variable: LOCALE\_CODE\_RE

> `const` **LOCALE\_CODE\_RE**: `RegExp`

Locale code grammar (v1): ISO 639 language (2–3 lowercase letters), optionally followed by an ISO 3166
region (2 uppercase letters) or a UN M.49 area (3 digits) — `it`, `en`, `pt-BR`, `es-419`. Script
subtags (`zh-Hant`) are outside v1. The grammar doubles as an injection guard: validated codes are
later interpolated into SQLite JSON paths.
