/**
 * Pure template-key parser for the automation template engine.
 *
 * Grammar (Sprint 6):
 *   simple:  {{title}}, {{author.name}}
 *   scoped:  {{<scope>:<selector>:<field>}}
 *
 * Scopes: this | batch | <seedSlug> | <contextKey>
 * Selectors: lastone | firstone | all | byid(<id>) | where(<alias>=<value>)
 * Fields: branch alias, system column, or aggregate (count/sum/avg/min/max/pluck)
 *
 * Sugar:
 *   {{batch:count}}        → batch:all:count
 *   {{<scope>:<field>}}    → <scope>:lastone:<field>  (default selector)
 *
 * TODO Sprint 8: extend ParsedKey to support WhenOperand refs once the
 * recursive when-group evaluator (Tasks 10-16) is implemented.
 */

export type AutomationContextSelector =
  | { kind: 'lastone' }
  | { kind: 'firstone' }
  | { kind: 'all' }
  | { kind: 'byid'; id: string }
  | { kind: 'where'; alias: string; value: string }

export type AggregateOp = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'pluck'

export type ParsedKey =
  | { kind: 'simple'; path: string }
  | {
      kind: 'scoped'
      scope: string
      selector: AutomationContextSelector
      op: 'field' | AggregateOp
      field: string | null
    }

const SLUG_RE = /^[a-zA-Z0-9_-]+$/
const AGGREGATE_OPS = new Set<string>(['count', 'sum', 'avg', 'min', 'max', 'pluck'])

/**
 * Split `raw` on `:` but treat content inside `(...)` as atomic.
 */
function splitKey(raw: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let current = ''

  for (const ch of raw) {
    if (ch === '(') {
      depth++
      current += ch
    } else if (ch === ')') {
      depth--
      current += ch
    } else if (ch === ':' && depth === 0) {
      tokens.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

function parseSelector(token: string): AutomationContextSelector | null {
  if (token === 'lastone') return { kind: 'lastone' }
  if (token === 'firstone') return { kind: 'firstone' }
  if (token === 'all') return { kind: 'all' }

  const byidMatch = token.match(/^byid\((.+)\)$/)
  if (byidMatch) return { kind: 'byid', id: byidMatch[1] }

  const whereMatch = token.match(/^where\(([^=]+)=(.+)\)$/)
  if (whereMatch) return { kind: 'where', alias: whereMatch[1], value: whereMatch[2] }

  return null
}

function isKnownScope(token: string): boolean {
  return token === 'this' || token === 'batch' || SLUG_RE.test(token)
}

export function parseTemplateKey(raw: string): ParsedKey | null {
  if (!raw) return null

  const tokens = splitKey(raw.trim())

  // 1 token → simple
  if (tokens.length === 1) {
    return { kind: 'simple', path: tokens[0] }
  }

  const [scopeToken, ...rest] = tokens

  if (!isKnownScope(scopeToken)) return null

  // 2 tokens → <scope>:<field> with default selector (lastone)
  // Sugar: batch:count → batch:all:count
  if (rest.length === 1) {
    const fieldOrAggregate = rest[0]

    if (AGGREGATE_OPS.has(fieldOrAggregate)) {
      // e.g. batch:count — sugar for batch:all:count
      return {
        kind: 'scoped',
        scope: scopeToken,
        selector: { kind: 'all' },
        op: fieldOrAggregate as AggregateOp,
        field: null,
      }
    }

    return {
      kind: 'scoped',
      scope: scopeToken,
      selector: { kind: 'lastone' },
      op: 'field',
      field: fieldOrAggregate,
    }
  }

  // 3+ tokens → <scope>:<selector>:<field_or_aggregate>[:<subfield>]
  const selectorToken = rest[0]
  const selector = parseSelector(selectorToken)

  if (!selector) {
    // Could be <scope>:<aggregate>:<subfield> if first token after scope is an aggregate
    // e.g. orders:sum:total — this form is not in grammar; require explicit all selector
    return null
  }

  const fieldTokens = rest.slice(1)

  if (fieldTokens.length === 0) return null

  const opToken = fieldTokens[0]

  if (AGGREGATE_OPS.has(opToken)) {
    if (selector.kind !== 'all') {
      // Aggregates require :all: selector
      return null
    }
    // Aggregates like sum/avg/min/max/pluck have an optional sub-field token
    const subField = fieldTokens[1] ?? null
    return {
      kind: 'scoped',
      scope: scopeToken,
      selector,
      op: opToken as AggregateOp,
      field: subField,
    }
  }

  // Plain field reference — selector must not be 'all' (would be meaningless without aggregate)
  return {
    kind: 'scoped',
    scope: scopeToken,
    selector,
    op: 'field',
    field: opToken,
  }
}
