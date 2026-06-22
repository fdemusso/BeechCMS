#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso
//
// test-coverage-diff.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Run Vitest coverage ONLY for source files that changed on the current branch
// compared to a base branch, respecting each workspace's vitest.config.ts
// coverage exclusions. Files that are excluded in the vitest config are listed
// as "excluded" and skipped from the run.
//
// Usage:
//   npm run test:diff
//   npm run test:diff -- --base main
//   npm run test:diff -- --base origin/main
//   npm run test:diff -- --all            (run full suite, targeted coverage)
//   npm run test:diff -- --base HEAD~1 --all
// ─────────────────────────────────────────────────────────────────────────────

import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import picomatch from 'picomatch'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ─── ANSI colour helpers ───────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  cyan:   '\x1b[36m',
  white:  '\x1b[37m',
  gray:   '\x1b[90m',
  bgRed:       '\x1b[41m',
  bgGreen:     '\x1b[42m',
  bgYellow:    '\x1b[43m',
}
const bold   = (s) => `${c.bold}${s}${c.reset}`
const dim    = (s) => `${c.dim}${s}${c.reset}`
const red    = (s) => `${c.red}${s}${c.reset}`
const green  = (s) => `${c.green}${s}${c.reset}`
const yellow = (s) => `${c.yellow}${s}${c.reset}`
const cyan   = (s) => `${c.cyan}${s}${c.reset}`
const gray   = (s) => `${c.gray}${s}${c.reset}`

// ─── CLI Argument Parsing ──────────────────────────────────────────────────
const args = process.argv.slice(2)

function getFlag(name) {
  const idx = args.indexOf(name)
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1]
  }
  return null
}

const runAllMode   = args.includes('--all') || args.includes('--run-all')
const baseOverride = getFlag('--base')

// ─── Workspace Definitions ─────────────────────────────────────────────────
// Each workspace has a path relative to root, and the vitest config location.
const WORKSPACES = [
  { name: 'packages/core',      dir: 'packages/core',      config: 'vitest.config.ts' },
  { name: 'packages/cli',       dir: 'packages/cli',       config: 'vitest.config.ts' },
  { name: 'apps/api',           dir: 'apps/api',           config: 'vitest.config.ts' },
  { name: 'apps/dashboard',     dir: 'apps/dashboard',     config: 'vitest.config.ts' },
]

// ─── Utility: run a shell command, return stdout or null on error ───────────
function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', cwd: ROOT, ...opts }).trim()
  } catch {
    return null
  }
}

// ─── Detect Base Branch ────────────────────────────────────────────────────
function detectBase() {
  if (baseOverride) return baseOverride

  // 1. Try the upstream tracking branch of the current branch via git config
  //    Works cross-platform without PowerShell @{} syntax issues
  const currentBranch = run('git branch --show-current')
  if (currentBranch) {
    const remote = run(`git config branch.${currentBranch}.remote`)
    const merge  = run(`git config branch.${currentBranch}.merge`)
    if (remote && merge) {
      const remoteBranch = merge.replace('refs/heads/', '')
      // Only use upstream if it's a different branch (not a self-tracking publish branch)
      if (remoteBranch !== currentBranch) {
        const upstream = `${remote}/${remoteBranch}`
        const exists = run(`git rev-parse --verify ${upstream}`)
        if (exists) return upstream
      }
    }
  }

  // 2. Fallback: try common base branch names in project-specific order
  const candidates = ['devs', 'origin/devs', 'main', 'master', 'origin/main', 'origin/master']
  for (const branch of candidates) {
    const exists = run(`git rev-parse --verify ${branch}`)
    if (exists) return branch
  }

  // 3. Last resort: parent commit
  return 'HEAD~1'
}

// ─── Get Changed Files ─────────────────────────────────────────────────────
function getChangedFiles(base) {
  // Files changed between base and HEAD (committed changes on branch)
  const committed = run(`git diff --name-only ${base}...HEAD`) || ''
  // Also include staged and unstaged working-tree changes
  const staged    = run(`git diff --name-only --cached`) || ''
  const unstaged  = run(`git diff --name-only`) || ''

  const all = new Set([
    ...committed.split('\n'),
    ...staged.split('\n'),
    ...unstaged.split('\n'),
  ].filter(Boolean))

  return [...all]
}

