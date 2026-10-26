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
// Coverage is judged on the CHANGED LINES only (from `git diff -U0`), combined across the V8
// tiers that ran, against the workspace `lines` threshold. Whole-file figures stay in the
// per-tier tables as context. The tier that cannot report V8 coverage (workerd integration)
// still decides pass/fail of its tests; a file only it can exercise is listed as NOT MEASURED.
//
// Exit codes:  0 = tests passed and changed-line coverage met the threshold
//              1 = a selected test run failed
//              2 = tests passed, changed-line coverage below threshold (the report says FAIL)
//             75 = no CPU slot, nothing ran
//
// Usage:
//   npm run test:diff
//   npm run test:diff -- --base main
//   npm run test:diff -- --base origin/main
//   npm run test:diff -- --all            (run full suite, targeted coverage)
//   npm run test:diff -- --base HEAD~1 --all
//   npm run test:diff -- --tier unit,integration
//   npm run test:diff -- --tier flow
// ─────────────────────────────────────────────────────────────────────────────

import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { WORKSPACES, parseTiers, isNeverSelected, NEVER_SELECTED_PREFIXES } from './lib/test-tiers.mjs'
import { resolveTestResources, lowerProcessPriority, describeTestResources } from './lib/test-resources.mjs'
import { acquireCpuSlot, releaseOnExit, HELD_ENV, EXIT_SLOT_TIMEOUT } from './lib/cpu-slot.mjs'
import {
  changedLineCoverage,
  exitCodeFor,
  formatLineRanges,
  lineHitsFromIstanbul,
  mergeChangedLines,
  parseChangedLines,
  unionLineHits,
} from './lib/changed-line-coverage.mjs'

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

// --tier unit,integration  |  --tier flow
const tierArg = getFlag('--tier')
const { tiers: selectedTiers, error: tierError } = parseTiers(tierArg)
if (tierError) {
  console.error(red(`ERROR: ${tierError}`))
  process.exit(1)
}

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

// ─── Get Changed Lines ─────────────────────────────────────────────────────
// Repo-relative path → set of new-side line numbers changed on this branch.
function getChangedLines(base) {
  const diff = (extra) => parseChangedLines(run(`git diff -U0 --no-color ${extra}`, { maxBuffer: 256 * 1024 * 1024 }) || '')
  return mergeChangedLines(diff(`${base}...HEAD`), diff('--cached'), diff(''))
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
    const matchesInclude = include.some(p => path.posix.matchesGlob(relPath, p))
    if (!matchesInclude) return true
  }

  // If it matches any exclude pattern, it's excluded
  if (exclude && exclude.length > 0) {
    const matchesExclude = exclude.some(p => path.posix.matchesGlob(relPath, p))
    if (matchesExclude) return true
  }

  return false
}

// ─── Run Vitest for a workspace tier ────────────────────────────────────────
function runVitestTier(workspace, runner, sourceFiles) {
  const workspaceDir = path.join(ROOT, workspace.dir)
  const relFiles = sourceFiles.map(f => path.relative(workspaceDir, f).replace(/\\/g, '/'))

  const configFlags  = runner.config  ? ['--config', runner.config]  : []
  const projectFlags = runner.project ? [`--project=${runner.project}`] : []

  const coverageFlags = runner.coverage
    ? [
        '--coverage',
        '--coverage.reporter=json-summary',
        '--coverage.reporter=json',
        '--coverage.reporter=text',
        ...relFiles.map(f => `--coverage.include=${f}`),
        '--coverage.thresholds.lines=0',
        '--coverage.thresholds.functions=0',
        '--coverage.thresholds.branches=0',
        '--coverage.thresholds.statements=0',
      ]
    : []

  // 'related' narrows to the changed files; 'all' runs the whole tier (workerd integration:
  // one suite, no v8 coverage, and `related` cannot see through the harness import chain).
  const selection = runner.mode === 'related' && !runAllMode
    ? ['related', '--run', ...coverageFlags, ...relFiles]
    : ['run', ...coverageFlags]

  const result = spawnSync('npx', ['vitest', ...selection, ...configFlags, ...projectFlags], {
    cwd: workspaceDir, encoding: 'utf8', stdio: 'pipe', shell: true,
  })

  return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status }
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

