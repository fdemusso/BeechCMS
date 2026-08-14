import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function uuid() {
  return crypto.randomUUID()
}

const firstNames = [
  'James', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'William', 'Sophia', 'Benjamin', 'Isabella',
  'Lucas', 'Mia', 'Henry', 'Charlotte', 'Alexander', 'Amelia', 'Michael', 'Harper', 'Daniel', 'Evelyn',
  'Matthew', 'Abigail', 'David', 'Emily', 'Joseph', 'Elizabeth', 'Samuel', 'Sofia', 'John', 'Avery',
]
const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris',
]
const companies = [
  'Acme Corp', 'TechFlow', 'DataSync', 'GlobalNet', 'Innova Solutions', 'NextGen IT', 'CloudBase',
  'Alpha Dynamics', 'Beta Systems', 'Nova Labs', 'Quantum Reach', 'Vertex Digital', 'Brightline Media',
  'Sunrise Analytics', 'Northwind Software', 'Pixel Forge', 'Orbit Commerce', 'Silverline Group',
  'Meridian Labs', 'Evergreen Tech', 'BluePeak Systems', 'Skyline Ventures', 'Forge & Co', 'Lumen Digital',
  'Cobalt Works',
]
const companyDomains = [
  'acmecorp.io', 'techflow.dev', 'datasync.com', 'globalnet.io', 'innovasolutions.io', 'nextgenit.com',
  'cloudbase.app', 'alphadynamics.io', 'betasystems.com', 'novalabs.dev', 'quantumreach.io',
  'vertexdigital.com', 'brightlinemedia.com', 'sunriseanalytics.com', 'northwindsoftware.io',
  'pixelforge.studio', 'orbitcommerce.com', 'silverlinegroup.io', 'meridianlabs.dev',
  'evergreentech.com', 'bluepeaksystems.io', 'skylineventures.com', 'forgeandco.io', 'lumendigital.com',
  'cobaltworks.dev',
]

const now = new Date()
const DAY_MS = 24 * 60 * 60 * 1000
const DAYS_BACK = 30
const rangeStart = new Date(now.getTime() - DAYS_BACK * DAY_MS)

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL'
  return "'" + String(str).replace(/'/g, "''") + "'"
}

/**
 * Number of events on day `d` (0 = oldest day, DAYS_BACK-1 = today), following
 * a roughly linear growth curve from `base` to `base + growth` events/day with
 * random jitter — used so timeseries widgets show a believable upward trend
 * instead of flat noise.
 */
function growthCount(d, base, growth, jitter = 0.6) {
  const rate = base + (d / (DAYS_BACK - 1)) * growth
  const value = Math.round(rate + (Math.random() - 0.5) * jitter * 2)
  return Math.max(0, value)
}

function timestampOnDay(d) {
  const dayStart = rangeStart.getTime() + d * DAY_MS
  const ts = Math.floor((dayStart + Math.random() * DAY_MS) / 1000)
  return Math.min(ts, Math.floor(now.getTime() / 1000) - 1)
}

// ── CUSTOMERS ────────────────────────────────────────────────────────────────
// Signups follow a growth curve (more recent days bring in more customers) so
// "Signups Trend" shows a meaningful upward trend rather than noise.

const customers = []
const usedSlugs = new Set()

for (let d = 0; d < DAYS_BACK; d++) {
  const signups = growthCount(d, 1, 5)
  for (let n = 0; n < signups; n++) {
    const id = uuid()
    const first = randomItem(firstNames)
    const last = randomItem(lastNames)
    const name = `${first} ${last}`
    const companyIdx = randomInt(0, companies.length - 1)
    const company = companies[companyIdx]
    const domain = companyDomains[companyIdx]

    let baseSlug = `${first}-${last}`.toLowerCase().replace(/\s+/g, '-')
    let slug = baseSlug
    let suffix = 1
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`
      suffix += 1
    }
    usedSlugs.add(slug)

    const tier = randomItem(['free', 'free', 'free', 'free', 'pro', 'pro', 'pro', 'enterprise'])
    const account_status = Math.random() > 0.12 ? 'active' : 'churned'
    const mrr = account_status === 'active'
      ? (tier === 'enterprise' ? randomInt(500, 2400) : tier === 'pro' ? randomInt(35, 180) : 0)
      : 0
    const created_at = timestampOnDay(d)

    customers.push({
      id, slug, status: 'published',
      name,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/\s+/g, '')}@${domain}`,
      company, tier, account_status, mrr, created_at,
    })
  }
}

