[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / OAUTH\_SCOPES

# Variable: OAUTH\_SCOPES

> `const` **OAUTH\_SCOPES**: readonly \[`"schema:read"`, `"schema:write"`\]

OAuth scope vocabulary. Scopes map 1:1 onto the MCP tools exposed today; no
speculative scopes are defined.

- `schema:read`  -\> beech_list_seeds, beech_get_seed, beech_schema_export,
                    beech_schema_validate, beech_schema_plan
- `schema:write` -\> beech_schema_apply

`beech_schema_plan` is deliberately classified as READ: despite the imperative
name it is a dry-run that computes a migration plan and mutates nothing.
