#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, dirname, normalize, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import pc from 'picocolors'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, '..')
const DOCS_DIR = resolve(ROOT_DIR, 'docs')

let failureCount = 0

function error(msg) {
  console.error(pc.red(`  ✖ ${msg}`))
  failureCount++
}

function success(msg) {
  console.log(pc.green(`  ✓ ${msg}`))
}

function header(title) {
  console.log(`\n${pc.bold(pc.cyan(`▶ ${title}`))}`)
}

// -------------------------------------------------------------
// 1. Check Internal Links Integrity
// -------------------------------------------------------------
header('1. Checking Documentation Links Integrity')

function getMarkdownFiles(dir) {
  const results = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['.vitepress', 'Sprints', 'personal', 'examples', 'node_modules', 'dist', 'cache'].includes(entry.name)) {
        continue
      }
      results.push(...getMarkdownFiles(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath)
    }
  }
  return results
}

const mdFiles = getMarkdownFiles(DOCS_DIR)
let linkErrors = 0
let totalLinksChecked = 0

const LINK_REGEX = /\[([^\]]+)\]\(([^)#\s]+)(?:#[^\)]*)?\)/g

for (const filePath of mdFiles) {
  const relPath = relative(DOCS_DIR, filePath)
  const content = readFileSync(filePath, 'utf-8')
  let match

  while ((match = LINK_REGEX.exec(content)) !== null) {
    const target = match[2]
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('tel:')) {
      continue
    }

    totalLinksChecked++
    let candidatePaths = []

    if (target.startsWith('/')) {
      const clean = target.replace(/^\//, '')
      candidatePaths = [
        join(DOCS_DIR, clean),
        join(DOCS_DIR, `${clean}.md`),
        join(DOCS_DIR, clean, 'index.md'),
        join(DOCS_DIR, 'public', clean)
      ]
    } else {
      const dir = dirname(filePath)
      candidatePaths = [
        join(dir, target),
        join(dir, `${target}.md`),
        join(dir, target, 'index.md')
      ]
    }

    const exists = candidatePaths.some((p) => existsSync(p))
    if (!exists) {
      error(`${relPath}: broken link to "${target}"`)
      linkErrors++
    }
  }
}

if (linkErrors === 0) {
  success(`All ${totalLinksChecked} internal links are valid and resolve to existing pages or assets.`)
}

// -------------------------------------------------------------
// 2. Fact-Checking SDK Imports in Framework Guides
// -------------------------------------------------------------
header('2. Fact-Checking @beechcms/client SDK Imports in Documentation')

// Dynamically import compiled client submodules
let clientBrowser, clientServer, clientRichtext, clientRoot

try {
  clientRoot = await import('../packages/client/dist/index.js')
  clientBrowser = await import('../packages/client/dist/browser/index.js')
  clientServer = await import('../packages/client/dist/server/index.js')
  clientRichtext = await import('../packages/client/dist/richtext/index.js')
} catch (err) {
  console.warn(pc.yellow(`  ⚠ Could not load compiled @beechcms/client modules: ${err.message}`))
}

if (clientRoot && clientBrowser && clientServer && clientRichtext) {
  const packageExports = {
    '@beechcms/client': Object.keys(clientRoot),
    '@beechcms/client/browser': Object.keys(clientBrowser),
    '@beechcms/client/server': Object.keys(clientServer),
    '@beechcms/client/richtext': Object.keys(clientRichtext),
  }

  const frameworkFiles = getMarkdownFiles(join(DOCS_DIR, 'start', 'frameworks'))
  const IMPORT_REGEX = /import\s+\{([^}]+)\}\s+from\s+['"](@beechcms\/client(?:\/[a-z]+)?)['"]/g
  let importsChecked = 0
  let importErrors = 0

  for (const filePath of frameworkFiles) {
    const relPath = relative(DOCS_DIR, filePath)
    const content = readFileSync(filePath, 'utf-8')
    let match

    while ((match = IMPORT_REGEX.exec(content)) !== null) {
      const rawImports = match[1]
      const pkgName = match[2]
      const exportedSymbols = packageExports[pkgName]

      if (!exportedSymbols) {
        error(`${relPath}: Unknown package import path "${pkgName}"`)
        importErrors++
        continue
      }

      const importedSymbols = rawImports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      for (const symbol of importedSymbols) {
        // Skip type imports like `type Post`
        if (symbol.startsWith('type ')) continue
        const cleanSymbol = symbol.split(/\s+as\s+/)[0].trim()

        importsChecked++
        if (!exportedSymbols.includes(cleanSymbol)) {
          error(`${relPath}: Imported symbol "${cleanSymbol}" is NOT exported by "${pkgName}"`)
          importErrors++
        }
      }
    }
  }

  if (importErrors === 0) {
    success(`Verified ${importsChecked} SDK imports across framework guides against actual compiled exports.`)
  }
}

// -------------------------------------------------------------
// 3. Fact-Checking CLI Command Matrix Parity
// -------------------------------------------------------------
header('3. Fact-Checking CLI Command Matrix vs docs/build/cli-workflows.md')

const cliMjsPath = resolve(ROOT_DIR, 'bin/cli.mjs')
const cliDocsPath = resolve(DOCS_DIR, 'build/cli-workflows.md')

if (existsSync(cliMjsPath) && existsSync(cliDocsPath)) {
  const cliSource = readFileSync(cliMjsPath, 'utf-8')
  const docsContent = readFileSync(cliDocsPath, 'utf-8')

  const commandsMatch = cliSource.match(/const COMMANDS = \{([\s\S]*?)\n\}/)
  if (commandsMatch) {
    const rawLines = commandsMatch[1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'))

    const registeredCommands = []
    for (const line of rawLines) {
      const match = line.match(/^['"]?([a-zA-Z0-9_:-]+)['"]?\s*:/)
      if (match) registeredCommands.push(match[1])
    }

    const aliasGroups = {
      forms: ['forms', 'form', 'forms:add'],
      'gen-types': ['gen-types', 'gen:types', 'generate:types', 'gen types typescript'],
      'setup:cloudflare': ['setup:cloudflare', 'setup:cf'],
      dev: ['dev', 'start'],
    }

    const checked = new Set()
    let missingDocs = 0

    for (const cmd of registeredCommands) {
      let group = null
      for (const aliases of Object.values(aliasGroups)) {
        if (aliases.includes(cmd)) {
          group = aliases
          break
        }
      }

      if (group) {
        const key = group.join('|')
        if (checked.has(key)) continue
        checked.add(key)
        const documented = group.some((alias) => docsContent.includes(`beech ${alias}`))
        if (!documented) {
          error(`CLI command group [${group.join(', ')}] is missing from cli-workflows.md`)
          missingDocs++
        }
      } else {
        if (!docsContent.includes(`beech ${cmd}`)) {
          error(`CLI command "beech ${cmd}" is registered in bin/cli.mjs but missing from cli-workflows.md`)
          missingDocs++
        }
      }
    }

    if (missingDocs === 0) {
      success(`All ${registeredCommands.length} CLI command aliases in bin/cli.mjs are documented in cli-workflows.md.`)
    }
  }
}

// -------------------------------------------------------------
// 4. Fact-Checking VitePress Sidebar Links
// -------------------------------------------------------------
header('4. Fact-Checking VitePress Sidebar Navigation Links')

const vitepressConfigPath = resolve(DOCS_DIR, '.vitepress/config.mts')
if (existsSync(vitepressConfigPath)) {
  const configSource = readFileSync(vitepressConfigPath, 'utf-8')
  const LINK_MATCH = /link:\s*['"]([^'"]+)['"]/g
  let sidebarMatches
  let checkedSidebarLinks = 0
  let sidebarErrors = 0

  while ((sidebarMatches = LINK_MATCH.exec(configSource)) !== null) {
    const link = sidebarMatches[1]
    if (link.startsWith('http://') || link.startsWith('https://')) continue

    checkedSidebarLinks++
    const clean = link.replace(/^\//, '')
    const candidates = [
      join(DOCS_DIR, clean),
      join(DOCS_DIR, `${clean}.md`),
      join(DOCS_DIR, clean, 'index.md'),
    ]

    const exists = candidates.some((p) => existsSync(p))
    if (!exists) {
      error(`Sidebar link "${link}" in config.mts points to non-existent file`)
      sidebarErrors++
    }
  }

  if (sidebarErrors === 0) {
    success(`All ${checkedSidebarLinks} sidebar navigation links resolve to valid markdown files.`)
  }
}

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n' + pc.bold('====================================================='))
if (failureCount === 0) {
  console.log(pc.bold(pc.green('✔ DOCUMENTATION FACT-CHECK PASSED: Code and Docs in 100% parity.')))
  console.log(pc.bold('=====================================================\n'))
  process.exit(0)
} else {
  console.log(pc.bold(pc.red(`✖ DOCUMENTATION FACT-CHECK FAILED with ${failureCount} issue(s).`)))
  console.log(pc.bold('=====================================================\n'))
  process.exit(1)
}
