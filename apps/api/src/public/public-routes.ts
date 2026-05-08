import { Hono } from 'hono'
import type { AppEnv } from '../types'
import { publicReadHandler } from './public-read'
import { publicAddHandler } from './public-add'
import { publicEditHandler } from './public-edit'

const publicApp = new Hono<AppEnv>()

publicApp.get('/health', (c) => {
  return c.json({ ok: true, service: 'public-api' }, 200)
})

/** Returns the public-facing schema: only seeds with public read or post enabled. */
publicApp.get('/schema', (c) => {
  const registry = c.get('seedRegistry')
  const publicSeeds = registry.all()
    .filter(seed => seed.allowPublicRead === true || seed.allowPublicPost === true || seed.allowPublicEdit === true)
    .map(seed => ({
      slug: seed.slug,
      label: seed.label,
      labelPlural: seed.labelPlural,
      allowPublicRead: seed.allowPublicRead ?? false,
      allowPublicPost: seed.allowPublicPost ?? false,
      allowPublicEdit: seed.allowPublicEdit ?? false,
      branches: (seed.branches ?? []).map(branch => ({
        alias: branch.alias,
        type: branch.type,
        label: branch.label,
        requiredOnCreate: branch.requiredOnCreate ?? false,
        policies: {
          public: branch.policies?.public ?? true,
          visibility: branch.policies?.visibility ?? 'full',
        },
      })),
    }))
  return c.json({ seeds: publicSeeds })
})

/** HTML render of the public schema for quick browser inspection. */
publicApp.get('/schema.html', (c) => {
  const registry = c.get('seedRegistry')
  const publicSeeds = registry.all()
    .filter(seed => seed.allowPublicRead === true || seed.allowPublicPost === true || seed.allowPublicEdit === true)

  const seedHtml = publicSeeds.map(seed => {
    const ops = [
      seed.allowPublicRead && 'GET /:seed',
      seed.allowPublicPost && 'POST /:seed/add',
      seed.allowPublicEdit && 'PUT /:seed/edit/:id',
    ].filter(Boolean).join(', ')

    const branchRows = (seed.branches ?? []).map(b =>
      `<tr><td>${b.alias}</td><td>${b.type}</td><td>${b.label}</td><td>${b.requiredOnCreate ? 'yes' : ''}</td><td>${(b.policies?.public ?? true) ? 'readable' : 'hidden'}</td></tr>`
    ).join('')

    return `<section>
      <h2>${seed.label} <code>${seed.slug}</code></h2>
      <p><strong>Allowed operations:</strong> ${ops || 'none'}</p>
      <table><thead><tr><th>alias</th><th>type</th><th>label</th><th>required</th><th>public access</th></tr></thead>
      <tbody>${branchRows}</tbody></table>
    </section>`
  }).join('\n')

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>BeechCMS Public Schema</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#222}
code{background:#f3f4f6;padding:2px 6px;border-radius:4px}
table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 10px;border:1px solid #e5e7eb}
th{background:#f9fafb}h2{margin-top:2rem}section{margin-bottom:2rem}</style>
</head><body>
<h1>BeechCMS — Public API Schema</h1>
<p>Only content types with public access enabled are listed here.</p>
${seedHtml || '<p><em>No content types with public access configured.</em></p>'}
</body></html>`

  return c.html(html)
})

publicApp.get('/:seed', publicReadHandler)
publicApp.post('/:seed/add', publicAddHandler)
publicApp.put('/:seed/edit/:id', publicEditHandler)

export const publicRoutes = publicApp

