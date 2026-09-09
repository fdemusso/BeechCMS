[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / BLOCKED\_IMAGE\_EXTENSIONS

# Variable: BLOCKED\_IMAGE\_EXTENSIONS

> `const` **BLOCKED\_IMAGE\_EXTENSIONS**: `ReadonlySet`&lt;`string`&gt;

SVG is intentionally blocked from general file upload as it can embed executable scripts
creating a stored XSS vulnerability when served directly to browsers.
