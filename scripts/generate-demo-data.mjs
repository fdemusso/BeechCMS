import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

const firstNames = ['Luca', 'Marco', 'Giulia', 'Anna', 'Francesca', 'Matteo', 'Alessandro', 'Sofia', 'Martina', 'Lorenzo']
const lastNames = ['Rossi', 'Bianchi', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo']
const companies = ['Acme Corp', 'TechFlow', 'DataSync', 'GlobalNet', 'Innova Solutions', 'NextGen IT', 'CloudBase', 'Alpha Dynamics', 'Beta Systems', 'Nova Labs']

const now = new Date()
const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

function escapeSql(str) {
  if (!str) return 'NULL'
  return "'" + str.replace(/'/g, "''") + "'"
}

const numCustomers = 50
const customers = []
for (let i = 1; i <= numCustomers; i++) {
  const id = `clt-${String(i).padStart(4, '0')}`
  const name = `${randomItem(firstNames)} ${randomItem(lastNames)}`
  const company = randomItem(companies)
  const tier = randomItem(['free', 'free', 'free', 'pro', 'pro', 'enterprise'])
  const account_status = Math.random() > 0.15 ? 'active' : 'churned'
  const mrr = account_status === 'active' ? (tier === 'enterprise' ? randomInt(500, 2000) : tier === 'pro' ? randomInt(50, 150) : 0) : 0
  const created_at = Math.floor(randomDate(sixtyDaysAgo, now).getTime() / 1000)
  
  customers.push({
    id, slug: `customer-${i}`, status: 'published',
    name, email: `${name.replace(' ', '.').toLowerCase()}@example.com`, company, tier, account_status, mrr, created_at
  })
}

const numSubscriptions = 80
const subscriptions = []
for (let i = 1; i <= numSubscriptions; i++) {
  const customer = randomItem(customers)
  const id = `sub-${String(i).padStart(4, '0')}`
  const amount = customer.tier === 'enterprise' ? randomInt(500, 2000) : customer.tier === 'pro' ? randomInt(50, 150) : 0
  const cycle = randomItem(['monthly', 'monthly', 'annual'])
  let payment_status = customer.account_status === 'churned' ? 'canceled' : (Math.random() > 0.05 ? 'active' : 'past_due')
  const created_at = customer.created_at + randomInt(86400, 86400 * 30)

  subscriptions.push({
    id, slug: `sub-${i}`, status: 'published',
    customer_id: customer.id, amount, billing_cycle: cycle, payment_status, created_at
  })
}

const numTickets = 60
const tickets = []
const ticketCategories = ['billing', 'technical', 'sales']
for (let i = 1; i <= numTickets; i++) {
  const customer = randomItem(customers)
  const id = `tkt-${String(i).padStart(4, '0')}`
  const cat = randomItem(ticketCategories)
  const priority = randomItem(['low', 'medium', 'high'])
  const ticket_status = Math.random() > 0.3 ? 'closed' : (Math.random() > 0.5 ? 'open' : 'in_progress')
  const created_at = Math.floor(randomDate(sixtyDaysAgo, now).getTime() / 1000)
  
  tickets.push({
    id, slug: `tkt-${i}`, status: 'published',
    title: `Richiesta assistenza ${cat} #${i}`, customer_id: customer.id, priority, category: cat, ticket_status, created_at
  })
}

const changelog = [
  { id: 'chg-0001', slug: 'v1-0-0', status: 'published', version: 'v1.0.0', release_date: Math.floor(sixtyDaysAgo.getTime() / 1000), features: '<p>Lancio ufficiale della piattaforma con gestione clienti base.</p>', created_at: Math.floor(sixtyDaysAgo.getTime() / 1000) },
  { id: 'chg-0002', slug: 'v1-1-0', status: 'published', version: 'v1.1.0', release_date: Math.floor(now.getTime() / 1000) - 30 * 86400, features: '<p>Aggiunti report avanzati e export in CSV.</p>', created_at: Math.floor(now.getTime() / 1000) - 30 * 86400 },
  { id: 'chg-0003', slug: 'v1-2-0', status: 'published', version: 'v1.2.0', release_date: Math.floor(now.getTime() / 1000) - 15 * 86400, features: '<p>Integrazione con Slack per notifiche ticket.</p>', created_at: Math.floor(now.getTime() / 1000) - 15 * 86400 },
  { id: 'chg-0004', slug: 'v2-0-0', status: 'published', version: 'v2.0.0', release_date: Math.floor(now.getTime() / 1000) - 2 * 86400, features: '<h2>Major Update</h2><p>Nuova dashboard amministrativa e API pubbliche.</p>', created_at: Math.floor(now.getTime() / 1000) - 2 * 86400 }
]

const articoli = [
  { id: 'art-0001', slug: 'benvenuti', status: 'published', title: 'Come ridurre il Churn Rate', author: 'Luca Rossi', cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80', body: '<p>Analisi delle migliori strategie per mantenere i clienti SaaS nel 2026.</p>', created_at: Math.floor(now.getTime() / 1000) - 20 * 86400 },
  { id: 'art-0002', slug: 'pricing-strategy', status: 'published', title: 'Pricing SaaS: Fremium vs Trial', author: 'Anna Bianchi', cover_image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80', body: '<p>Cosa scegliere per massimizzare la conversion rate e il Customer Lifetime Value.</p>', created_at: Math.floor(now.getTime() / 1000) - 5 * 86400 }
]

function toSqlInsert(table, columns, items) {
  if (items.length === 0) return ''
  const values = items.map(item => {
    const vals = columns.map(col => {
      const val = item[col]
      if (val === undefined || val === null) return 'NULL'
      if (typeof val === 'number') return val
      return escapeSql(val)
    })
    return `(${vals.join(', ')})`
  }).join(',\n')
  return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')})\nVALUES\n${values};\n`
}

const clientiSql = toSqlInsert('content_clienti', ['id', 'slug', 'status', 'name', 'email', 'company', 'tier', 'account_status', 'mrr', 'created_at', 'updated_at'], customers.map(c => ({...c, updated_at: c.created_at})))
const abbonamentiSql = toSqlInsert('content_abbonamenti', ['id', 'slug', 'status', 'customer_id', 'amount', 'billing_cycle', 'payment_status', 'created_at', 'updated_at'], subscriptions.map(s => ({...s, updated_at: s.created_at})))
const ticketsSql = toSqlInsert('content_ticket', ['id', 'slug', 'status', 'title', 'customer_id', 'priority', 'category', 'ticket_status', 'created_at', 'updated_at'], tickets.map(t => ({...t, updated_at: t.created_at})))
const changelogSql = toSqlInsert('content_changelog', ['id', 'slug', 'status', 'version', 'release_date', 'features', 'created_at', 'updated_at'], changelog.map(c => ({...c, updated_at: c.created_at})))
const articoliSql = toSqlInsert('content_articoli', ['id', 'slug', 'status', 'title', 'author', 'cover_image', 'body', 'created_at', 'updated_at'], articoli.map(a => ({...a, updated_at: a.created_at})))

const combinedSql = [
  clientiSql,
  abbonamentiSql,
  ticketsSql,
  changelogSql,
  articoliSql
].join('\n')

const outPath = path.resolve(__dirname, '../apps/api/src/shared/demo-data-sql.ts')
const output = `// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const DEMO_DATA_SQL = \`
${combinedSql}
\`
`
fs.writeFileSync(outPath, output, 'utf-8')
console.log('Successfully generated demo data SQL!')

