// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Design-token lint for apps/dashboard. ESLint cannot do this: the dashboard's .ts/.tsx files go through a
// no-op parser (TypeScript 7 has no JS compiler API yet), so no ESLint rule sees a component's contents.
// This script reads the sources as text instead, the same way scripts/check-test-placement.mjs does.
//
//   node scripts/check-design-tokens.mjs                  summary + worst files (exit 1 on any error)
//   node scripts/check-design-tokens.mjs --all            every violation, grouped by file
//   node scripts/check-design-tokens.mjs --rule D1        only one rule
//   node scripts/check-design-tokens.mjs --json           machine-readable report
//   node scripts/check-design-tokens.mjs --format agent <file...>   one line per violation, with the fix
//
// Suppress a deliberate exception with a comment on the same or the previous line:
//   // design-ok: <reason>
//
// Rules
//   D1  raw Tailwind palette colour (bg-emerald-50)            -> a semantic token
//   D2  colour literal inside an arbitrary value (bg-[#fff])   -> a semantic token
//   D3  typography outside the scale (text-[10px], text-7xl)   -> a declared type token
//   D4  token that is not declared (bg-foo, var(--nope))       -> declare it in index.css or use a declared one
//   D5  radius / shadow outside the scale (rounded-[7px])      -> a declared radius / shadow
//   D6  raw white / black (bg-white, text-black)               -> a semantic token  (warning)
//   D7  colour literal in code (style={{ color: "#fff" }})     -> a CSS variable
//   D8  literal animation duration (duration-100)              -> duration-(--duration-enter / --duration-exit)

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const APP_SRC = 'apps/dashboard/src/'
const SOURCE_FILE = /\.(tsx?|jsx?)$/
const SKIP_FILE = /(\.test\.|\.stories\.|\/test\/|\/__tests__\/|\.d\.ts$)/

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const option = (name) => {
  const at = args.indexOf(name)
  return at === -1 ? null : args[at + 1]
}
const explicitFiles = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--rule' && args[i - 1] !== '--format')

// ─── rules ────────────────────────────────────────────────────────────────────────────────────────

const RULES = {
  D1: { severity: 'error', title: 'raw palette colour' },
  D2: { severity: 'error', title: 'colour literal in an arbitrary value' },
  D3: { severity: 'error', title: 'typography outside the scale' },
  D4: { severity: 'error', title: 'undeclared token' },
  D5: { severity: 'error', title: 'radius / shadow outside the scale' },
  D6: { severity: 'warning', title: 'raw white / black' },
  D7: { severity: 'error', title: 'colour literal in code' },
  D8: { severity: 'error', title: 'literal animation duration' },
}

const PALETTE = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone'
const PALETTE_VALUE = new RegExp(`^(${PALETTE})-\\d{2,3}$`)
const FAMILY = {
  live: 'green emerald lime teal',
  warning: 'amber yellow orange',
  danger: 'red rose',
  info: 'sky blue cyan indigo',
  accent: 'violet purple fuchsia pink',
  neutral: 'slate gray zinc neutral stone',
}
const familyOf = (hue) => Object.keys(FAMILY).find((f) => FAMILY[f].split(' ').includes(hue)) ?? 'other'

/** The replacement for a raw palette class, by what the colour means. Spec: _config/design_system.html#color. */
function paletteFix(family, hue) {
  if (['live', 'warning', 'danger', 'info'].includes(family)) {
    return `${hue} here means status "${family}": use <StatusBadge> or the status-${family} tokens (bg-status-${family}-soft + text-status-${family}-foreground for a badge, bg-status-${family} for a dot or icon).`
  }
  if (family === 'neutral') return `${hue} is a second grey: use bg-muted, bg-muted-strong, text-muted-foreground or border-border.`
  if (family === 'accent') return `${hue} is decorative: use the category tokens (bg-category-soft, bg-category) for organisation, or take a user-chosen colour from data, not from a class. A deliberate palette takes "// design-ok: <reason>".`
  return `${hue} has no semantic role: pick a token by meaning from _config/design_system.html#lookup.`
}

