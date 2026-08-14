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
const t_c02 = nowSec - 18 * DAY
const t_c03 = nowSec - 12 * DAY
const t_c04 = nowSec - 6 * DAY
const t_c05 = nowSec - 1 * DAY

function toIsoDate(sec: number): string {
  return new Date(sec * 1000).toISOString().split('T')[0]
}

function toRichtextDoc(text: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  }
}

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
    },
  },
  {
    id: 'c0200000-0000-4000-8000-000000000002',
    slug: 'david-ferrari',
    status: 'published',
    data: {
      name: 'David Ferrari',
      email: 'david.ferrari@innovasolutions.io',
      company: 'Innova Solutions',
      tier: 'pro',
      account_status: 'active',
      mrr: 144,
    },
  },
  {
    id: 'c0300000-0000-4000-8000-000000000003',
    slug: 'philip-lombardi',
    status: 'published',
    data: {
      name: 'Philip Lombardi',
      email: 'philip.lombardi@novalabs.dev',
      company: 'Nova Labs',
      tier: 'free',
      account_status: 'churned',
      mrr: 0,
    },
  },
  {
    id: 'c0400000-0000-4000-8000-000000000004',
    slug: 'sarah-gallo',
    status: 'published',
    data: {
      name: 'Sarah Gallo',
      email: 'sarah.gallo@alphadynamics.io',
      company: 'Alpha Dynamics',
      tier: 'enterprise',
      account_status: 'active',
      mrr: 1250,
    },
  },
  {
    id: 'c0500000-0000-4000-8000-000000000005',
    slug: 'matthew-conti',
    status: 'published',
    data: {
      name: 'Matthew Conti',
      email: 'matthew.conti@cloudbase.app',
      company: 'CloudBase',
      tier: 'free',
      account_status: 'active',
      mrr: 0,
    },
  },
]

export const DEMO_ABBONAMENTI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'a0100000-0000-4000-8000-000000000001',
    slug: 'subscription-vertex-digital',
    status: 'published',
    data: {
      customer_id: 'c0100000-0000-4000-8000-000000000001',
      amount: 160,
      billing_cycle: 'monthly',
      payment_status: 'active',
    },
  },
  {
    id: 'a0200000-0000-4000-8000-000000000002',
    slug: 'subscription-innova-solutions',
    status: 'published',
    data: {
      customer_id: 'c0200000-0000-4000-8000-000000000002',
      amount: 144,
      billing_cycle: 'monthly',
      payment_status: 'active',
    },
  },
  {
    id: 'a0300000-0000-4000-8000-000000000003',
    slug: 'subscription-alpha-dynamics',
    status: 'published',
    data: {
      customer_id: 'c0400000-0000-4000-8000-000000000004',
      amount: 1250,
      billing_cycle: 'annual',
      payment_status: 'active',
    },
  },
]

export const DEMO_TICKET_FIXTURES: DemoEntryFixture[] = [
  {
    id: 't0100000-0000-4000-8000-000000000001',
    slug: 'webhook-integration-failure',
    status: 'published',
    data: {
      title: 'Webhook integration failure on invoice.paid event',
      customer_id: 'c0100000-0000-4000-8000-000000000001',
      priority: 'high',
      category: 'technical',
      ticket_status: 'open',
    },
  },
  {
    id: 't0200000-0000-4000-8000-000000000002',
    slug: 'annual-billing-vat-invoicing',
    status: 'published',
    data: {
      title: 'Annual billing VAT invoice code update request',
      customer_id: 'c0400000-0000-4000-8000-000000000004',
      priority: 'medium',
      category: 'billing',
      ticket_status: 'in_progress',
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
      release_date: toIsoDate(nowSec - 22 * DAY),
      features: toRichtextDoc('Introduced 4-tier native privacy support, AES-256-GCM encryption, and Blind Indexing for secure search.'),
    },
  },
  {
    id: 'ch200000-0000-4000-8000-000000000002',
    slug: 'v2-3-0-kanban-automation-engine',
    status: 'published',
    data: {
      version: 'v2.3.0',
      release_date: toIsoDate(nowSec - 8 * DAY),
      features: toRichtextDoc('Added advanced automation engine and dynamic Kanban card positioning.'),
    },
  },
]

export const DEMO_ARTICOLI_FIXTURES: DemoEntryFixture[] = [
  {
    id: 'ar100000-0000-4000-8000-000000000001',
    slug: 'guide-to-application-level-encryption',
    status: 'published',
    data: {
      title: 'Guide to Application-Level Encryption in BeechCMS',
      author: 'Flavio De Musso',
      cover_image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71.jpg?w=800&q=80',
      body: toRichtextDoc('Learn how to protect confidential customer data directly inside the engine without sacrificing Cloudflare Workers edge performance.'),
    },
  },
  {
    id: 'ar200000-0000-4000-8000-000000000002',
    slug: 'botanical-engine-and-cloudflare-d1',
    status: 'published',
    data: {
      title: 'Botanical Engine Architecture & Cloudflare D1',
      author: 'Beech Core Team',
      cover_image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f.jpg?w=800&q=80',
      body: toRichtextDoc('An in-depth overview of the separation between @beechcms/core domain contracts and edge SQLite persistence.'),
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
