/**
 * Pure template-key parser for the automation template engine.
 *
 * Grammar (Sprint 6):
 *   simple:  {{title}}, {{author.name}}
 *   scoped:  {{<scope>:<selector>:<field>}}
 *
 * Grammar (Sprint 7):
 *   var_access: {{varname.firstone.campo}}, {{varname.count.(status=paid)}}
 *               {{varname.array[id1,id2].count}}
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

export { AUTOMATION_RESERVED_WORDS } from '@beechcms/core'

// ---------------------------------------------------------------------------
// Sprint 7 types: var_access parsed key
// ---------------------------------------------------------------------------

export type VarStep =
  | { type: 'field'; name: string }
  | { type: 'nav'; nav: 'firstone' | 'lastone' }
  | { type: 'agg'; op: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'pluck'; field?: string }
  | { type: 'array'; ids: string[] }

export interface InlineCondition {
  column: string
  op: '=' | '!=' | '<' | '>' | '<=' | '>='
  value: string
}

// ---------------------------------------------------------------------------

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
  | {
      kind: 'var_access'
      name: string
      steps: VarStep[]
      conditions: InlineCondition[]
    }

const SLUG_RE = /^[a-zA-Z0-9_-]+$/
const AGGREGATE_OPS = new Set<string>(['count', 'sum', 'avg', 'min', 'max', 'pluck'])
const NAV_OPS = new Set<string>(['firstone', 'lastone'])
const INLINE_COND_RE = /^\(([\w]+)\s*(=|!=|<=|>=|<|>)\s*([^)]+)\)$/

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

/**
 * Split `raw` on `.` treating `[...]` and `(...)` as atomic blocks.
 */
function splitDot(raw: string): string[] {
  const tokens: string[] = []
  let depth = 0
  let current = ''

  for (const ch of raw) {
    if (ch === '[' || ch === '(') {
      depth++
      current += ch
    } else if (ch === ']' || ch === ')') {
      depth--
      current += ch
    } else if (ch === '.' && depth === 0) {
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

  const trimmed = raw.trim()

  // Step 1: if contains `:` at depth 0 → existing scoped / sugar logic
  const colonTokens = splitKey(trimmed)
  if (colonTokens.length > 1) {
    const [scopeToken, ...rest] = colonTokens
    if (!isKnownScope(scopeToken)) return null

    if (rest.length === 1) {
      const fieldOrAggregate = rest[0]
      if (AGGREGATE_OPS.has(fieldOrAggregate)) {
        return { kind: 'scoped', scope: scopeToken, selector: { kind: 'all' }, op: fieldOrAggregate as AggregateOp, field: null }
      }
      return { kind: 'scoped', scope: scopeToken, selector: { kind: 'lastone' }, op: 'field', field: fieldOrAggregate }
    }

    const selectorToken = rest[0]
    const selector = parseSelector(selectorToken)
    if (!selector) return null

    const fieldTokens = rest.slice(1)
    if (fieldTokens.length === 0) return null

    const opToken = fieldTokens[0]
    if (AGGREGATE_OPS.has(opToken)) {
      if (selector.kind !== 'all') return null
      const subField = fieldTokens[1] ?? null
      return { kind: 'scoped', scope: scopeToken, selector, op: opToken as AggregateOp, field: subField }
    }

    return { kind: 'scoped', scope: scopeToken, selector, op: 'field', field: opToken }
  }

  // Step 2: tokenise on `.` at depth 0
  const dotTokens = splitDot(trimmed)

  // Step 3: if no token contains `[` or `(`, return simple (fast path)
  if (!dotTokens.some((t) => t.includes('[') || t.includes('('))) {
    return { kind: 'simple', path: trimmed }
  }

  // Step 4: build var_access
  const [nameToken, ...stepTokens] = dotTokens
  const steps: VarStep[] = []
  const conditions: InlineCondition[] = []

  let i = 0
  while (i < stepTokens.length) {
    const token = stepTokens[i]

    // Inline condition: (col op val)
    const condMatch = token.match(INLINE_COND_RE)
    if (condMatch) {
      conditions.push({ column: condMatch[1], op: condMatch[2] as InlineCondition['op'], value: condMatch[3].trim() })
      i++
      continue
    }

    // Array selector: array[id1,id2,...]
    const arrayMatch = token.match(/^array\[([^\]]*)\]$/)
    if (arrayMatch) {
      const ids = arrayMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
      steps.push({ type: 'array', ids })
      i++
      continue
    }

    // Nav: firstone / lastone
    if (NAV_OPS.has(token)) {
      steps.push({ type: 'nav', nav: token as 'firstone' | 'lastone' })
      i++
      continue
    }

    // Aggregate: count | sum | avg | min | max | pluck
    if (AGGREGATE_OPS.has(token)) {
      const nextToken = stepTokens[i + 1]
      // Consume the next token as field if it's a plain identifier (no special chars)
      if (nextToken && !nextToken.includes('[') && !nextToken.includes('(') && !AGGREGATE_OPS.has(nextToken) && !NAV_OPS.has(nextToken)) {
        steps.push({ type: 'agg', op: token as VarStep & { type: 'agg' } extends { op: infer O } ? O : never, field: nextToken })
        i += 2
      } else {
        steps.push({ type: 'agg', op: token as any })
        i++
      }
      continue
    }

    // Plain field
    steps.push({ type: 'field', name: token })
    i++
  }

  return { kind: 'var_access', name: nameToken, steps, conditions }
}