// Utilities that take a colour. Longest first so `ring-offset-` wins over `ring-`.
const COLOR_PREFIXES = [
  'inset-shadow', 'text-shadow', 'inset-ring', 'ring-offset',
  'border-t', 'border-r', 'border-b', 'border-l', 'border-x', 'border-y', 'border-s', 'border-e',
  'decoration', 'placeholder', 'outline', 'stroke', 'shadow', 'accent', 'divide', 'border',
  'caret', 'fill', 'ring', 'from', 'text', 'via', 'bg', 'to',
].sort((a, b) => b.length - a.length)

// Values after a colour prefix that are NOT colours. Anything else must be a declared colour token.
const NON_COLOR = {
  bg: /^(cover|contain|auto|center|top|bottom|left|right|none|fixed|local|scroll|repeat.*|no-repeat|clip-.*|origin-.*|blend-.*|gradient-to-.*|linear-.*|radial.*|conic.*|(left|right)-(top|bottom)|(top|bottom)-(left|right)|\d+|color|image|position|size|attachment|opacity)$/,
  text: /^(xs|sm|base|lg|\d?xl|node|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\d+|align|transform|decoration|indent|overflow|shadow|color|size)$/,
  border: /^(box|[trblxyse]|[trblxyse]-\d+|\d+|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing-.*|radius|color|width|style|spacing|opacity)$/,
  ring: /^(\d+|inset|color|width|opacity)$/,
  outline: /^(\d+|none|hidden|dashed|dotted|double|solid|offset-.*|color|width|style)$/,
  fill: /^(none|\d+|color)$/,
  stroke: /^(none|\d+|width|color)$/,
  shadow: /^(xs|sm|md|lg|xl|2xs|2xl|inner|none|color)$/,
  divide: /^(x|y|x-reverse|y-reverse|\d+|solid|dashed|dotted|double|none|color)$/,
  decoration: /^(solid|double|dotted|dashed|wavy|auto|from-font|\d+|color|thickness|style)$/,
  accent: /^(auto|color)$/,
  caret: /^(color)$/,
  placeholder: /^(color)$/,
  gradient: /^(.*)$/,
}
const nonColorFor = (prefix) => {
  if (prefix.startsWith('border')) return NON_COLOR.border
  if (prefix === 'ring-offset' || prefix === 'inset-ring') return NON_COLOR.ring
  if (prefix === 'inset-shadow' || prefix === 'text-shadow') return NON_COLOR.shadow
  if (['from', 'via', 'to'].includes(prefix)) return /^(\d+%?|none)$/
  return NON_COLOR[prefix]
}
const GLOBAL_COLOR = new Set(['transparent', 'current', 'inherit', 'initial', 'unset', 'none', 'auto'])

