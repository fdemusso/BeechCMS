[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / seedViewConfigSchema

# Variable: seedViewConfigSchema

> `const` **seedViewConfigSchema**: `ZodObject`&lt;\{ `card`: `ZodOptional`&lt;`ZodObject`&lt;\{ `header`: `ZodOptional`&lt;`ZodNullable`&lt;`ZodObject`&lt;\{ `branchId`: `ZodString`; \}, `$strip`&gt;&gt;&gt;; `media`: `ZodOptional`&lt;`ZodNullable`&lt;`ZodObject`&lt;\{ `branchId`: `ZodString`; \}, `$strip`&gt;&gt;&gt;; `metadata`: `ZodDefault`&lt;`ZodArray`&lt;`ZodObject`&lt;\{ `branchId`: `ZodString`; \}, `$strip`&gt;&gt;&gt;; `subtitle`: `ZodOptional`&lt;`ZodNullable`&lt;`ZodObject`&lt;\{ `branchId`: `ZodString`; \}, `$strip`&gt;&gt;&gt;; `version`: `ZodLiteral`&lt;`1`&gt;; \}, `$strip`&gt;&gt;; `kanban`: `ZodOptional`&lt;`ZodObject`&lt;\{ `axisBranchId`: `ZodNullable`&lt;`ZodString`&gt;; `collapsedColumnValues`: `ZodOptional`&lt;`ZodArray`&lt;`ZodString`&gt;&gt;; `hiddenColumnValues`: `ZodOptional`&lt;`ZodArray`&lt;`ZodString`&gt;&gt;; `sort`: `ZodNullable`&lt;`ZodObject`&lt;\{ `branchId`: `ZodString`; `dir`: `ZodEnum`&lt;\{ `ASC`: `"ASC"`; `DESC`: `"DESC"`; \}&gt;; \}, `$strip`&gt;&gt;; \}, `$strip`&gt;&gt;; \}, `$loose`&gt;
