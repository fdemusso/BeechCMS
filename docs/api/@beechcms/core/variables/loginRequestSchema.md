[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / loginRequestSchema

# Variable: loginRequestSchema

> `const` **loginRequestSchema**: `ZodObject`&lt;\{ `email`: `ZodString`; `password`: `ZodString`; \}, `$strip`&gt;

Body of `POST /auth/login`. The single source of both the runtime check and the type the typed
client sends: the output email is already trimmed and lowercased, the form it is stored in.