// ─── Parse Vitest Config Exclusions (regex-based, no dynamic import) ────────
// Extracts coverage.exclude and coverage.include arrays from a vitest.config.ts
// file using regex. This avoids needing to transpile/import TypeScript with
// all its plugin dependencies (React, Tailwind, etc.).
function parseVitestConfig(configPath) {
  if (!fs.existsSync(configPath)) return { include: null, exclude: [] }

  const src = fs.readFileSync(configPath, 'utf8')

  function extractArray(text, keyword) {
    // Find "keyword: [" and extract everything until the closing "]"
    const pattern = new RegExp(`${keyword}\\s*:\\s*\\[`, 's')
    const match = pattern.exec(text)
    if (!match) return null

    let start = match.index + match[0].length
    let depth = 1
    let i = start
    while (i < text.length && depth > 0) {
      if (text[i] === '[') depth++
      else if (text[i] === ']') depth--
      i++
    }
    
    let block = text.slice(start, i - 1)

    // Strip single-line and trailing comments
    block = block.replace(/\/\/.*/g, '')

    // Extract string literals from the array block
    const strings = []
    const strPattern = /['"`]([^'"`]+)['"`]/g
    let m
    while ((m = strPattern.exec(block)) !== null) {
      strings.push(m[1])
    }
    return strings
  }

  // Find the coverage block first, then extract include/exclude within it
  const coverageMatch = /coverage\s*:\s*\{/s.exec(src)
  if (!coverageMatch) return { include: null, exclude: [] }

  // Extract the coverage block
  let start = coverageMatch.index + coverageMatch[0].length
  let depth = 1
  let i = start
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') depth--
    i++
  }
  const coverageBlock = src.slice(start, i - 1)

  const include = extractArray(coverageBlock, 'include')
  const exclude = extractArray(coverageBlock, 'exclude')

  // Extract thresholds — look for "thresholds: { statements: N, ... }"
  const thresholds = { statements: 80, branches: 80, functions: 80, lines: 80 }
  const thresholdsMatch = /thresholds\s*:\s*\{([^}]+)\}/s.exec(coverageBlock)
  if (thresholdsMatch) {
    const block = thresholdsMatch[1]
    for (const [key, alias] of [
      ['statements', 'statements'],
      ['branches',   'branches'],
      ['functions',  'functions'],
      ['lines',      'lines'],
    ]) {
      const m = new RegExp(`${key}\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`).exec(block)
      if (m) thresholds[alias] = parseFloat(m[1])
    }
  }

  return {
    include: include || null,
    exclude: exclude || [],
    thresholds,
  }
}

// ─── Check If File Is Excluded By Vitest Config ────────────────────────────
function isExcluded(relPath, { include, exclude }) {
  // relPath is relative to the workspace root (e.g. "src/validation.ts")

  // If there's an include list, the file must match at least one pattern
  if (include && include.length > 0) {
    const matchesInclude = include.some(p => picomatch(p)(relPath))
    if (!matchesInclude) return true
  }

  // If it matches any exclude pattern, it's excluded
  if (exclude && exclude.length > 0) {
    const matchesExclude = exclude.some(p => picomatch(p)(relPath))
    if (matchesExclude) return true
  }

  return false
}

// ─── Run Vitest for a workspace ────────────────────────────────────────────
function runVitestCoverage(workspace, sourceFiles, mode) {
  const workspaceDir = path.join(ROOT, workspace.dir)
  const relFiles = sourceFiles.map(f => path.relative(workspaceDir, f).replace(/\\/g, '/'))

  // Build --coverage.include flags for each source file
  const includeFlags = relFiles.flatMap(f => [`--coverage.include=${f}`])
  const thresholdFlags = [
    '--coverage.thresholds.lines=0',
    '--coverage.thresholds.functions=0',
    '--coverage.thresholds.branches=0',
    '--coverage.thresholds.statements=0',
  ]

  let vitestArgs
  if (mode === 'related') {
    vitestArgs = [
      'related',
      '--run',
      '--coverage',
      '--coverage.reporter=json-summary',
      '--coverage.reporter=text',
      ...includeFlags,
      ...thresholdFlags,
      ...relFiles,
    ]
  } else {
    // Full test run with targeted coverage
    vitestArgs = [
      'run',
      '--coverage',
      '--coverage.reporter=json-summary',
      '--coverage.reporter=text',
      ...includeFlags,
      ...thresholdFlags,
    ]
  }

  const result = spawnSync('npx', ['vitest', ...vitestArgs], {
    cwd: workspaceDir,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: true,
  })

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  }
}

// ─── Parse Coverage Summary JSON ──────────────────────────────────────────
function parseCoverageSummary(workspaceDir) {
  const summaryPath = path.join(workspaceDir, 'coverage', 'coverage-summary.json')
  if (!fs.existsSync(summaryPath)) return null

  try {
    return JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
  } catch {
    return null
  }
}

// ─── Format Percentage ──────────────────────────────────────────────────────
function formatPct(pct) {
  if (pct === undefined || pct === null) return gray('n/a')
  if (typeof pct === 'string') return gray(pct) // "Unknown"
  if (pct >= 80) return green(`${pct.toFixed(1)}%`)
  if (pct >= 50) return yellow(`${pct.toFixed(1)}%`)
  return red(`${pct.toFixed(1)}%`)
}

// ─── Render Table ──────────────────────────────────────────────────────────
function renderTable(rows) {
  const cols = ['File', 'Stmts', 'Branch', 'Funcs', 'Lines', 'Status']
  const colData = rows.map(r => [
    r.file,
    r.stmts   !== undefined ? `${Number(r.stmts).toFixed(1)}%`   : 'n/a',
    r.branch  !== undefined ? `${Number(r.branch).toFixed(1)}%`  : 'n/a',
    r.funcs   !== undefined ? `${Number(r.funcs).toFixed(1)}%`   : 'n/a',
    r.lines   !== undefined ? `${Number(r.lines).toFixed(1)}%`   : 'n/a',
    r.status,
  ])

  const widths = cols.map((col, i) =>
    Math.max(col.length, ...colData.map(r => stripAnsi(String(r[i])).length))
  )

  function pad(s, w) {
    const len = stripAnsi(String(s)).length
    return String(s) + ' '.repeat(Math.max(0, w - len))
  }

  const sep = widths.map(w => '─'.repeat(w + 2)).join('┼')
  const header = widths.map((w, i) => ` ${bold(pad(cols[i], w))} `).join('│')

  console.log(`┌${widths.map(w => '─'.repeat(w + 2)).join('┬')}┐`)
  console.log(`│${header}│`)
  console.log(`├${sep}┤`)

  for (const [ri, row] of colData.entries()) {
    const r = rows[ri]
    const stmts  = formatPct(r.stmts)
    const branch = formatPct(r.branch)
    const funcs  = formatPct(r.funcs)
    const lines  = formatPct(r.lines)
    const status = r.status === 'PASS'              ? green(r.status)
                 : r.status === '? No Tests Found'  ? yellow(r.status)
                 : r.status.startsWith('LOW:')       ? red(r.status)
                 : r.status === '!! Untested'        ? red(r.status)
                 : r.status === 'FAIL Tests Failed'  ? red(r.status)
                 : gray(r.status)

    const line = [
      ` ${pad(r.file, widths[0])} `,
      ` ${pad(stmts,  widths[1])} `,
      ` ${pad(branch, widths[2])} `,
      ` ${pad(funcs,  widths[3])} `,
      ` ${pad(lines,  widths[4])} `,
      ` ${pad(status, widths[5])} `,
    ].join('│')
    console.log(`│${line}│`)
  }

  console.log(`└${widths.map(w => '─'.repeat(w + 2)).join('┴')}┘`)
}

// Strip ANSI for length calculation
function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log()
  console.log(bold(cyan('BeechCMS — Git Diff Coverage Runner')))
  console.log(dim('  Runs Vitest coverage only for files changed on this branch'))
  console.log()

  const base = detectBase()
  console.log(`${bold('Base:')} ${cyan(base)}  ${dim(`(mode: ${runAllMode ? 'full suite' : 'related tests'})`)}`)
  console.log()

  const changedFiles = getChangedFiles(base)
  if (changedFiles.length === 0) {
    console.log(green('No changed files detected — nothing to check.'))
    return
  }

  console.log(`${bold('Changed files detected:')} ${changedFiles.length}`)
  console.log()

  // Group files by workspace
  const workspaceGroups = new Map()
  for (const ws of WORKSPACES) {
    workspaceGroups.set(ws.name, { workspace: ws, files: [] })
  }

  const unmatched = []
  for (const file of changedFiles) {
    let matched = false
    for (const ws of WORKSPACES) {
      if (file.startsWith(ws.dir + '/') || file.startsWith(ws.dir + '\\')) {
        workspaceGroups.get(ws.name).files.push(path.join(ROOT, file))
        matched = true
        break
      }
    }
    if (!matched) unmatched.push(file)
  }

  if (unmatched.length > 0) {
    console.log(dim(`   Ignoring ${unmatched.length} file(s) outside tracked workspaces:`))
    for (const f of unmatched) console.log(dim(`     - ${f}`))
    console.log()
  }

  let anyWorkspaceRan = false
  let globalUntested = 0
  let globalTotal = 0

  for (const { workspace, files } of workspaceGroups.values()) {
    if (files.length === 0) continue

    const workspaceDir = path.join(ROOT, workspace.dir)
    const configPath   = path.join(workspaceDir, workspace.config)
    const { include, exclude, thresholds } = parseVitestConfig(configPath)

    console.log(bold(`[${workspace.name}]`))
    console.log(dim('  ' + '─'.repeat(60)))

    // Classify files
    const sourceFiles  = []
    const tableRows    = []

    for (const absFile of files) {
      const relToWs = path.relative(workspaceDir, absFile).replace(/\\/g, '/')
      const relToRoot = path.relative(ROOT, absFile).replace(/\\/g, '/')
      const display   = relToRoot

      // Skip test files themselves — we care about source files
      if (/\.test\.(ts|tsx|js|jsx)$/.test(relToWs)) continue

      // Skip non-TS/JS files (markdown, sql, json, etc.)
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relToWs)) continue

      if (isExcluded(relToWs, { include, exclude })) continue

      sourceFiles.push(absFile)
    }

    if (sourceFiles.length === 0) {
      console.log(dim('   (no testable source files in this workspace — all skipped or excluded)'))
      console.log()
      continue
    }

    anyWorkspaceRan = true
    const mode = runAllMode ? 'full' : 'related'
    console.log(`   ${dim(`Running vitest (${mode} mode) for ${sourceFiles.length} source file(s)...`)}`)
    console.log()

    const { stdout, stderr, status } = runVitestCoverage(workspace, sourceFiles, mode)

    // Print vitest output (compact)
    const lines = (stdout + '\n' + stderr)
      .split('\n')
      .filter(l => l.trim())
    const relevantLines = lines.filter(l =>
      l.includes('passed') || l.includes('failed') || l.includes('skipped') ||
      l.includes('Tests') || l.includes('Test Files') || l.includes('Duration') ||
      l.includes('ERROR') || l.includes('FAIL')
    )
    for (const l of relevantLines) {
      console.log('   ' + dim(l.trim()))
    }
    console.log()

    // Parse coverage summary
    const summary = parseCoverageSummary(workspaceDir)
    const relFiles = sourceFiles.map(f => path.relative(workspaceDir, f).replace(/\\/g, '/'))

    for (const relFile of relFiles) {
      const display   = path.join(workspace.dir, relFile).replace(/\\/g, '/')
      const absForKey = path.join(workspaceDir, relFile)

      // The summary JSON keys use the absolute path with OS separators
      // Try both forward-slash and backslash variants
      const summaryKey = Object.keys(summary || {}).find(k =>
        path.resolve(k) === path.resolve(absForKey)
      )

      if (!summary || !summaryKey) {
        // No coverage data — no tests found for this file
        tableRows.push({ file: display, status: '? No Tests Found' })
        globalUntested++
        globalTotal++
        continue
      }

      const data = summary[summaryKey]
      const pct = {
        stmts:  data.statements?.pct,
        branch: data.branches?.pct,
        funcs:  data.functions?.pct,
        lines:  data.lines?.pct,
      }

      // Flag as untested if all zeros
      if (data.statements?.covered === 0 && data.functions?.covered === 0) {
        tableRows.push({ file: display, ...pct, status: '!! Untested' })
        globalUntested++
        globalTotal++
        continue
      }

      // Check each metric against workspace thresholds
      const failing = []
      if (pct.stmts  !== undefined && pct.stmts  < thresholds.statements) failing.push(`stmts ${pct.stmts.toFixed(1)}%<${thresholds.statements}%`)
      if (pct.branch !== undefined && pct.branch < thresholds.branches)   failing.push(`branch ${pct.branch.toFixed(1)}%<${thresholds.branches}%`)
      if (pct.funcs  !== undefined && pct.funcs  < thresholds.functions)  failing.push(`funcs ${pct.funcs.toFixed(1)}%<${thresholds.functions}%`)
      if (pct.lines  !== undefined && pct.lines  < thresholds.lines)      failing.push(`lines ${pct.lines.toFixed(1)}%<${thresholds.lines}%`)

      let rowStatus
      if (status !== 0) {
        rowStatus = 'FAIL Tests Failed'
        globalUntested++
      } else if (failing.length > 0) {
        rowStatus = `LOW: ${failing.join(', ')}`
        globalUntested++
      } else {
        rowStatus = 'PASS'
      }

      tableRows.push({ file: display, ...pct, status: rowStatus })
      globalTotal++
    }

    // Add excluded rows at the end
    renderTable(tableRows)
    console.log()
  }

  if (!anyWorkspaceRan) {
    console.log(yellow('No testable source files found in any workspace.'))
    console.log(dim('  All changed files may be excluded, non-source, or outside tracked workspaces.'))
    return
  }

  // ─── Summary Footer ──────────────────────────────────────────────────────
  console.log(bold('─'.repeat(70)))
  if (globalTotal === 0) {
    // nothing to report
  } else if (globalUntested === 0) {
    console.log(green(bold(`PASS  All ${globalTotal} changed file(s) meet coverage thresholds.`)))
  } else {
    const passed = globalTotal - globalUntested
    console.log(red(bold(`FAIL  ${globalUntested} / ${globalTotal} file(s) below threshold or untested.`)))
    if (passed > 0) console.log(dim(`      ${passed} file(s) passed.`))
    console.log(dim('      Review LOW: / !! Untested entries above and add tests.'))
  }
  console.log()
}

main().catch(err => {
  console.error(red('ERROR:'), err)
  process.exit(1)
})