// Absolute source path → executable line → hits, from the istanbul-shaped coverage-final.json.
function parseLineHits(workspaceDir) {
  const finalPath = path.join(workspaceDir, 'coverage', 'coverage-final.json')
  if (!fs.existsSync(finalPath)) return new Map()

  try {
    const raw = JSON.parse(fs.readFileSync(finalPath, 'utf8'))
    return new Map(Object.entries(raw).map(([file, data]) => [path.resolve(file), lineHitsFromIstanbul(data)]))
  } catch {
    return new Map()
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
// `cells` are already-formatted strings (ANSI allowed); widths ignore escape codes.
function renderGrid(cols, cells) {
  const widths = cols.map((col, i) =>
    Math.max(col.length, ...cells.map(r => stripAnsi(String(r[i])).length))
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
  for (const r of cells) {
    console.log(`│${r.map((cell, i) => ` ${pad(cell, widths[i])} `).join('│')}│`)
  }
  console.log(`└${widths.map(w => '─'.repeat(w + 2)).join('┴')}┘`)
}

function colourStatus(status) {
  if (status === 'PASS') return green(status)
  if (status.startsWith('LOW:') || status === '!! Untested' || status === 'FAIL Tests Failed') return red(status)
  if (status === '? No Tests Found' || status.startsWith('NOT MEASURED')) return yellow(status)
  return gray(status)
}

// Whole-file figures of one tier: context only, the verdict lives in the changed-line table.
function renderTierTable(rows) {
  renderGrid(
    ['File', 'Stmts', 'Branch', 'Funcs', 'Lines', 'Status'],
    rows.map(r => [r.file, formatPct(r.stmts), formatPct(r.branch), formatPct(r.funcs), formatPct(r.lines), colourStatus(r.status)]),
  )
}

function renderChangedLineTable(rows) {
  renderGrid(
    ['File', 'Changed', 'Covered', 'Changed-line cov', 'Status'],
    rows.map(r => [
      r.file,
      r.total === undefined ? 'n/a' : String(r.total),
      r.total === undefined ? 'n/a' : String(r.covered),
      r.pct === undefined || r.pct === null ? gray('n/a') : formatPct(r.pct),
      colourStatus(r.status),
    ]),
  )
}

// Strip ANSI for length calculation
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log()
  console.log(bold(cyan('BeechCMS — Git Diff Coverage Runner')))
  console.log(dim('  Runs Vitest coverage only for files changed on this branch'))

  // Workspaces run one at a time, so a single Vitest may use the whole local budget.
  // Inherited by every spawnSync below; an outer `beech test --diff` cap already set wins.
  const resources = resolveTestResources()
  if (resources) {
    lowerProcessPriority()
    process.env.VITEST_MAX_WORKERS ??= String(resources.budget)
  }
  console.log(dim(`  ${describeTestResources(resources)}`))
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

  // Machine-wide slot shared with every worktree; flow shares one Docker stack, so it is exclusive.
  try {
    releaseOnExit(await acquireCpuSlot({ exclusive: selectedTiers.includes('flow'), label: `test:diff --tier ${selectedTiers.join(',')}` }))
  } catch (err) {
    if (err.code !== 'SLOT_TIMEOUT') throw err
    console.error(red(`${err.message} The diff run did NOT run.`))
    process.exit(EXIT_SLOT_TIMEOUT)
  }
  process.env[HELD_ENV] = '1'

  // Group files by workspace
  const workspaceGroups = new Map()
  for (const ws of WORKSPACES) {
    workspaceGroups.set(ws.name, { workspace: ws, files: [] })
  }

  const unmatched = []
  const neverSelected = []
  for (const file of changedFiles) {
    if (isNeverSelected(file)) { neverSelected.push(file); continue }

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

  if (neverSelected.length > 0) {
    console.log(dim(`   Skipping ${neverSelected.length} file(s) under a never-selected prefix (${NEVER_SELECTED_PREFIXES.join(', ')}):`))
    for (const f of neverSelected) console.log(dim(`     - ${f}`))
    console.log(dim('   The e2e tier runs only pre-merge/nightly — never from --diff.'))
    console.log()
  }

  const changedLines = getChangedLines(base)

  let anyWorkspaceRan = false
  let anyTierFailed = false
  let coverageFailures = 0
  let coverageRows = 0
  let notMeasured = 0

  for (const { workspace, files } of workspaceGroups.values()) {
    if (files.length === 0) continue

    const workspaceDir = path.join(ROOT, workspace.dir)
    const configPath   = path.join(workspaceDir, workspace.config)
    const { include, exclude, thresholds } = parseVitestConfig(configPath)

    console.log(bold(`[${workspace.name}]`))
    console.log(dim('  ' + '─'.repeat(60)))

    // Classify files
    const sourceFiles  = []

    for (const absFile of files) {
      const relToWs = path.relative(workspaceDir, absFile).replace(/\\/g, '/')

      // Skip test files themselves — we care about source files
      if (/\.test\.(ts|tsx|js|jsx)$/.test(relToWs)) continue

      // Skip non-TS/JS files (markdown, sql, json, etc.)
      if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(relToWs)) continue

      // Skip deleted files
      if (!fs.existsSync(absFile)) continue

      if (isExcluded(relToWs, { include, exclude })) continue

      sourceFiles.push(absFile)
    }

    if (sourceFiles.length === 0) {
      console.log(dim('   (no testable source files in this workspace — all skipped or excluded)'))
      console.log()
      continue
    }

    // Executable lines and hits per source file, combined across the V8 tiers of this workspace.
    const combinedHits = new Map()
    let coverageTierRan = false
    let unmeasuredTierPassed = false
    let workspaceTestsFailed = false

    for (const tier of selectedTiers) {
      const runner = workspace.tiers[tier]
      if (!runner) continue                      // workspace does not own this tier

      anyWorkspaceRan = true
      console.log(`   ${dim(`[${tier}] vitest (${runner.mode === 'related' && !runAllMode ? 'related' : 'full'}) — ${sourceFiles.length} source file(s)…`)}`)

      const { stdout, stderr, status } = runVitestTier(workspace, runner, sourceFiles)

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

      if (status !== 0) { anyTierFailed = true; workspaceTestsFailed = true }

      if (!runner.coverage) {
        // No coverage provider in this tier: pass/fail is the whole signal.
        if (status === 0) unmeasuredTierPassed = true
        console.log(status === 0 ? green(`   [${tier}] PASS`) : red(`   [${tier}] FAIL`))
        console.log()
        continue
      }
      coverageTierRan = true

      // Whole-file summary (context) and per-line hits (verdict)
      const summary = parseCoverageSummary(workspaceDir)
      const tierHits = parseLineHits(workspaceDir)
      const tierTableRows = []

      for (const absFile of sourceFiles) {
        const relFile = path.relative(workspaceDir, absFile).replace(/\\/g, '/')
        const display = path.join(workspace.dir, relFile).replace(/\\/g, '/')

        const summaryKey = Object.keys(summary || {}).find(k => path.resolve(k) === path.resolve(absFile))
        const fileHits = tierHits.get(path.resolve(absFile))
        if (fileHits) combinedHits.set(absFile, unionLineHits(combinedHits.get(absFile) ?? new Map(), fileHits))

        if (!summary || !summaryKey) {
          // No coverage data — no tests found for this file
          tierTableRows.push({ file: display, status: '? No Tests Found' })
          continue
        }

        const data = summary[summaryKey]
        tierTableRows.push({
          file: display,
          stmts:  data.statements?.pct,
          branch: data.branches?.pct,
          funcs:  data.functions?.pct,
          lines:  data.lines?.pct,
          status: status === 0 ? 'ok' : 'FAIL Tests Failed',
        })
      }

      console.log(dim(`   [${tier}] whole-file figures (context)`))
      renderTierTable(tierTableRows)
      console.log()
    }

    if (!coverageTierRan) continue

    // ─── Verdict: changed lines, all V8 tiers combined ─────────────────────
    const lineThreshold = thresholds.lines
    const verdictRows = []
    const uncoveredNotes = []

    for (const absFile of sourceFiles) {
      const relToRoot = path.relative(ROOT, absFile).replace(/\\/g, '/')
      const hits = combinedHits.get(absFile)

      if (!hits) {
        if (unmeasuredTierPassed) {
          verdictRows.push({ file: relToRoot, status: 'NOT MEASURED (workerd tier has no V8 coverage)' })
          notMeasured++
        } else {
          verdictRows.push({ file: relToRoot, status: '? No Tests Found' })
          coverageFailures++
          coverageRows++
        }
        continue
      }

      const result = changedLineCoverage(changedLines.get(relToRoot), hits)
      let status
      if (workspaceTestsFailed) {
        status = 'FAIL Tests Failed'
      } else if (result.pct === null) {
        status = 'PASS'
      } else if (result.covered === 0 && unmeasuredTierPassed) {
        // Nothing V8 can see ran these lines, but the workerd tier passed: it may well be what covers them.
        status = 'NOT MEASURED (workerd tier has no V8 coverage)'
        notMeasured++
      } else if (result.covered === 0) {
        status = '!! Untested'
      } else if (result.pct < lineThreshold) {
        status = `LOW: changed lines ${result.pct.toFixed(1)}%<${lineThreshold}%`
      } else {
        status = 'PASS'
      }

      if (status === '!! Untested' || status.startsWith('LOW:')) {
        coverageFailures++
        uncoveredNotes.push(`${relToRoot}: lines ${formatLineRanges(result.uncovered)}`)
      }
      if (!workspaceTestsFailed) coverageRows++
      verdictRows.push({ file: relToRoot, ...result, status })
    }

    console.log(dim(`   [${workspace.name}] changed-line coverage (tiers combined, threshold ${lineThreshold}%)`))
    renderChangedLineTable(verdictRows)
    for (const note of uncoveredNotes) console.log(dim(`   uncovered changed lines — ${note}`))
    console.log()
  }

  if (!anyWorkspaceRan) {
    console.log(yellow('No testable source files found in any workspace.'))
    console.log(dim('  All changed files may be excluded, non-source, or outside tracked workspaces.'))
    return
  }

  // ─── Summary Footer ──────────────────────────────────────────────────────
  const coverageFailed = coverageFailures > 0
  console.log(bold('─'.repeat(70)))
  console.log(anyTierFailed ? red(bold('FAIL  Tests: at least one selected test run failed.')) : green(bold('PASS  Tests: every selected test run passed.')))
  if (coverageRows === 0 && !coverageFailed) {
    // nothing measured
  } else if (!coverageFailed) {
    console.log(green(bold(`PASS  Coverage: all ${coverageRows} changed file(s) meet the changed-line threshold.`)))
  } else {
    console.log(red(bold(`FAIL  Coverage: ${coverageFailures} / ${coverageRows} file(s) below threshold or untested.`)))
    console.log(dim('      Review LOW: / !! Untested entries above and add tests.'))
  }
  if (notMeasured > 0) {
    console.log(yellow(`      ${notMeasured} file(s) NOT MEASURED: only the workerd integration tier could cover them. Check by hand that a suite does.`))
  }
  console.log()

  // The exit status mirrors the two verdicts above (see the header for the codes).
  process.exitCode = exitCodeFor({ testsFailed: anyTierFailed, coverageFailed })
}

main().catch(err => {
  console.error(red('ERROR:'), err)
  process.exit(1)
})
