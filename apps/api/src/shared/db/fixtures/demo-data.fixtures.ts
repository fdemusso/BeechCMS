// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.

export interface DemoEntryFixture {
  id: string
  slug: string
  status: string
  data: Record<string, unknown>
}

export const DEMO_CLIENTI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'c_01',
    slug: 'elisa-colombo',
    status: 'published',
    data: {
      name: 'Elisa Colombo',
      email: 'elisa.colombo@vertexdigital.com',
      company: 'Vertex Digital',
      tier: 'pro',
      account_status: 'active',
      mrr: 160,
    },
  },
  {
    id: 'c_02',
    slug: 'davide-ferrari',
    status: 'published',
    data: {
      name: 'Davide Ferrari',
      email: 'davide.ferrari@innovasolutions.it',
      company: 'Innova Solutions',
      tier: 'pro',
      account_status: 'active',
      mrr: 144,
    },
  },
  {
    id: 'c_03',
    slug: 'filippo-lombardi',
    status: 'published',
    data: {
      name: 'Filippo Lombardi',
      email: 'filippo.lombardi@novalabs.dev',
      company: 'Nova Labs',
      tier: 'free',
      account_status: 'churned',
      mrr: 0,
    },
  },
  {
    id: 'c_04',
    slug: 'elisa-gallo',
    status: 'published',
    data: {
      name: 'Elisa Gallo',
      email: 'elisa.gallo@alphadynamics.io',
      company: 'Alpha Dynamics',
      tier: 'enterprise',
      account_status: 'active',
      mrr: 1250,
    },
  },
  {
    id: 'c_05',
    slug: 'matteo-conti',
    status: 'published',
    data: {
      name: 'Matteo Conti',
      email: 'matteo.conti@cloudbase.app',
      company: 'CloudBase',
      tier: 'free',
      account_status: 'active',
      mrr: 0,
    },
  },
]

export const DEMO_ABBONAMENTI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'abb_01',
    slug: 'abbonamento-vertex-digital',
    status: 'published',
    data: {
      customer_id: 'c_01',
      amount: 160,
      billing_cycle: 'monthly',
      payment_status: 'active',
    },
  },
  {
    id: 'abb_02',
    slug: 'abbonamento-innova-solutions',
    status: 'published',
    data: {
      customer_id: 'c_02',
      amount: 144,
      billing_cycle: 'monthly',
      payment_status: 'active',
    },
  },
  {
    id: 'abb_03',
    slug: 'abbonamento-alpha-dynamics',
    status: 'published',
    data: {
      customer_id: 'c_04',
      amount: 1250,
      billing_cycle: 'annual',
      payment_status: 'active',
    },
  },
]

export const DEMO_TICKET_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'tkt_01',
    slug: 'integrazione-webhook-fallita',
    status: 'published',
    data: {
      title: 'Integrazione webhook fallita su eventi invoice.paid',
      customer_id: 'c_01',
      priority: 'high',
      category: 'technical',
      ticket_status: 'open',
    },
  },
  {
    id: 'tkt_02',
    slug: 'richiesta-fattura-elettronica',
    status: 'published',
    data: {
      title: 'Richiesta variazione codice SDI per fatturazione annuale',
      customer_id: 'c_04',
      priority: 'medium',
      category: 'billing',
      ticket_status: 'in_progress',
    },
  },
]

export const DEMO_CHANGELOG_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'ch_01',
    slug: 'v2-4-0-context-aware-privacy',
    status: 'published',
    data: {
      version: 'v2.4.0',
      release_date: '2026-08-01',
      features: '<p>Introdotto il supporto per la privacy nativa a 4 livelli, cifratura AES-256-GCM e Blind Indexing per la ricerca sicura.</p>',
    },
  },
  {
    id: 'ch_02',
    slug: 'v2-3-0-kanban-automation-engine',
    status: 'published',
    data: {
      version: 'v2.3.0',
      release_date: '2026-07-15',
      features: '<p>Aggiunto l engine di automazioni avanzate e il posizionamento dinamico delle schede Kanban.</p>',
    },
  },
]

export const DEMO_ARTICOLI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'art_01',
    slug: 'guida-alla-privacy-application-level-encryption',
    status: 'published',
    data: {
      title: 'Guida all Application-Level Encryption in BeechCMS',
      author: 'Flavio De Musso',
      cover_image: '/media/demo/privacy-banner.jpg',
      body: '<p>Scopri come proteggere i dati riservati dei tuoi clienti direttamente nell engine senza sacrificare le performance edge di Cloudflare Workers.</p>',
    },
  },
  {
    id: 'art_02',
    slug: 'architettura-botanical-engine-e-d1',
    status: 'published',
    data: {
      title: 'Architettura Botanical Engine & Cloudflare D1',
      author: 'Beech Core Team',
      cover_image: '/media/demo/architecture-banner.jpg',
      body: '<p>Una panoramica approfondita sulla separazione tra i contratti di dominio di @beechcms/core e la persistenza SQLite edge.</p>',
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
