// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { findUnappliedFilters } from '@beechcms/core'
import type { Automation, ContentRepository, FilterGroup, Seed, WhenNode } from '@beechcms/core'
import { conditionToFilterGroup } from '../filters/filter-translation'
import { parseTemplateKey } from './template-grammar'
import type { AutomationContextSelector, ParsedKey } from './template-grammar'

export interface SeedLookupDeps {
  repository: ContentRepository
  getSeed: (slug: string) => Seed | null
}

export type SeedScopedKey = Extract<ParsedKey, { kind: 'scoped' }>

export type SeedRowCache = Map<string, Array<Record<string, unknown>>>

const MAX_ROWS = 1000
const TEMPLATE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

export function seedLookupCacheKey(scope: string, selector: AutomationContextSelector): string {
  switch (selector.kind) {
    case 'byid': return `${scope}:byid(${selector.id})`
    case 'where': return `${scope}:where(${selector.alias}=${selector.value})`
    default: return `${scope}:${selector.kind}`
  }
}

function isSeedScoped(key: ParsedKey | null): key is SeedScopedKey {
  return key?.kind === 'scoped' && key.scope !== 'this' && key.scope !== 'batch'
}

function collectFromWhen(node: WhenNode, out: string[]): void {
  if (node.kind === 'group') {
    for (const child of node.children) collectFromWhen(child, out)
    return
  }
  for (const operand of [node.left, node.right]) {
    if (operand?.kind === 'ref') out.push(operand.key)
  }
}

function collectFromValue(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(TEMPLATE_RE)) out.push(match[1])
  } else if (Array.isArray(value)) {
    for (const item of value) collectFromValue(item, out)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectFromValue(item, out)
  }
}

/** Every seed-scoped key the automation can read: `when` refs plus `{{...}}` tags in action configs. */
export function collectSeedScopedKeys(automation: Automation): SeedScopedKey[] {
  const rawKeys: string[] = []
  if (automation.trigger_conditions) collectFromWhen(automation.trigger_conditions, rawKeys)
  collectFromValue(automation.actions, rawKeys)

  const unique = new Map<string, SeedScopedKey>()
  for (const raw of rawKeys) {
    const parsed = parseTemplateKey(raw)
    if (isSeedScoped(parsed)) unique.set(seedLookupCacheKey(parsed.scope, parsed.selector), parsed)
  }
  return [...unique.values()]
}

async function fetchRows(
  repository: ContentRepository,
  seed: Seed,
  selector: AutomationContextSelector,
): Promise<Array<Record<string, unknown>> | null> {
  const filters: FilterGroup[] = []
  if (selector.kind === 'byid') {
    filters.push(conditionToFilterGroup({ field: 'id', op: 'eq', value: selector.id }, seed))
  } else if (selector.kind === 'where') {
    filters.push(conditionToFilterGroup({ field: selector.alias, op: 'eq', value: selector.value }, seed))
    // The query builder drops a filter it cannot bind, which would widen the read to unrelated rows.
    if (findUnappliedFilters(seed, filters).length > 0) return null
  }

  const single = selector.kind !== 'all'
  const { items } = await repository.findMany(seed, {
    filters,
    status: null,
    pagination: { limit: single ? 1 : MAX_ROWS, offset: 0 },
    orderBy: { column: 'created_at', dir: selector.kind === 'firstone' ? 'ASC' : 'DESC' },
  })
  return items
}

/**
 * Loads each distinct seed-scoped selector once, so the sync template pass can read the rows.
 * A selector that cannot be loaded (unknown seed, unbindable filter, repository error) is left out
 * of the cache and surfaces through `onMissing` at lookup time.
 */
export async function prefetchSeedRows(
  automation: Automation,
  deps: SeedLookupDeps,
): Promise<SeedRowCache> {
  const cache: SeedRowCache = new Map()

  await Promise.all(collectSeedScopedKeys(automation).map(async (key) => {
    const seed = deps.getSeed(key.scope)
    if (!seed) return
    try {
      const rows = await fetchRows(deps.repository, seed, key.selector)
      if (rows) cache.set(seedLookupCacheKey(key.scope, key.selector), rows)
    } catch (error) {
      console.error('[automations] seed lookup failed', { automationId: automation.id, scope: key.scope, error })
    }
  }))

  return cache
}
