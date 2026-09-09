[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SUPER\_ADMIN\_ROLE\_NAME

# Variable: SUPER\_ADMIN\_ROLE\_NAME

> `const` **SUPER\_ADMIN\_ROLE\_NAME**: `"SuperAdmin"` = `'SuperAdmin'`

Name of the system role seeded by `0000_v040_base.sql` with the full permission set.

`roles.name` is UNIQUE, so the name is a stable handle; the id is minted by the
migration and differs per database, which is why nothing may hardcode it.