// ── SUBSCRIPTIONS ────────────────────────────────────────────────────────────
// Each customer subscribes shortly after signing up; many also pick up a
// second subscription (upsell/renewal) later on — so "New Subscriptions"
// tracks the same growth curve as signups, shifted slightly into the future.

const subscriptions = []
let subCounter = 1

for (const customer of customers) {
  const planAmount = () => customer.tier === 'enterprise'
    ? randomInt(500, 2400)
    : customer.tier === 'pro' ? randomInt(35, 180) : 0

  const makeSub = (offsetDays) => {
    const id = uuid()
    const amount = planAmount()
    const cycle = randomItem(['monthly', 'monthly', 'monthly', 'annual'])
    const payment_status = customer.account_status === 'churned'
      ? 'canceled'
      : (Math.random() > 0.06 ? 'active' : 'past_due')
    const nowSec = Math.floor(now.getTime() / 1000)
    const baseTs = customer.created_at + offsetDays * 86400 + randomInt(0, 3600 * 4)
    const created_at = Math.min(Math.max(baseTs, customer.created_at), nowSec - 1)
    subscriptions.push({
      id, slug: `sub-${subCounter}`, status: 'published',
      customer_id: customer.id, amount, billing_cycle: cycle, payment_status, created_at,
    })
    subCounter += 1
  }

  // Initial subscription, within the first couple of days after signup.
  makeSub(randomInt(0, 2))

  // ~45% of customers add a second subscription (upsell/renewal) 3 to 8 days later.
  if (Math.random() < 0.45) {
    makeSub(randomInt(3, 8))
  }
}

// ── TICKETS ──────────────────────────────────────────────────────────────────

const tickets = []
const ticketCategories = ['billing', 'technical', 'sales']
const ticketTitlesByCategory = {
  billing: [
    'Invoice not received for this month',
    'Request to change payment method',
    'Billed amount does not match plan tier',
    'Question about pro-rata upgrades and add-ons',
    'Refund request for accidental duplicate charge',
    'Update company VAT and billing information',
    'Subscription renewal date confirmation',
  ],
  technical: [
    '500 Internal Server Error when publishing entries',
    'Webhook delivery synchronization timeout',
    'Uploaded images failing to render on CDN edge',
    'API authentication failure after key rotation',
    'Timeout during bulk CSV content import',
    'SAML SSO configuration assistance request',
    'Full-text search query syntax error on special characters',
  ],
  sales: [
    'Enterprise plan customized demo request',
    'Annual contract renewal volume discount inquiry',
    'Question about Pro tier seat limits and permissions',
    'Custom multi-tenant deployment pricing quote',
    'Migration assistance from legacy headless CMS',
    'Contract review and pro-forma invoice request',
  ],
}

// Ticket volume grows alongside the customer base ("Tickets Over Time"), and
// recent tickets are more likely to still be open/in_progress than old ones
// — so "Open Tickets" / "Closed Tickets" stats reflect a realistic backlog.
let ticketCounter = 1
for (let d = 0; d < DAYS_BACK; d++) {
  const opened = growthCount(d, 0.4, 2)
  for (let n = 0; n < opened; n++) {
    const rawTicketTs = timestampOnDay(d)
    const eligibleCustomers = customers.filter(c => c.created_at <= rawTicketTs)
    const customer = eligibleCustomers.length > 0 ? randomItem(eligibleCustomers) : randomItem(customers)
    const nowSec = Math.floor(now.getTime() / 1000)
    const created_at = Math.min(Math.max(rawTicketTs, customer.created_at + randomInt(60, 1800)), nowSec - 1)

    const id = uuid()
    const cat = randomItem(ticketCategories)
    const title = randomItem(ticketTitlesByCategory[cat])
    const priority = randomItem(['low', 'low', 'medium', 'medium', 'medium', 'high'])

    const recency = d / (DAYS_BACK - 1) // 0 = oldest, 1 = newest
    const closedChance = 0.85 - recency * 0.55 // ~85% closed when old, ~30% when recent
    const ticket_status = Math.random() < closedChance
      ? 'closed'
      : (Math.random() > 0.5 ? 'open' : 'in_progress')

    tickets.push({
      id, slug: `tkt-${ticketCounter}`, status: 'published',
      title, customer_id: customer.id, priority, category: cat, ticket_status, created_at,
    })
    ticketCounter += 1
  }
}

