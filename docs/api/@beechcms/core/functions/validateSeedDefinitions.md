[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / validateSeedDefinitions

# Function: validateSeedDefinitions()

> **validateSeedDefinitions**(`seeds`): [`SeedValidationIssue`](../interfaces/SeedValidationIssue.md)[]

Pure, console-free, throw-free validation of a seed set.
The single seed being created/edited should be validated in the context of
the full active set: call validateSeedDefinitions([...otherActiveSeeds, edited]).

## Parameters

### seeds

[`Seed`](../interfaces/Seed.md)[]

## Returns

[`SeedValidationIssue`](../interfaces/SeedValidationIssue.md)[]
