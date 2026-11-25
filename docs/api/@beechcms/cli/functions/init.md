[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / init

# Function: init()

> **init**(`args`): `Promise`&lt;`void`&gt;

Checks that the project has the files BeechCMS needs. The database is not touched here:
`npm run dev` applies the system migrations, and `beech setup:cloudflare` provisions D1/R2.

## Parameters

### args

[`InitOptions`](../interfaces/InitOptions.md)

## Returns

`Promise`&lt;`void`&gt;
