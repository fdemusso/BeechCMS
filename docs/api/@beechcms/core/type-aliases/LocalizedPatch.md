[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LocalizedPatch

# Type Alias: LocalizedPatch

> **LocalizedPatch** = `Record`&lt;`string`, `unknown`&gt;

A validated write for a localized branch: registered locale code → new value, or `null` meaning
"clear this locale". Locales absent from the patch must be left untouched by the write path.
