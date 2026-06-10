// Pure classification rules for piped dev-server output.
// Each line is classified as 'drop' (noise, discarded), 'error' (aggregated into
// the error bar) or 'pass' (kept in the per-source log buffer).

export type FilterResult = 'drop' | 'error' | 'pass'
export type LogLevel = 'info' | 'warn' | 'error'

interface FilterRule {
  name: string
  test: (line: string) => boolean
}

// Rules that silence noise. Order matters: first match wins.
const DROP_RULES: FilterRule[] = [
  {
    name: 'wrangler-update-available',
    test: (line) => /wrangler \d+\.\d+\.\d+ is now available/.test(line),
  },
  {
    name: 'wrangler-update-instructions',
    test: (line) => /Run `?npm install.*wrangler/i.test(line),
  },
  {
    name: 'wrangler-warning-banner',
    test: (line) => /▲\s*\[WARNING\]/.test(line) && /update/i.test(line),
  },
  {
    name: 'turbo-banner',
    test: (line) => /^[•>]*\s*turbo \d+\.\d+\.\d+/i.test(line) || /^\s*[•>]*\s*Update available \d+\.\d+\.\d+/i.test(line),
  },
  {
    name: 'access-log-2xx',
    test: (line) => /^\[wrangler:info\]\s+(GET|POST|PUT|PATCH|DELETE)\s+.*\s2\d\d\b/.test(line),
  },
  {
    name: 'empty-line',
    test: (line) => line.trim().length === 0,
  },
]

// Rules that mark a line (and any contiguous stack-trace lines that follow it)
// as an error to be aggregated into the ErrorBar.
const ERROR_RULES: FilterRule[] = [
  { name: 'esbuild-error', test: (line) => /✘\s*\[ERROR\]/.test(line) },
  { name: 'error-prefix', test: (line) => /\bError:/.test(line) },
  { name: 'd1-error', test: (line) => /D1_ERROR/.test(line) },
  { name: 'typescript-error', test: (line) => /\b(?:error\s+TS\d+|ERROR\s+TS\d+):/i.test(line) },
]

// Rules that downgrade an otherwise-passing line to 'warn'.
const WARN_RULES: FilterRule[] = [
  {
    name: 'access-log-4xx-5xx',
    test: (line) => /^\[wrangler:info\]\s+(GET|POST|PUT|PATCH|DELETE)\s+.*\s[45]\d\d\b/.test(line),
  },
  { name: 'warning-banner', test: (line) => /▲\s*\[WARNING\]/.test(line) },
]

// A stack trace continuation line, e.g. "    at Object.<anonymous> (file.ts:1:1)".
const STACK_TRACE_LINE = /^\s*at\s+\S/

export function isStackTraceLine(line: string): boolean {
  return STACK_TRACE_LINE.test(line)
}

// Lines that report tool update availability. These are dropped from the normal
// log view but archived for the Versions tab instead of being discarded entirely.
export function isVersionNotice(line: string): boolean {
  return (
    /wrangler \d+\.\d+\.\d+ is now available/.test(line) ||
    /Run `?npm install.*wrangler/i.test(line) ||
    /^\s*[•>]*\s*Update available \d+\.\d+\.\d+/i.test(line)
  )
}

export function classifyLine(line: string): FilterResult {
  if (ERROR_RULES.some((rule) => rule.test(line))) {
    return 'error'
  }
  if (isStackTraceLine(line)) {
    return 'error'
  }
  if (DROP_RULES.some((rule) => rule.test(line))) {
    return 'drop'
  }
  return 'pass'
}

export function levelForLine(line: string, classification: FilterResult): LogLevel {
  if (classification === 'error') return 'error'
  if (WARN_RULES.some((rule) => rule.test(line))) return 'warn'
  return 'info'
}
