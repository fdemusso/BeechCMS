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
  'Luca', 'Marco', 'Giulia', 'Anna', 'Francesca', 'Matteo', 'Alessandro', 'Sofia', 'Martina', 'Lorenzo',
  'Davide', 'Chiara', 'Federico', 'Elena', 'Simone', 'Valentina', 'Riccardo', 'Paola', 'Andrea', 'Silvia',
  'Stefano', 'Elisa', 'Nicola', 'Camilla', 'Tommaso', 'Beatrice', 'Gabriele', 'Laura', 'Filippo', 'Irene',
]
const lastNames = [
  'Rossi', 'Bianchi', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo',
  'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana',
  'Santoro', 'Mariani', 'Ferrari', 'Pellegrini', 'Caruso',
]
const companies = [
  'Acme Corp', 'TechFlow', 'DataSync', 'GlobalNet', 'Innova Solutions', 'NextGen IT', 'CloudBase',
  'Alpha Dynamics', 'Beta Systems', 'Nova Labs', 'Quantum Reach', 'Vertex Digital', 'Brightline Media',
  'Sunrise Analytics', 'Northwind Software', 'Pixel Forge', 'Orbit Commerce', 'Silverline Group',
  'Meridian Labs', 'Evergreen Tech', 'BluePeak Systems', 'Skyline Ventures', 'Forge & Co', 'Lumen Digital',
  'Cobalt Works',
]
const companyDomains = [
  'acmecorp.io', 'techflow.dev', 'datasync.com', 'globalnet.io', 'innovasolutions.it', 'nextgenit.com',
  'cloudbase.app', 'alphadynamics.io', 'betasystems.com', 'novalabs.dev', 'quantumreach.io',
  'vertexdigital.com', 'brightlinemedia.it', 'sunriseanalytics.com', 'northwindsoftware.io',
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
// "Andamento Iscrizioni" shows a meaningful upward trend rather than noise.

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
// second subscription (upsell/renewal) later on — so "Nuovi Abbonamenti"
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
    'Fattura non ricevuta per questo mese',
    'Richiesta di cambio metodo di pagamento',
    'Importo addebitato non corrisponde al piano',
    'Domanda su upgrade del piano e pro-rata',
    'Richiesta rimborso per doppio addebito',
    'Aggiornamento dati di fatturazione aziendali',
    'Conferma scadenza rinnovo abbonamento',
  ],
  technical: [
    'Errore 500 durante il salvataggio dei contenuti',
    'Problema di sincronizzazione con webhook',
    'Le immagini caricate non vengono visualizzate',
    'API key non funziona dopo la rotazione',
    'Timeout durante l\'import massivo dei dati',
    'Richiesta supporto per integrazione SSO',
    'Bug nella ricerca full-text dei contenuti',
  ],
  sales: [
    'Richiesta demo per piano Enterprise',
    'Informazioni su sconti per rinnovo annuale',
    'Domanda su limiti utenti del piano Pro',
    'Richiesta preventivo per multi-tenant',
    'Interesse per migrazione da altro CMS',
    'Richiesta contratto e fattura proforma',
  ],
}
// Ticket volume grows alongside the customer base ("Ticket nel tempo"), and
// recent tickets are more likely to still be open/in_progress than old ones
// — so "Ticket Aperti" / "Ticket Chiusi" stats reflect a realistic backlog.
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
  { version: 'v1.0.0', daysAgo: 29, features: '<p>Lancio ufficiale della piattaforma con gestione clienti base.</p>' },
  { version: 'v1.1.0', daysAgo: 26, features: '<p>Aggiunti report avanzati e export in CSV.</p>' },
  { version: 'v1.2.0', daysAgo: 23, features: '<p>Integrazione con Slack per notifiche ticket.</p>' },
  { version: 'v1.3.0', daysAgo: 20, features: '<p>Nuovo sistema di tagging per i ticket e filtri avanzati nella dashboard.</p>' },
  { version: 'v1.4.0', daysAgo: 17, features: '<h2>Performance</h2><p>Tempi di risposta delle API ridotti del 40% grazie alla cache edge.</p>' },
  { version: 'v1.5.0', daysAgo: 14, features: '<p>Aggiunto supporto per fatturazione annuale e sconti automatici.</p>' },
  { version: 'v1.6.0', daysAgo: 11, features: '<h2>Novità</h2><p>Dashboard widget personalizzabili e drag-and-drop per i layout.</p>' },
  { version: 'v1.7.0', daysAgo: 8, features: '<p>Nuove notifiche email per ticket ad alta priorità e SLA configurabili.</p>' },
  { version: 'v2.0.0', daysAgo: 5, features: '<h2>Major Update</h2><p>Nuova dashboard amministrativa e API pubbliche.</p>' },
  { version: 'v2.1.0', daysAgo: 3, features: '<p>Miglioramenti alla ricerca full-text e correzione di vari bug minori di sincronizzazione.</p>' },
  { version: 'v2.2.0', daysAgo: 1, features: '<h2>Sicurezza</h2><p>Rotazione automatica delle API key e audit log per le modifiche di sistema.</p>' },
]