// ── CHANGELOG ────────────────────────────────────────────────────────────────

const changelogEntries = [
  { version: 'v1.0.0', daysAgo: 29, features: '<p>Official platform launch with core customer management and role-based access.</p>' },
  { version: 'v1.1.0', daysAgo: 26, features: '<p>Added advanced analytics reporting and CSV content export.</p>' },
  { version: 'v1.2.0', daysAgo: 23, features: '<p>Slack integration for real-time ticket alerts and notifications.</p>' },
  { version: 'v1.3.0', daysAgo: 20, features: '<p>New ticket tagging system and advanced dashboard query filters.</p>' },
  { version: 'v1.4.0', daysAgo: 17, features: '<h2>Performance</h2><p>Reduced API latency by 40% using Cloudflare Workers edge caching.</p>' },
  { version: 'v1.5.0', daysAgo: 14, features: '<p>Added annual billing support with automated loyalty discounts.</p>' },
  { version: 'v1.6.0', daysAgo: 11, features: '<h2>New Features</h2><p>Modular dashboard widgets with responsive drag-and-drop layouts.</p>' },
  { version: 'v1.7.0', daysAgo: 8, features: '<p>Configurable SLAs and instant email alerts for high-priority tickets.</p>' },
  { version: 'v2.0.0', daysAgo: 5, features: '<h2>Major Update</h2><p>Redesigned administrative dashboard and public REST/GraphQL APIs.</p>' },
  { version: 'v2.1.0', daysAgo: 3, features: '<p>Full-text search indexing enhancements and minor sync bug fixes.</p>' },
  { version: 'v2.2.0', daysAgo: 1, features: '<h2>Security</h2><p>Automated API key rotation and tamper-proof audit trails for all system events.</p>' },
]

const changelog = changelogEntries.map((c) => {
  const ts = Math.floor((now.getTime() - c.daysAgo * 86400 * 1000) / 1000)
  return {
    id: uuid(),
    slug: c.version.replace(/\./g, '-'),
    status: 'published',
    version: c.version,
    release_date: ts,
    features: c.features,
    created_at: ts,
  }
})

// ── ARTICOLI ─────────────────────────────────────────────────────────────────

const articoliEntries = [
  {
    slug: 'how-to-reduce-saas-churn-rate',
    title: 'How to Reduce SaaS Churn Rate',
    author: 'Alex Rivera',
    cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    body: '<p>Best practices for retaining SaaS customers in 2026: guided onboarding, proactive check-ins, and tailored customer success plans.</p>',
    daysAgo: 28,
  },
  {
    slug: 'saas-pricing-freemium-vs-trial',
    title: 'SaaS Pricing: Freemium vs Free Trial',
    author: 'Sarah Jenkins',
    cover_image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
    body: '<p>How to maximize conversion rate and Customer Lifetime Value: a practical comparison between freemium and time-limited trial models.</p>',
    daysAgo: 26,
  },
  {
    slug: 'enterprise-customer-onboarding-checklist',
    title: 'Enterprise Customer Onboarding Checklist',
    author: 'Michael Chang',
    cover_image: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80',
    body: '<p>Key milestones to guide new enterprise clients from contract signature to first realized value, reducing time-to-value.</p>',
    daysAgo: 23,
  },
  {
    slug: '7-saas-metrics-to-track-weekly',
    title: '7 SaaS Metrics Every Team Should Track Weekly',
    author: 'Emily Watson',
    cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    body: '<p>MRR, Churn, NRR, CAC, and LTV: a practical guide to the core metrics that drive sustainable subscription growth.</p>',
    daysAgo: 20,
  },
  {
    slug: 'automating-customer-support-quality',
    title: 'Automating Customer Support Without Sacrificing Quality',
    author: 'David Miller',
    cover_image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
    body: '<p>Using smart automation rules and ticket routing to slash resolution times while keeping customer satisfaction high.</p>',
    daysAgo: 18,
  },
  {
    slug: 'subscription-renewal-preventing-failed-payments',
    title: 'Subscription Renewal Guide: Preventing Failed Payments',
    author: 'Jessica Taylor',
    cover_image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
    body: '<p>Dunning strategies, smart retry logic, and automated payment reminders to minimize involuntary churn from expired cards.</p>',
    daysAgo: 15,
  },
  {
    slug: 'customer-segmentation-by-tier-insights',
    title: 'Customer Segmentation by Tier: What the Data Shows',
    author: 'Alex Rivera',
    cover_image: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80',
    body: '<p>Analyzing customer cohorts across free, pro, and enterprise tiers reveals clear patterns for upsell opportunities.</p>',
    daysAgo: 12,
  },
  {
    slug: 'case-study-enterprise-customers-scaling',
    title: 'Case Study: How Enterprise Customers Scale with BeechCMS',
    author: 'Sarah Jenkins',
    cover_image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80',
    body: '<p>Real stories of three high-growth companies that boosted their MRR by 30% within six months of adopting BeechCMS.</p>',
    daysAgo: 9,
  },
  {
    slug: 'ticket-priority-best-practices',
    title: 'Ticket Priority Best Practices: Impact vs Urgency',
    author: 'Michael Chang',
    cover_image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
    body: '<p>A simple 3x3 matrix for assigning low, medium, and high priorities based on business impact and urgency.</p>',
    daysAgo: 6,
  },
  {
    slug: 'product-roadmap-2026',
    title: 'Product Roadmap 2026',
    author: 'Emily Watson',
    cover_image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80',
    body: '<p>Upcoming features: modular dashboard builder, third-party webhook integrations, and distributed search indexing.</p>',
    daysAgo: 4,
  },
  {
    slug: 'security-audit-logs-v2-2-updates',
    title: "Security & Audit Logs: What's New in v2.2",
    author: 'David Miller',
    cover_image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
    body: '<p>Version 2.2 introduces tamper-proof audit trails, automated API key rotation, and role-based granular access control.</p>',
    daysAgo: 2,
  },
  {
    slug: 'annual-mrr-growth-analysis-learnings',
    title: 'Annual MRR Growth Analysis: Key Learnings',
    author: 'Jessica Taylor',
    cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    body: '<p>A comprehensive retrospective on Monthly Recurring Revenue growth: seasonality, expansion revenue, and churn prevention.</p>',
    daysAgo: 0,
  },
]