/** color-mix() / hsl(var(--x)) built only from tokens follows the theme, so it is not a literal. */
const derivedColor = (value) => /var\(--/.test(value) && !/#[0-9a-fA-F]{3,8}|rgba?\(\s*\d/.test(value)

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\blab\(|\blch\(|\bcolor-mix\(/

// ─── declared tokens (read from the app's CSS) ───────────────────────────────────────────────────

function listFiles() {
  if (explicitFiles.length) return explicitFiles.map((f) => f.replaceAll('\\', '/'))
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', APP_SRC], { encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
}

const allFiles = listFiles().filter((f) => existsSync(f))
const cssFiles = allFiles.length && explicitFiles.length
  ? execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', APP_SRC], { encoding: 'utf8' }).split('\n').filter((f) => f.endsWith('.css'))
  : allFiles.filter((f) => f.endsWith('.css'))
const sourceFiles = allFiles.filter((f) => SOURCE_FILE.test(f) && !SKIP_FILE.test(f))

const declared = { color: new Set(), radius: new Set(), size: new Set(), vars: new Set() }

function collectDeclarations() {
  const defined = /(--[A-Za-z0-9_-]+)['"]?\s*:/g
  const scan = (text) => { for (const m of text.matchAll(defined)) declared.vars.add(m[1]) }

  for (const file of cssFiles) {
    const css = readFileSync(file, 'utf8')
    scan(css)
    for (const m of css.matchAll(/--color-([A-Za-z0-9-]+)\s*:/g)) declared.color.add(m[1])
    for (const m of css.matchAll(/--radius-([A-Za-z0-9-]+)\s*:/g)) declared.radius.add(m[1])
    for (const m of css.matchAll(/--(?:text|font-size)-([A-Za-z0-9-]+)\s*:/g)) declared.size.add(m[1])
  }
  // Variables a component defines for its own subtree (style={{ "--x": ... }}, [--x:...], setProperty).
  const tsFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', APP_SRC], { encoding: 'utf8' })
    .split('\n').filter((f) => /\.(tsx?|jsx?)$/.test(f) && existsSync(f))
  for (const file of tsFiles) scan(readFileSync(file, 'utf8'))
}
collectDeclarations()

// Variables a library or Tailwind itself provides; nothing in the app defines them.
const VAR_FROM_LIBRARY = /^--(radix|cmdk|tw|rdp|sonner|toast|vaul|recharts|spacing|breakpoint|container|animate|ease|default)(-|$)/

// ─── source scanning ─────────────────────────────────────────────────────────────────────────────

/** Blank out comments (keeping newlines) so a commented-out class is not reported. */
function stripComments(src) {
  const out = src.split('')
  const n = src.length
  const blank = (from, to) => { for (let k = from; k < to; k++) if (src[k] !== '\n') out[k] = ' ' }

  function scan(start, inExpr) {
    let i = start
    let depth = 0
    while (i < n) {
      const c = src[i]
      const d = src[i + 1]
      if (c === '/' && d === '/') { const s = i; while (i < n && src[i] !== '\n') i++; blank(s, i); continue }
      if (c === '/' && d === '*') {
        const s = i
        i += 2
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
        i += 2
        blank(s, i)
        continue
      }
      if (c === '"' || c === "'") {
        i++
        while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++ }
        i++
        continue
      }
      if (c === '`') { i = template(i + 1); continue }
      if (c === '{') depth++
      if (c === '}') { if (inExpr && depth === 0) return i; depth-- }
      i++
    }
    return i
  }
  function template(start) {
    let i = start
    while (i < n) {
      if (src[i] === '\\') { i += 2; continue }
      if (src[i] === '`') return i + 1
      if (src[i] === '$' && src[i + 1] === '{') { i = scan(i + 2, true) + 1; continue }
      i++
    }
    return i
  }
  scan(0, false)
  return out.join('')
}

/** Splits a class token into its utility, ignoring variants (`dark:`) and the opacity suffix (`/50`). */
function utilityOf(token) {
  let depth = 0
  let lastColon = -1
  let lastSlash = -1
  for (let i = 0; i < token.length; i++) {
    const c = token[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth--
    else if (depth === 0 && c === ':') lastColon = i
    else if (depth === 0 && c === '/') lastSlash = i
  }
  let utility = token.slice(lastColon + 1)
  if (lastSlash > lastColon) utility = token.slice(lastColon + 1, lastSlash)
  return utility.replace(/^!/, '').replace(/!$/, '').replace(/^-/, '')
}

function splitPrefix(utility) {
  for (const prefix of COLOR_PREFIXES) {
    if (utility.startsWith(`${prefix}-`)) return [prefix, utility.slice(prefix.length + 1)]
  }
  return null
}

const lineOf = (text, index) => {
  let line = 1
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++
  return line
}

function lint(file) {
  const original = readFileSync(file, 'utf8')
  const originalLines = original.split('\n')
  const code = stripComments(original)
  const found = []
  const covered = []

  const suppressed = (line) => /design-ok/.test(originalLines[line - 1] ?? '') || /design-ok/.test(originalLines[line - 2] ?? '')
  const report = (rule, index, token, detail) => {
    const line = lineOf(code, index)
    if (suppressed(line)) return
    found.push({ file, line, rule, token, ...detail })
  }

  for (const match of code.matchAll(/[^\s"'`]+/g)) {
    const token = match[0].replace(/[,;]+$/, '')
    const at = match.index
    const utility = utilityOf(token)
    if (!utility || utility.length > 160) continue

    // typography
    const sizeBracket = utility.match(/^text-\[(?:length:)?([\d.]+(?:px|rem|em))\]$/)
    if (sizeBracket) {
      report('D3', at, token, { fix: `Use a type token (text-xs/text-sm or a declared caption/label token). ${sizeBracket[1]} is not on the scale.`, bucket: sizeBracket[1] })
      covered.push([at, at + token.length])
      continue
    }
    if (/^(leading|tracking)-\[/.test(utility)) {
      report('D3', at, token, { fix: 'Use a declared leading/tracking utility from the type scale.', bucket: utility.split('-[')[0] })
      covered.push([at, at + token.length])
      continue
    }
    // A Tailwind size name the theme does not declare (text-lg, text-3xl, text-6xl…): it resolves to nothing or to a stock size
    const sizeClass = utility.match(/^text-(xs|sm|base|lg|[2-9]xl)$/)
    if (sizeClass && declared.size.size && !declared.size.has(sizeClass[1])) {
      const declaredSizes = [...declared.size]
      report('D3', at, token, { fix: `text-${sizeClass[1]} is not in the declared scale (${declaredSizes.join(', ')}). Pick the size by role from _config/design_system.html#typography.`, bucket: sizeClass[1] })
      continue
    }

    // motion: only the declared duration tokens
    const duration = utility.match(/^duration-(\d+|\[.+\])$/)
    if (duration) {
      report('D8', at, token, { fix: 'Use duration-(--duration-enter) on data-open and duration-(--duration-exit) on data-closed for layers; for hover/focus colour changes drop the class. See _config/design_system.html#motion.', bucket: `duration-${duration[1]}` })
      continue
    }

    // radius / shadow scale
    const radius =utility.match(/^rounded(?:-[tblrsexy]{1,2})?-(.+)$/)
    if (radius) {
      const value = radius[1]
      const okValue = /^(full|none|inherit)$/.test(value) || declared.radius.has(value)
      const derived = value.startsWith('[') && (/var\(--/.test(value) || value === '[inherit]')
      if (!derived && (value.startsWith('[') || (!okValue && !value.startsWith('(')))) {
        report('D5', at, token, { fix: `Use a declared radius (${[...declared.radius].join(', ')}, full, none).`, bucket: value })
        continue
      }
    }

    const parts = splitPrefix(utility)
    if (!parts) {
      // var() outside a class prefix is handled below
      continue
    }
    const [prefix, value] = parts

    // arbitrary values
    if (value.startsWith('[')) {
      if (COLOR_LITERAL.test(value) && !derivedColor(value)) {
        report('D2', at, token, { fix: 'Replace the literal with a semantic token (see _config/design_system.html).', bucket: prefix })
        covered.push([at, at + token.length])
      } else if (prefix === 'shadow' || prefix === 'inset-shadow') {
        report('D5', at, token, { fix: 'Use a declared shadow (shadow-xs/sm/md/lg) or add one to index.css.', bucket: 'shadow-[…]' })
      }
      continue
    }
    if (value.startsWith('(')) continue // bg-(--token) syntax is checked through var() below

    // colour utilities
    if (PALETTE_VALUE.test(value)) {
      const hue = value.split('-')[0]
      const family = familyOf(hue)
      report('D1', at, token, { fix: paletteFix(family, hue), bucket: family, value: `${prefix}-${value}`, hue })
      continue
    }
    if (value === 'white' || value === 'black') {
      report('D6', at, token, { fix: `Use bg-background / text-foreground (or a scrim token) instead of raw ${value}.`, bucket: value })
      continue
    }
    if (GLOBAL_COLOR.has(value)) continue
    if (declared.color.has(value)) continue
    const nonColor = nonColorFor(prefix)
    if (nonColor?.test(value)) continue
    if (/^\d+(\.\d+)?$/.test(value) || /^[a-z]*\d/.test(value)) continue // widths, sizes, offsets
    if (/^(x|y|t|r|b|l|s|e)(-|$)/.test(value) || /^(inherit|initial|unset)$/.test(value)) continue

    // Looks like a colour word that is not declared anywhere.
    if (/^[a-z]+(-[a-z]+)*$/.test(value)) {
      report('D4', at, token, { fix: `'${prefix}-${value}' is not a declared token. Declare --color-${value} in index.css or use an existing one.`, bucket: `${prefix}-${value}` })
    }
  }

  // var(--x) that nothing defines
  for (const m of code.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
    const name = m[1]
    if (declared.vars.has(name) || VAR_FROM_LIBRARY.test(name)) continue
    report('D4', m.index, `var(${name})`, { fix: `${name} is used but defined nowhere in apps/dashboard/src.`, bucket: name })
  }

  // colour literals in code (style props, constants, SVG props) not already counted as arbitrary values
  const literal = /(['"`])(#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab)\([^'"`)]*\)[^'"`]*)\1/g
  for (const m of code.matchAll(literal)) {
    if (covered.some(([from, to]) => m.index >= from && m.index < to)) continue
    if (/\[[\w-]+=$/.test(code.slice(Math.max(0, m.index - 24), m.index)) || derivedColor(m[2])) continue
    const line = lineOf(code, m.index)
    if (/className|cn\(|cva\(/.test(originalLines[line - 1] ?? '') && /\[/.test(m[0])) continue
    report('D7', m.index, m[2].slice(0, 40), { fix: 'Use a CSS variable (var(--…)) so the colour follows the theme.', bucket: m[2].startsWith('#') ? 'hex' : 'fn' })
  }

  return found
}

// ─── run + report ────────────────────────────────────────────────────────────────────────────────

const only = option('--rule')
let violations = sourceFiles.flatMap(lint)
if (only) violations = violations.filter((v) => v.rule === only)

const errors = violations.filter((v) => RULES[v.rule].severity === 'error')
const count = (items, key) => {
  const map = new Map()
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + 1)
  return [...map.entries()].sort((a, b) => b[1] - a[1])
}
const pad = (value, width) => String(value).padEnd(width)
const sliceOf = (file) => {
  const p = file.slice(APP_SRC.length)
  if (p.startsWith('features/')) return `features/${p.split('/')[1]}`
  return p.split('/').slice(0, 2).join('/')
}

if (flag('--json')) {
  console.log(JSON.stringify({
    scanned: sourceFiles.length,
    total: violations.length,
    byRule: Object.fromEntries(count(violations, (v) => v.rule)),
    violations,
  }, null, 2))
  process.exit(errors.length ? 1 : 0)
}

if (option('--format') === 'agent') {
  for (const v of violations) console.log(`${v.file}:${v.line}  ${v.rule}  ${v.token}  →  ${v.fix}`)
  if (violations.length) console.log(`\nSee _config/design_system.html. A deliberate exception takes a "// design-ok: <reason>" comment.`)
  process.exit(errors.length ? 1 : 0)
}

console.log(`\nDesign tokens: ${violations.length} violations in ${new Set(violations.map((v) => v.file)).size} of ${sourceFiles.length} files\n`)

console.log('By rule')
for (const [rule, n] of count(violations, (v) => v.rule)) {
  console.log(`  ${rule}  ${pad(n, 5)} ${pad(RULES[rule].title, 40)} ${RULES[rule].severity}`)
}

const d1 = violations.filter((v) => v.rule === 'D1')
if (d1.length) {
  console.log(`\nD1 by meaning (${new Set(d1.map((v) => v.value)).size} distinct classes behind ${d1.length} uses)`)
  for (const [family, n] of count(d1, (v) => v.bucket)) {
    const distinct = new Set(d1.filter((v) => v.bucket === family).map((v) => v.value)).size
    console.log(`  ${pad(family, 9)} ${pad(n, 4)} uses, ${distinct} distinct classes`)
  }
}

const d3 = violations.filter((v) => v.rule === 'D3')
if (d3.length) {
  console.log('\nD3 sizes')
  for (const [size, n] of count(d3, (v) => v.bucket)) console.log(`  ${pad(size, 10)} ${n}`)
}

const d4 = violations.filter((v) => v.rule === 'D4')
if (d4.length) {
  console.log('\nD4 undeclared (top 15)')
  for (const [name, n] of count(d4, (v) => v.bucket).slice(0, 15)) console.log(`  ${pad(name, 38)} ${n}`)
}

console.log('\nBy area')
for (const [area, n] of count(violations, (v) => sliceOf(v.file)).slice(0, 15)) console.log(`  ${pad(area, 36)} ${n}`)

console.log('\nWorst files')
for (const [file, n] of count(violations, (v) => v.file).slice(0, 15)) console.log(`  ${pad(n, 4)} ${file.slice(APP_SRC.length)}`)

if (flag('--all')) {
  console.log('\nAll violations')
  let current = ''
  for (const v of violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    if (v.file !== current) { current = v.file; console.log(`\n${v.file}`) }
    console.log(`  ${pad(v.line, 5)} ${v.rule}  ${v.token}`)
  }
} else {
  console.log('\nRun with --all for every violation, --rule D1 to narrow, --format agent <file> for fix hints.')
}

process.exit(errors.length ? 1 : 0)
