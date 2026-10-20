[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / buildEffectivePermissions

# Function: buildEffectivePermissions()

> **buildEffectivePermissions**(`assignments`, `roles`): [`EffectivePermissions`](../interfaces/EffectivePermissions.md)

Folds a user's active assignments into their effective authority.

The model is strictly additive: every assignment can only widen the result, and
assignments referencing an unknown role are ignored rather than treated as an error.

## Parameters

### assignments

readonly [`PermissionAssignment`](../interfaces/PermissionAssignment.md)[]

Active assignments, already decay-filtered by the repository.

### roles

readonly [`RoleRecord`](../interfaces/RoleRecord.md)[]

The roles those assignments reference; extra roles are harmless.

## Returns

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)
