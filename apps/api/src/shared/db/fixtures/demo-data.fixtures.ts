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
      tier: ['pro'],
      account_status: ['active'],
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
      tier: ['pro'],
      account_status: ['active'],
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
      tier: ['free'],
      account_status: ['churned'],
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
      tier: ['enterprise'],
      account_status: ['active'],
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
      tier: ['free'],
      account_status: ['active'],
      mrr: 0,
    },
  },
  {
    id: 'c0600000-0000-4000-8000-000000000006',
    slug: 'giulia-romano',
    status: 'published',
    data: {
      name: 'Giulia Romano',
      email: 'giulia.romano@orbitsystems.io',
      company: 'Orbit Systems',
      tier: ['pro'],
      account_status: ['active'],
      mrr: 120,
    },
  },
  {
    id: 'c0700000-0000-4000-8000-000000000007',
    slug: 'marco-bianchi',
    status: 'published',
    data: {
      name: 'Marco Bianchi',
      email: 'marco.bianchi@helixanalytics.com',
      company: 'Helix Analytics',
      tier: ['enterprise'],
      account_status: ['active'],
      mrr: 1800,
    },
  },
  {
    id: 'c0800000-0000-4000-8000-000000000008',
    slug: 'chiara-greco',
    status: 'published',
    data: {
      name: 'Chiara Greco',
      email: 'chiara.greco@brightwave.app',
      company: 'Brightwave',
      tier: ['pro'],
      account_status: ['active'],
      mrr: 98,
    },
  },
  {
    id: 'c0900000-0000-4000-8000-000000000009',
    slug: 'luca-marino',
    status: 'published',
    data: {
      name: 'Luca Marino',
      email: 'luca.marino@pixelforge.dev',
      company: 'Pixel Forge',
      tier: ['free'],
      account_status: ['active'],
      mrr: 0,
    },
  },
  {
    id: 'c1000000-0000-4000-8000-000000000010',
    slug: 'francesca-rizzo',
    status: 'published',
    data: {
      name: 'Francesca Rizzo',
      email: 'francesca.rizzo@northwindretail.com',
      company: 'Northwind Retail',
      tier: ['enterprise'],
      account_status: ['active'],
      mrr: 2150,
    },
  },
  {
    id: 'c1100000-0000-4000-8000-000000000011',
    slug: 'andrea-costa',
    status: 'published',
    data: {
      name: 'Andrea Costa',
      email: 'andrea.costa@lumenhealth.io',
      company: 'Lumen Health',
      tier: ['pro'],
      account_status: ['churned'],
      mrr: 0,
    },
  },
  {
    id: 'c1200000-0000-4000-8000-000000000012',
    slug: 'valentina-fontana',
    status: 'published',
    data: {
      name: 'Valentina Fontana',
      email: 'valentina.fontana@quantumleap.dev',
      company: 'Quantum Leap',
      tier: ['pro'],
      account_status: ['active'],
      mrr: 175,
    },
  },
  {
    id: 'c1300000-0000-4000-8000-000000000013',
    slug: 'simone-esposito',
    status: 'published',
    data: {
      name: 'Simone Esposito',
      email: 'simone.esposito@stratoscloud.io',
      company: 'Stratos Cloud',
      tier: ['enterprise'],
      account_status: ['active'],
      mrr: 1520,
    },
  },
  {
    id: 'c1400000-0000-4000-8000-000000000014',
    slug: 'martina-ricci',
    status: 'published',
    data: {
      name: 'Martina Ricci',
      email: 'martina.ricci@evergreenfoods.com',
      company: 'Evergreen Foods',
      tier: ['free'],
      account_status: ['active'],
      mrr: 0,
    },
  },
  {
    id: 'c1500000-0000-4000-8000-000000000015',
    slug: 'davide-moretti',
    status: 'published',
    data: {
      name: 'Davide Moretti',
      email: 'davide.moretti@blueharbor.app',
      company: 'Blue Harbor',
      tier: ['pro'],
      account_status: ['active'],
      mrr: 110,
    },
  },
  {
    id: 'c1600000-0000-4000-8000-000000000016',
    slug: 'elena-barbieri',
    status: 'published',
    data: {
      name: 'Elena Barbieri',
      email: 'elena.barbieri@meridianlabs.dev',
      company: 'Meridian Labs',
      tier: ['free'],
      account_status: ['churned'],
      mrr: 0,
    },
  },
  {
    id: 'c1700000-0000-4000-8000-000000000017',
    slug: 'federico-leone',
    status: 'published',
    data: {
      name: 'Federico Leone',
      email: 'federico.leone@apexlogistics.com',
      company: 'Apex Logistics',
      tier: ['enterprise'],
      account_status: ['active'],
      mrr: 2480,
    },
  },
  {
    id: 'c1800000-0000-4000-8000-000000000018',
    slug: 'sofia-gentile',
    status: 'published',
    data: {
      name: 'Sofia Gentile',
      email: 'sofia.gentile@cobaltstudio.io',
      company: 'Cobalt Studio',
      tier: ['pro'],
      account_status: ['active'],
      mrr: 132,
    },
  },
  {
    id: 'c1900000-0000-4000-8000-000000000019',
    slug: 'matteo-serra',
    status: 'published',
    data: {
      name: 'Matteo Serra',
      email: 'matteo.serra@redwoodcapital.com',
      company: 'Redwood Capital',
      tier: ['enterprise'],
      account_status: ['churned'],
      mrr: 0,
    },
  },
  {
    id: 'c2000000-0000-4000-8000-000000000020',
    slug: 'alice-vitale',
    status: 'published',
    data: {
      name: 'Alice Vitale',
      email: 'alice.vitale@skylinemedia.app',
      company: 'Skyline Media',
      tier: ['pro'],
      account_status: ['active'],
      mrr: 156,
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
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a0200000-0000-4000-8000-000000000002',
    slug: 'subscription-innova-solutions',
    status: 'published',
    data: {
      customer_id: 'c0200000-0000-4000-8000-000000000002',
      amount: 144,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a0300000-0000-4000-8000-000000000003',
    slug: 'subscription-nova-labs',
    status: 'published',
    data: {
      customer_id: 'c0300000-0000-4000-8000-000000000003',
      amount: 0,
      billing_cycle: ['monthly'],
      payment_status: ['canceled'],
    },
  },
  {
    id: 'a0400000-0000-4000-8000-000000000004',
    slug: 'subscription-alpha-dynamics',
    status: 'published',
    data: {
      customer_id: 'c0400000-0000-4000-8000-000000000004',
      amount: 1250,
      billing_cycle: ['annual'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a0500000-0000-4000-8000-000000000005',
    slug: 'subscription-cloudbase',
    status: 'published',
    data: {
      customer_id: 'c0500000-0000-4000-8000-000000000005',
      amount: 0,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a0600000-0000-4000-8000-000000000006',
    slug: 'subscription-orbit-systems',
    status: 'published',
    data: {
      customer_id: 'c0600000-0000-4000-8000-000000000006',
      amount: 120,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a0700000-0000-4000-8000-000000000007',
    slug: 'subscription-helix-analytics',
    status: 'published',
    data: {
      customer_id: 'c0700000-0000-4000-8000-000000000007',
      amount: 21600,
      billing_cycle: ['annual'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a0800000-0000-4000-8000-000000000008',
    slug: 'subscription-brightwave',
    status: 'published',
    data: {
      customer_id: 'c0800000-0000-4000-8000-000000000008',
      amount: 98,
      billing_cycle: ['monthly'],
      payment_status: ['past_due'],
    },
  },
  {
    id: 'a0900000-0000-4000-8000-000000000009',
    slug: 'subscription-pixel-forge',
    status: 'published',
    data: {
      customer_id: 'c0900000-0000-4000-8000-000000000009',
      amount: 0,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a1000000-0000-4000-8000-000000000010',
    slug: 'subscription-northwind-retail',
    status: 'published',
    data: {
      customer_id: 'c1000000-0000-4000-8000-000000000010',
      amount: 2150,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a1100000-0000-4000-8000-000000000011',
    slug: 'subscription-lumen-health',
    status: 'published',
    data: {
      customer_id: 'c1100000-0000-4000-8000-000000000011',
      amount: 0,
      billing_cycle: ['monthly'],
      payment_status: ['canceled'],
    },
  },
  {
    id: 'a1200000-0000-4000-8000-000000000012',
    slug: 'subscription-quantum-leap',
    status: 'published',
    data: {
      customer_id: 'c1200000-0000-4000-8000-000000000012',
      amount: 175,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a1300000-0000-4000-8000-000000000013',
    slug: 'subscription-stratos-cloud',
    status: 'published',
    data: {
      customer_id: 'c1300000-0000-4000-8000-000000000013',
      amount: 18240,
      billing_cycle: ['annual'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a1400000-0000-4000-8000-000000000014',
    slug: 'subscription-evergreen-foods',
    status: 'published',
    data: {
      customer_id: 'c1400000-0000-4000-8000-000000000014',
      amount: 0,
      billing_cycle: ['monthly'],
      payment_status: ['past_due'],
    },
  },
  {
    id: 'a1500000-0000-4000-8000-000000000015',
    slug: 'subscription-blue-harbor',
    status: 'published',
    data: {
      customer_id: 'c1500000-0000-4000-8000-000000000015',
      amount: 110,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a1600000-0000-4000-8000-000000000016',
    slug: 'subscription-meridian-labs',
    status: 'published',
    data: {
      customer_id: 'c1600000-0000-4000-8000-000000000016',
      amount: 0,
      billing_cycle: ['monthly'],
      payment_status: ['canceled'],
    },
  },
  {
    id: 'a1700000-0000-4000-8000-000000000017',
    slug: 'subscription-apex-logistics',
    status: 'published',
    data: {
      customer_id: 'c1700000-0000-4000-8000-000000000017',
      amount: 29760,
      billing_cycle: ['annual'],
      payment_status: ['active'],
    },
  },
  {
    id: 'a1800000-0000-4000-8000-000000000018',
    slug: 'subscription-cobalt-studio',
    status: 'published',
    data: {
      customer_id: 'c1800000-0000-4000-8000-000000000018',
      amount: 132,
      billing_cycle: ['monthly'],
      payment_status: ['past_due'],
    },
  },
  {
    id: 'a1900000-0000-4000-8000-000000000019',
    slug: 'subscription-redwood-capital',
    status: 'published',
    data: {
      customer_id: 'c1900000-0000-4000-8000-000000000019',
      amount: 0,
      billing_cycle: ['annual'],
      payment_status: ['canceled'],
    },
  },
  {
    id: 'a2000000-0000-4000-8000-000000000020',
    slug: 'subscription-skyline-media',
    status: 'published',
    data: {
      customer_id: 'c2000000-0000-4000-8000-000000000020',
      amount: 156,
      billing_cycle: ['monthly'],
      payment_status: ['active'],
    },
  },
]

export const DEMO_TICKET_FIXTURES: DemoEntryFixture[] = [
  {
    id: 't0100000-0000-4000-8000-000000000001',
    slug: 'webhook-integration-failure-on-invoice-paid-event',
    status: 'published',
    data: {
      title: 'Webhook integration failure on invoice.paid event',
      customer_id: 'c0100000-0000-4000-8000-000000000001',
      priority: ['high'],
      category: ['technical'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't0200000-0000-4000-8000-000000000002',
    slug: 'annual-billing-vat-invoice-code-update-request',
    status: 'published',
    data: {
      title: 'Annual billing VAT invoice code update request',
      customer_id: 'c0400000-0000-4000-8000-000000000004',
      priority: ['medium'],
      category: ['billing'],
      ticket_status: ['in_progress'],
    },
  },
  {
    id: 't0300000-0000-4000-8000-000000000003',
    slug: 'cannot-reset-two-factor-authentication',
    status: 'published',
    data: {
      title: 'Cannot reset two-factor authentication',
      customer_id: 'c0600000-0000-4000-8000-000000000006',
      priority: ['high'],
      category: ['technical'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't0400000-0000-4000-8000-000000000004',
    slug: 'upgrade-request-from-pro-to-enterprise',
    status: 'published',
    data: {
      title: 'Upgrade request from Pro to Enterprise',
      customer_id: 'c0800000-0000-4000-8000-000000000008',
      priority: ['low'],
      category: ['sales'],
      ticket_status: ['in_progress'],
    },
  },
  {
    id: 't0500000-0000-4000-8000-000000000005',
    slug: 'invoice-shows-wrong-billing-address',
    status: 'published',
    data: {
      title: 'Invoice shows wrong billing address',
      customer_id: 'c0700000-0000-4000-8000-000000000007',
      priority: ['medium'],
      category: ['billing'],
      ticket_status: ['closed'],
    },
  },
  {
    id: 't0600000-0000-4000-8000-000000000006',
    slug: 'api-rate-limit-exceeded-on-bulk-import',
    status: 'published',
    data: {
      title: 'API rate limit exceeded on bulk import',
      customer_id: 'c1000000-0000-4000-8000-000000000010',
      priority: ['high'],
      category: ['technical'],
      ticket_status: ['in_progress'],
    },
  },
  {
    id: 't0700000-0000-4000-8000-000000000007',
    slug: 'request-for-custom-sla-terms',
    status: 'published',
    data: {
      title: 'Request for custom SLA terms',
      customer_id: 'c1700000-0000-4000-8000-000000000017',
      priority: ['medium'],
      category: ['sales'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't0800000-0000-4000-8000-000000000008',
    slug: 'refund-for-duplicated-charge',
    status: 'published',
    data: {
      title: 'Refund for duplicated charge',
      customer_id: 'c1200000-0000-4000-8000-000000000012',
      priority: ['high'],
      category: ['billing'],
      ticket_status: ['closed'],
    },
  },
  {
    id: 't0900000-0000-4000-8000-000000000009',
    slug: 'dashboard-widget-not-loading-data',
    status: 'published',
    data: {
      title: 'Dashboard widget not loading data',
      customer_id: 'c1300000-0000-4000-8000-000000000013',
      priority: ['low'],
      category: ['technical'],
      ticket_status: ['closed'],
    },
  },
  {
    id: 't1000000-0000-4000-8000-000000000010',
    slug: 'question-about-seat-pricing-for-new-team',
    status: 'published',
    data: {
      title: 'Question about seat pricing for new team',
      customer_id: 'c1500000-0000-4000-8000-000000000015',
      priority: ['low'],
      category: ['sales'],
      ticket_status: ['closed'],
    },
  },
  {
    id: 't1100000-0000-4000-8000-000000000011',
    slug: 'sso-login-redirect-loop',
    status: 'published',
    data: {
      title: 'SSO login redirect loop',
      customer_id: 'c0700000-0000-4000-8000-000000000007',
      priority: ['high'],
      category: ['technical'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't1200000-0000-4000-8000-000000000012',
    slug: 'update-payment-method-before-renewal',
    status: 'published',
    data: {
      title: 'Update payment method before renewal',
      customer_id: 'c1400000-0000-4000-8000-000000000014',
      priority: ['medium'],
      category: ['billing'],
      ticket_status: ['in_progress'],
    },
  },
  {
    id: 't1300000-0000-4000-8000-000000000013',
    slug: 'exported-csv-missing-localized-columns',
    status: 'published',
    data: {
      title: 'Exported CSV missing localized columns',
      customer_id: 'c0200000-0000-4000-8000-000000000002',
      priority: ['low'],
      category: ['technical'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't1400000-0000-4000-8000-000000000014',
    slug: 'enterprise-onboarding-call-scheduling',
    status: 'published',
    data: {
      title: 'Enterprise onboarding call scheduling',
      customer_id: 'c1000000-0000-4000-8000-000000000010',
      priority: ['medium'],
      category: ['sales'],
      ticket_status: ['in_progress'],
    },
  },
  {
    id: 't1500000-0000-4000-8000-000000000015',
    slug: 'past-due-notice-received-by-mistake',
    status: 'published',
    data: {
      title: 'Past due notice received by mistake',
      customer_id: 'c1800000-0000-4000-8000-000000000018',
      priority: ['medium'],
      category: ['billing'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't1600000-0000-4000-8000-000000000016',
    slug: 'media-upload-fails-above-4-mb',
    status: 'published',
    data: {
      title: 'Media upload fails above 4 MB',
      customer_id: 'c2000000-0000-4000-8000-000000000020',
      priority: ['high'],
      category: ['technical'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't1700000-0000-4000-8000-000000000017',
    slug: 'need-a-quote-for-additional-storage',
    status: 'published',
    data: {
      title: 'Need a quote for additional storage',
      customer_id: 'c1700000-0000-4000-8000-000000000017',
      priority: ['low'],
      category: ['sales'],
      ticket_status: ['open'],
    },
  },
  {
    id: 't1800000-0000-4000-8000-000000000018',
    slug: 'tax-id-missing-on-last-invoice',
    status: 'published',
    data: {
      title: 'Tax ID missing on last invoice',
      customer_id: 'c1300000-0000-4000-8000-000000000013',
      priority: ['low'],
      category: ['billing'],
      ticket_status: ['closed'],
    },
  },
  {
    id: 't1900000-0000-4000-8000-000000000019',
    slug: 'webhook-signature-validation-question',
    status: 'published',
    data: {
      title: 'Webhook signature validation question',
      customer_id: 'c0600000-0000-4000-8000-000000000006',
      priority: ['medium'],
      category: ['technical'],
      ticket_status: ['closed'],
    },
  },
  {
    id: 't2000000-0000-4000-8000-000000000020',
    slug: 'downgrade-to-free-plan-data-retention-policy',
    status: 'published',
    data: {
      title: 'Downgrade to free plan, data retention policy',
      customer_id: 'c1100000-0000-4000-8000-000000000011',
      priority: ['low'],
      category: ['sales'],
      ticket_status: ['closed'],
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
