[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / OAUTH\_SCOPES

# Variable: OAUTH\_SCOPES

> `const` **OAUTH\_SCOPES**: readonly \[`"schema:read"`, `"schema:write"`, `"content:read"`, `"content:write"`, `"content:delete"`, `"media:read"`, `"media:write"`, `"automations:read"`, `"automations:write"`, `"users:read"`, `"users:write"`, `"settings:read"`, `"settings:write"`, `"analytics:read"`, `"agent:read"`, `"agent:approve"`\]

OAuth scope vocabulary (v2). Each scope gates a family of operations in
`OPERATION_CATALOG`; RBAC still decides what the token's owner may do.
`schema:read` / `schema:write` keep their 1.x meaning, so 1.x tokens stay valid.
Publish/destructive is not a scope: it is decided per request by risk.
`agent:approve` lets a client run an approved intent; it is granted only to the
`beech-mcp` client (by `allowed_scopes`), never to the script client.