const changelog = changelogEntries.map((c, idx) => {
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
    slug: 'come-ridurre-il-churn-rate',
    title: 'Come ridurre il Churn Rate',
    author: 'Luca Rossi',
    cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    body: '<p>Analisi delle migliori strategie per mantenere i clienti SaaS nel 2026: onboarding guidato, check-in proattivi e piani di successo personalizzati.</p>',
    daysAgo: 28,
  },
  {
    slug: 'pricing-saas-freemium-vs-trial',
    title: 'Pricing SaaS: Freemium vs Trial',
    author: 'Anna Bianchi',
    cover_image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80',
    body: '<p>Cosa scegliere per massimizzare la conversion rate e il Customer Lifetime Value: confronto pratico tra modello freemium e trial a tempo.</p>',
    daysAgo: 26,
  },
  {
    slug: 'onboarding-clienti-enterprise',
    title: 'Onboarding clienti enterprise: la nostra checklist',
    author: 'Marco Verdi',
    cover_image: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=800&q=80',
    body: '<p>I passaggi chiave per accompagnare un nuovo cliente enterprise dal contratto al primo valore percepito, riducendo il time-to-value.</p>',
    daysAgo: 23,
  },
  {
    slug: 'metriche-saas-da-monitorare',
    title: '7 metriche SaaS da monitorare ogni settimana',
    author: 'Giulia Ferrari',
    cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    body: '<p>MRR, churn, NRR, CAC, LTV e altro: una guida pratica alle metriche che contano davvero per un business in abbonamento.</p>',
    daysAgo: 20,
  },
  {
    slug: 'automatizzare-il-supporto-clienti',
    title: 'Automatizzare il supporto clienti senza perdere la qualità',
    author: 'Davide Conti',
    cover_image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&q=80',
    body: '<p>Come usare automazioni e categorizzazione automatica dei ticket per ridurre i tempi di risposta mantenendo un\'esperienza cliente eccellente.</p>',
    daysAgo: 18,
  },
  {
    slug: 'guida-rinnovi-abbonamento',
    title: 'Guida ai rinnovi: come ridurre i pagamenti falliti',
    author: 'Elena Mariani',
    cover_image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
    body: '<p>Strategie di dunning, promemoria automatici e retry intelligenti delle carte per ridurre il tasso di payment_status "past_due".</p>',
    daysAgo: 15,
  },
  {
    slug: 'segmentazione-clienti-per-piano',
    title: 'Segmentare i clienti per piano: cosa rivelano i dati',
    author: 'Luca Rossi',
    cover_image: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80',
    body: '<p>Analizzando i clienti per tier (free, pro, enterprise) emergono pattern utili per le strategie di upsell e prevenzione del churn.</p>',
    daysAgo: 12,
  },
  {
    slug: 'casi-studio-clienti-enterprise',
    title: 'Casi studio: come i nostri clienti enterprise scalano',
    author: 'Anna Bianchi',
    cover_image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80',
    body: '<p>Tre storie reali di aziende che hanno aumentato il proprio MRR del 30% in sei mesi grazie a un percorso di adozione guidato.</p>',
    daysAgo: 9,
  },
  {
    slug: 'priorita-ticket-best-practice',
    title: 'Come impostare le priorità dei ticket: best practice',
    author: 'Marco Verdi',
    cover_image: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&q=80',
    body: '<p>Una matrice semplice per assegnare priorità low, medium e high ai ticket in base a impatto e urgenza, con esempi pratici.</p>',
    daysAgo: 6,
  },
  {
    slug: 'roadmap-prodotto-2026',
    title: 'Roadmap prodotto 2026',
    author: 'Giulia Ferrari',
    cover_image: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&q=80',
    body: '<p>Le novità in arrivo: dashboard personalizzabili, nuove integrazioni e miglioramenti alla ricerca full-text.</p>',
    daysAgo: 4,
  },
  {
    slug: 'security-audit-log-novita',
    title: 'Audit log e sicurezza: le novità della v2.2',
    author: 'Davide Conti',
    cover_image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80',
    body: '<p>Con la versione 2.2 introduciamo audit log completi e rotazione automatica delle API key per i clienti enterprise.</p>',
    daysAgo: 2,
  },
  {
    slug: 'analisi-mrr-trend-annuale',
    title: 'Analisi del trend MRR: cosa abbiamo imparato in un anno',
    author: 'Elena Mariani',
    cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    body: '<p>Un anno di crescita del Monthly Recurring Revenue raccontato attraverso i dati: stagionalità, upgrade e impatto del churn.</p>',
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
