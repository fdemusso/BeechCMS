[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / viewConditionalFormatSchema

# Variable: viewConditionalFormatSchema

> `const` **viewConditionalFormatSchema**: `ZodObject`&lt;\{ `columnRef`: `ZodUnion`&lt;readonly \[`ZodEnum`&lt;\{ `created_at`: `"created_at"`; `slug`: `"slug"`; `status`: `"status"`; `updated_at`: `"updated_at"`; \}&gt;, `ZodString`\]&gt;; `conditions`: `ZodArray`&lt;`ZodObject`&lt;\{ `op`: `ZodEnum`&lt;\{ `contains`: `"contains"`; `eq`: `"eq"`; `gt`: `"gt"`; `gte`: `"gte"`; `is_empty`: `"is_empty"`; `is_not_empty`: `"is_not_empty"`; `lt`: `"lt"`; `lte`: `"lte"`; \}&gt;; `value`: `ZodUnion`&lt;readonly \[`ZodString`, `ZodNumber`, `ZodBoolean`, `ZodNull`\]&gt;; \}, `$strip`&gt;&gt;; `enabled`: `ZodBoolean`; `id`: `ZodString`; `label`: `ZodOptional`&lt;`ZodString`&gt;; `priority`: `ZodNumber`; `target`: `ZodEnum`&lt;\{ `element`: `"element"`; `field`: `"field"`; \}&gt;; `textStyles`: `ZodDefault`&lt;`ZodArray`&lt;`ZodEnum`&lt;\{ `bold`: `"bold"`; `italic`: `"italic"`; `underline`: `"underline"`; \}&gt;&gt;&gt;; `tone`: `ZodEnum`&lt;\{ `danger`: `"danger"`; `info`: `"info"`; `neutral`: `"neutral"`; `success`: `"success"`; `warning`: `"warning"`; \}&gt;; \}, `$strip`&gt;
