[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / kanbanViewConfigSchema

# Variable: kanbanViewConfigSchema

> `const` **kanbanViewConfigSchema**: `ZodObject`&lt;\{ `axisBranchId`: `ZodNullable`&lt;`ZodString`&gt;; `cardSize`: `ZodOptional`&lt;`ZodEnum`&lt;\{ `comfortable`: `"comfortable"`; `compact`: `"compact"`; \}&gt;&gt;; `collapsedColumnValues`: `ZodOptional`&lt;`ZodArray`&lt;`ZodString`&gt;&gt;; `colorColumns`: `ZodOptional`&lt;`ZodBoolean`&gt;; `hiddenColumnValues`: `ZodOptional`&lt;`ZodArray`&lt;`ZodString`&gt;&gt;; `showFieldLabels`: `ZodOptional`&lt;`ZodBoolean`&gt;; `sort`: `ZodNullable`&lt;`ZodObject`&lt;\{ `branchId`: `ZodString`; `dir`: `ZodEnum`&lt;\{ `ASC`: `"ASC"`; `DESC`: `"DESC"`; \}&gt;; \}, `$strip`&gt;&gt;; `wrapTitle`: `ZodOptional`&lt;`ZodBoolean`&gt;; \}, `$strip`&gt;
