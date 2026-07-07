[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SystemIdGenerator

# Variable: SystemIdGenerator

> `const` **SystemIdGenerator**: [`IIdGenerator`](../interfaces/IIdGenerator.md)

Production singleton. Delegates to the host runtime CSPRNG-backed UUID
generator. Stateless and therefore safe to share across requests.
