import { resolvePolicies } from '@beechcms/core'
import type { Seed } from '@beechcms/core'

const SYSTEM_FIELDS = ['id', 'slug', 'status', 'created_at', 'updated_at']
const IDENTITY_FIELDS = ['id', 'slug']

function applyPublicPolicies(data: Record<string, unknown>, seed: Seed): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const key of SYSTEM_FIELDS) {
    if (key in data) result[key] = data[key]
  }

  for (const branch of seed.branches) {
    const value = data[branch.alias]
    const { public: isPublic, visibility } = resolvePolicies(branch)
    if (!isPublic) continue
    if (visibility === 'hidden') continue
    result[branch.alias] = visibility === 'masked' && typeof value === 'string' && value.length > 0
      ? '••••••••'
      : value
  }
  return result
}

export function toFlatPublicEntry(data: Record<string, unknown>, seed: Seed, fieldsParam?: string): Record<string, unknown> {
  const projected = applyPublicPolicies(data, seed)
  const requestedFields = (fieldsParam ?? '').split(',').map(f => f.trim()).filter(Boolean)

  if (requestedFields.length === 0) return projected

  const filtered: Record<string, unknown> = {}
  for (const field of requestedFields) {
    if (field in projected) filtered[field] = projected[field]
  }

  for (const key of IDENTITY_FIELDS) {
    if (key in projected && !filtered[key]) filtered[key] = projected[key]
  }

  return filtered
}