const articoli = articoliEntries.map((a) => {
  const ts = Math.floor((now.getTime() - a.daysAgo * 86400 * 1000) / 1000)
  return {
    id: uuid(),
    slug: a.slug,
    status: 'published',
    title: a.title,
    author: a.author,
    cover_image: a.cover_image,
    body: a.body,
    created_at: ts,
  }
})

// ── SQL OUTPUT ───────────────────────────────────────────────────────────────

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

const clientiSql = toSqlInsert('content_clienti', ['id', 'slug', 'status', 'name', 'email', 'company', 'tier', 'account_status', 'mrr', 'created_at', 'updated_at'], customers.map(c => ({ ...c, updated_at: c.created_at })))
const abbonamentiSql = toSqlInsert('content_abbonamenti', ['id', 'slug', 'status', 'customer_id', 'amount', 'billing_cycle', 'payment_status', 'created_at', 'updated_at'], subscriptions.map(s => ({ ...s, updated_at: s.created_at })))
const ticketsSql = toSqlInsert('content_ticket', ['id', 'slug', 'status', 'title', 'customer_id', 'priority', 'category', 'ticket_status', 'created_at', 'updated_at'], tickets.map(t => ({ ...t, updated_at: t.created_at })))
const changelogSql = toSqlInsert('content_changelog', ['id', 'slug', 'status', 'version', 'release_date', 'features', 'created_at', 'updated_at'], changelog.map(c => ({ ...c, updated_at: c.created_at })))
const articoliSql = toSqlInsert('content_articoli', ['id', 'slug', 'status', 'title', 'author', 'cover_image', 'body', 'created_at', 'updated_at'], articoli.map(a => ({ ...a, updated_at: a.created_at })))

const combinedSql = [
  clientiSql,
  abbonamentiSql,
  ticketsSql,
  changelogSql,
  articoliSql,
].join('\n')

const outPath = path.resolve(__dirname, '../apps/api/src/shared/demo-data-sql.ts')
const output = `// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export const DEMO_DATA_SQL = \`
${combinedSql}
\`
`
fs.writeFileSync(outPath, output, 'utf-8')
console.log(`Successfully generated demo data SQL! (${customers.length} clienti, ${subscriptions.length} abbonamenti, ${tickets.length} ticket, ${changelog.length} changelog, ${articoli.length} articoli)`)
