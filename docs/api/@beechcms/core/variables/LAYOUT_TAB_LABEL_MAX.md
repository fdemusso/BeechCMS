[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LAYOUT\_TAB\_LABEL\_MAX

# Variable: LAYOUT\_TAB\_LABEL\_MAX

> `const` **LAYOUT\_TAB\_LABEL\_MAX**: `15` = `15`

Label limits. The layout builder enforces the same numbers on its inputs; the server enforces them for
real: a longer label can only come from a client other than the dashboard, and is refused (422) rather
than shortened.
