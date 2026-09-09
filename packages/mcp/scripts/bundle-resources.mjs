#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Copyright (c) 2024-2026 Flavio De Musso

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..')
const DOCS_ROOT = join(REPO_ROOT, 'docs')
const OUT_DIR = join(__dirname, '..', 'resources')

/** Curated allowlist. Directories are copied recursively (.md only); single files copied as-is. */
const INCLUDE = [
  { type: 'dir', src: 'api', dest: 'api' },
  { type: 'dir', src: 'build', dest: 'build' },
  { type: 'dir', src: 'features', dest: 'features' },
  { type: 'dir', src: 'manage', dest: 'manage' },
  { type: 'dir', src: 'reference', dest: 'reference' },
  { type: 'file', src: 'start/first-project.md', dest: 'start/first-project.md' },
]

function walkMarkdown(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkMarkdown(full))
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

function extractTitleAndDescription(absPath, fallbackRelPath) {
  const raw = readFileSync(absPath, 'utf8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (fm) {
    const title = fm[1].match(/^title:\s*(.+)$/m)?.[1]?.trim()
    const description = fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim()
    if (title) return { title, description: description ?? '' }
  }
  const heading = raw.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim()
  return { title: heading ?? fallbackRelPath, description: '' }
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

const manifest = []

for (const item of INCLUDE) {
  const srcAbs = join(DOCS_ROOT, item.src)
  if (item.type === 'file') {
    const destAbs = join(OUT_DIR, item.dest)
    mkdirSync(dirname(destAbs), { recursive: true })
    cpSync(srcAbs, destAbs)
    const { title, description } = extractTitleAndDescription(srcAbs, item.dest)
    manifest.push({ uri: `beechcms-docs://${item.dest}`, title, description, file: item.dest })
    continue
  }
  const files = walkMarkdown(srcAbs)
  for (const absFile of files) {
    const rel = relative(srcAbs, absFile)
    const destRel = join(item.dest, rel)
    const destAbs = join(OUT_DIR, destRel)
    mkdirSync(dirname(destAbs), { recursive: true })
    cpSync(absFile, destAbs)
    const { title, description } = extractTitleAndDescription(absFile, destRel)
    manifest.push({ uri: `beechcms-docs://${destRel.split('\\').join('/')}`, title, description, file: destRel.split('\\').join('/') })
  }
}

manifest.sort((a, b) => a.uri.localeCompare(b.uri))
writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))

console.log(`bundle-resources: wrote ${manifest.length} resources to ${OUT_DIR}`)
