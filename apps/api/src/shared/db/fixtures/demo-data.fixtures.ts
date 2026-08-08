// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

export interface DemoEntryFixture {
  id: string
  slug: string
  status: string
  data: Record<string, unknown>
}

const nowSec = Math.floor(Date.now() / 1000)
const DAY = 86400

const t_c01 = nowSec - 25 * DAY
const t_c02 = nowSec - 20 * DAY
const t_c03 = nowSec - 15 * DAY
const t_c04 = nowSec - 10 * DAY
const t_c05 = nowSec - 3 * DAY

export const DEMO_CLIENTI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'c0100000-0000-4000-8000-000000000001',
    slug: 'elisa-colombo',
    status: 'published',
    data: {
      name: 'Elisa Colombo',
      email: 'elisa.colombo@vertexdigital.com',
      company: 'Vertex Digital',
      tier: 'pro',
      account_status: 'active',
      mrr: 160,
      created_at: t_c01,
      updated_at: t_c01,
    },
  },
  {
    id: 'c0200000-0000-4000-8000-000000000002',
    slug: 'davide-ferrari',
    status: 'published',
    data: {
      name: 'Davide Ferrari',
      email: 'davide.ferrari@innovasolutions.it',
      company: 'Innova Solutions',
      tier: 'pro',
      account_status: 'active',
      mrr: 144,
      created_at: t_c02,
      updated_at: t_c02,
    },
  },
  {
    id: 'c0300000-0000-4000-8000-000000000003',
    slug: 'filippo-lombardi',
    status: 'published',
    data: {
      name: 'Filippo Lombardi',
      email: 'filippo.lombardi@novalabs.dev',
      company: 'Nova Labs',
      tier: 'free',
      account_status: 'churned',
      mrr: 0,
      created_at: t_c03,
      updated_at: t_c03,
    },
  },
  {
    id: 'c0400000-0000-4000-8000-000000000004',
    slug: 'elisa-gallo',
    status: 'published',
    data: {
      name: 'Elisa Gallo',
      email: 'elisa.gallo@alphadynamics.io',
      company: 'Alpha Dynamics',
      tier: 'enterprise',
      account_status: 'active',
      mrr: 1250,
      created_at: t_c04,
      updated_at: t_c04,
    },
  },
  {
    id: 'c0500000-0000-4000-8000-000000000005',
    slug: 'matteo-conti',
    status: 'published',
    data: {
      name: 'Matteo Conti',
      email: 'matteo.conti@cloudbase.app',
      company: 'CloudBase',
      tier: 'free',
      account_status: 'active',
      mrr: 0,
      created_at: t_c05,
      updated_at: t_c05,
    },
  },
]

export const DEMO_ABBONAMENTI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'a0100000-0000-4000-8000-000000000001',
    slug: 'abbonamento-vertex-digital',
    status: 'published',
    data: {
      customer_id: 'c0100000-0000-4000-8000-000000000001',
      amount: 160,
      billing_cycle: 'monthly',
      payment_status: 'active',
      created_at: t_c01 + 3600,
      updated_at: t_c01 + 3600,
    },
  },
  {
    id: 'a0200000-0000-4000-8000-000000000002',
    slug: 'abbonamento-innova-solutions',
    status: 'published',
    data: {
      customer_id: 'c0200000-0000-4000-8000-000000000002',
      amount: 144,
      billing_cycle: 'monthly',
      payment_status: 'active',
      created_at: t_c02 + 7200,
      updated_at: t_c02 + 7200,
    },
  },
  {
    id: 'a0300000-0000-4000-8000-000000000003',
    slug: 'abbonamento-alpha-dynamics',
    status: 'published',
    data: {
      customer_id: 'c0400000-0000-4000-8000-000000000004',
      amount: 1250,
      billing_cycle: 'annual',
      payment_status: 'active',
      created_at: t_c04 + 1800,
      updated_at: t_c04 + 1800,
    },
  },
]

export const DEMO_TICKET_FIXTURES: DemoEntryFixture[] = [
  {
    id: 't0100000-0000-4000-8000-000000000001',
    slug: 'integrazione-webhook-fallita',
    status: 'published',
    data: {
      title: 'Integrazione webhook fallita su eventi invoice.paid',
      customer_id: 'c0100000-0000-4000-8000-000000000001',
      priority: 'high',
      category: 'technical',
      ticket_status: 'open',
      created_at: t_c01 + 2 * DAY,
      updated_at: t_c01 + 2 * DAY,
    },
  },
  {
    id: 't0200000-0000-4000-8000-000000000002',
    slug: 'richiesta-fattura-elettronica',
    status: 'published',
    data: {
      title: 'Richiesta variazione codice SDI per fatturazione annuale',
      customer_id: 'c0400000-0000-4000-8000-000000000004',
      priority: 'medium',
      category: 'billing',
      ticket_status: 'in_progress',
      created_at: t_c04 + 1 * DAY,
      updated_at: t_c04 + 1 * DAY,
    },
  },
]

export const DEMO_CHANGELOG_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'ch100000-0000-4000-8000-000000000001',
    slug: 'v2-4-0-context-aware-privacy',
    status: 'published',
    data: {
      version: 'v2.4.0',
      release_date: nowSec - 22 * DAY,
      features: '<p>Introdotto il supporto per la privacy nativa a 4 livelli, cifratura AES-256-GCM e Blind Indexing per la ricerca sicura.</p>',
      created_at: nowSec - 22 * DAY,
      updated_at: nowSec - 22 * DAY,
    },
  },
  {
    id: 'ch200000-0000-4000-8000-000000000002',
    slug: 'v2-3-0-kanban-automation-engine',
    status: 'published',
    data: {
      version: 'v2.3.0',
      release_date: nowSec - 8 * DAY,
      features: '<p>Aggiunto l engine di automazioni avanzate e il posizionamento dinamico delle schede Kanban.</p>',
      created_at: nowSec - 8 * DAY,
      updated_at: nowSec - 8 * DAY,
    },
  },
]

export const DEMO_ARTICOLI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'ar100000-0000-4000-8000-000000000001',
    slug: 'guida-alla-privacy-application-level-encryption',
    status: 'published',
    data: {
      title: 'Guida all Application-Level Encryption in BeechCMS',
      author: 'Flavio De Musso',
      cover_image: '/media/demo/privacy-banner.jpg',
      body: '<p>Scopri come proteggere i dati riservati dei tuoi clienti direttamente nell engine senza sacrificare le performance edge di Cloudflare Workers.</p>',
      created_at: nowSec - 24 * DAY,
      updated_at: nowSec - 24 * DAY,
    },
  },
  {
    id: 'ar200000-0000-4000-8000-000000000002',
    slug: 'architettura-botanical-engine-e-d1',
    status: 'published',
    data: {
      title: 'Architettura Botanical Engine & Cloudflare D1',
      author: 'Beech Core Team',
      cover_image: '/media/demo/architecture-banner.jpg',
      body: '<p>Una panoramica approfondita sulla separazione tra i contratti di dominio di @beechcms/core e la persistenza SQLite edge.</p>',
      created_at: nowSec - 10 * DAY,
      updated_at: nowSec - 10 * DAY,
    },
  },
]

export const DEMO_FIXTURES_BY_SEED_SLUG: Record<string, DemoEntryFixture[]> = {
  clienti: DEMO_CLIENTI_FIXTURES,
  abbonamenti: DEMO_ABBONAMENTI_FIXTURES,
  ticket: DEMO_TICKET_FIXTURES,
  changelog: DEMO_CHANGELOG_FIXTURES,
  articoli: DEMO_ARTICOLI_FIXTURES,
}
