import pc from 'picocolors'
import { createInterface } from 'node:readline/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { BranchType } from '@beechcms/core'

export type SeedCreateOptions = Record<string, never>

const BRANCH_TYPES: BranchType[] = ['text', 'number', 'boolean', 'date', 'richtext', 'file', 'tags']

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function toConstName(slug: string): string {
  return slug.replace(/-/g, '_').toUpperCase() + '_SEED'
}

function toLabel(alias: string): string {
  return alias
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

interface BranchDef {
  alias: string
  label: string
  type: BranchType
  required: boolean
}

function generateSeedBlock(slug: string, label: string, labelPlural: string, branches: BranchDef[]): string {
  const displayAlias =
    branches.find(b => b.type === 'text')?.alias ??
    branches[0]?.alias ??
    'name'

  const cName = toConstName(slug)
  const branchLines = branches.map(b => {
    const parts: string[] = [
      `alias: '${b.alias}'`,
      `label: '${b.label}'`,
      `type: '${b.type}'`,
    ]
    if (b.required) parts.push('requiredOnCreate: true')
    return `    { ${parts.join(', ')} },`
  })

  return [
    '',
    `export const ${cName} = defineSeed({`,
    `  slug: '${slug}',`,
    `  label: '${label}',`,
    `  labelPlural: '${labelPlural}',`,
    `  displayNameAlias: '${displayAlias}',`,
    '  branches: [',
    ...branchLines,
    '  ],',
    '  dashboard: {',
    "    icon: 'Folder',",
    "    group: 'Content',",
    '  },',
    '})',
    '',
  ].join('\n')
}

function ensureDefineSeedImport(content: string): string {
  if (content.includes('defineSeed')) return content
  return `import { defineSeed } from '@beechcms/core'\n` + content
}

function tryInsertRegistryEntry(content: string, slug: string, cName: string): string | null {
  const match = content.match(/(SEED_REGISTRY[^{]*\{)([\s\S]*?)(\n\})/m)
  if (!match) return null
  const [full, open, inner, close] = match
  const newEntry = `\n  ${slug}: ${cName},`
  return content.replace(full, open + inner + newEntry + close)
}

function findSeedsFile(): string | null {
  const cwd = process.cwd()
  const searchDirs = [cwd, resolve(cwd, 'apps', 'api')]
  for (const dir of searchDirs) {
    for (const name of ['seeds.ts', 'seed.ts']) {
      const p = resolve(dir, name)
      if (existsSync(p)) return p
    }
  }
  return null
}

export async function seedCreate(_args: SeedCreateOptions): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })

  const ask = async (q: string, fallback = ''): Promise<string> => {
    const hint = fallback ? pc.dim(` [${fallback}]`) : ''
    const answer = await rl.question(`  ${q}${hint}: `)
    return answer.trim() || fallback
  }

  const askYN = async (q: string, defaultYes = true): Promise<boolean> => {
    const hint = defaultYes ? pc.dim(' (Y/n)') : pc.dim(' (y/N)')
    const answer = (await rl.question(`  ${q}${hint}: `)).trim().toLowerCase()
    if (!answer) return defaultYes
    return answer === 'y' || answer === 'yes'
  }

  console.log(pc.cyan('\n  beech seed:create — new content type wizard\n'))

  try {
    const label = await ask('Content type name (singular, e.g. "Article")')
    if (!label) {
      rl.close()
      console.log(pc.red('\n  ✗ Name required.\n'))
      process.exit(1)
    }

    const defaultSlug = slugify(label) + 's'
    const slug = slugify(await ask('Slug (plural, used in URL + table name)', defaultSlug)) || defaultSlug
    const labelPlural = (await ask('Plural label', label + 's')) || label + 's'

    const branches: BranchDef[] = []
    console.log(pc.dim('\n  Now define the fields. Press Enter to accept defaults.\n'))

    let addMore = true
    while (addMore) {
      console.log(pc.dim(`  ─── Field ${branches.length + 1} ───`))
      const alias = await ask('  Alias (camelCase, e.g. "title", "publishedAt")')
      if (!alias) {
        console.log(pc.yellow('  Alias required — skipping.'))
        addMore = await askYN('\n  Add a field?')
        continue
      }

      const fieldLabel = (await ask('  Label', toLabel(alias))) || toLabel(alias)
      const typeList = BRANCH_TYPES.join(' | ')
      const rawType = (await ask(`  Type (${typeList})`, 'text')).toLowerCase()
      const type: BranchType = (BRANCH_TYPES.includes(rawType as BranchType) ? rawType : 'text') as BranchType
      const required = await askYN('  Required on create?', false)

      branches.push({ alias, label: fieldLabel, type, required })
      addMore = await askYN('\n  Add another field?')
    }

    rl.close()

    if (branches.length === 0) {
      console.log(pc.yellow('\n  No fields defined — seed not created.\n'))
      process.exit(0)
    }

    const seedBlock = generateSeedBlock(slug, label, labelPlural, branches)
    const cName = toConstName(slug)
    const seedsPath = findSeedsFile()

    if (!seedsPath) {
      console.log(pc.yellow('\n  Could not find seeds.ts. Add this to your seeds file manually:\n'))
      console.log(seedBlock)
      process.exit(0)
    }

    let content = readFileSync(seedsPath, 'utf-8')
    content = ensureDefineSeedImport(content)

    const withSeed = content + seedBlock
    const withRegistry = tryInsertRegistryEntry(withSeed, slug, cName)
    writeFileSync(seedsPath, withRegistry ?? withSeed, 'utf-8')

    console.log(pc.green(`\n  ✓ Seed "${slug}" appended to ${seedsPath}\n`))

    if (!withRegistry) {
      console.log(pc.yellow(`  ⚠ Could not auto-update SEED_REGISTRY — add this entry manually:\n`))
      console.log(pc.cyan(`    ${slug}: ${cName},\n`))
    }

    console.log(pc.dim('  Next steps:'))
    console.log(pc.cyan('  npx beech seed:load --local'))
    console.log(pc.dim('  → create the new content table in your local D1 database\n'))
  } catch (err) {
    rl.close()
    throw err
  }
}
