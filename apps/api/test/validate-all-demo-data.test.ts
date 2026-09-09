// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest'
import { defineSeed, validateAndSanitizeSeedPayload, SystemIdGenerator } from '@beechcms/core'
import { DEMO_FIXTURES_BY_SEED_SLUG } from '../src/shared/db/fixtures/demo-data.fixtures'

const clienti = defineSeed({
  slug: 'clienti',
  label: 'Customer',
  labelPlural: 'Customers',
  displayNameAlias: 'name',
  dashboard: { icon: 'Users', group: 'SaaS Platform', order: 1, views: ['table', 'kanban', 'gallery'] },
  allowPublicRead: false,
  allowDrafts: false,
  branches: [
    { id: 'br_c1', alias: 'name', label: 'Company / Contact Name', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_c2', alias: 'email', label: 'Contact Email', type: 'text', requiredOnCreate: true, requiredOnUpdate: true, policies: { classification: 'confidential' } },
    { id: 'br_c3', alias: 'company', label: 'Company', type: 'text' },
    {
      id: 'br_c4',
      alias: 'tier',
      label: 'Plan',
      type: 'text',
      options: ['free', 'pro', 'enterprise'],
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
    {
      id: 'br_c5',
      alias: 'account_status',
      label: 'Account Status',
      type: 'text',
      options: ['active', 'churned'],
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
    { id: 'br_c6', alias: 'mrr', label: 'MRR (€)', type: 'number', numberOptions: { format: 'currency', currency: 'EUR' }, policies: { classification: 'internal' } },
  ],
})

const abbonamenti = defineSeed({
  slug: 'abbonamenti',
  label: 'Subscription',
  labelPlural: 'Subscriptions',
  displayNameAlias: 'customer_id',
  dashboard: { icon: 'CreditCard', group: 'SaaS Platform', order: 2, views: ['table', 'kanban', 'gallery'] },
  allowDrafts: false,
  branches: [
    {
      id: 'br_a1',
      alias: 'customer_id',
      label: 'Customer',
      type: 'relation',
      targetSeed: 'clienti',
      onDelete: 'SET NULL',
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
    { id: 'br_a2', alias: 'amount', label: 'Amount', type: 'number', numberOptions: { format: 'currency', currency: 'EUR' }, requiredOnCreate: true, requiredOnUpdate: true },
    {
      id: 'br_a3',
      alias: 'billing_cycle',
      label: 'Billing Cycle',
      type: 'text',
      options: ['monthly', 'annual'],
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
    {
      id: 'br_a4',
      alias: 'payment_status',
      label: 'Payment Status',
      type: 'text',
      options: ['active', 'past_due', 'canceled'],
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
  ],
})

const ticket = defineSeed({
  slug: 'ticket',
  label: 'Support Ticket',
  labelPlural: 'Support Tickets',
  displayNameAlias: 'title',
  dashboard: { icon: 'LifeBuoy', group: 'Support', order: 3, views: ['table', 'kanban', 'gallery'] },
  allowDrafts: false,
  branches: [
    { id: 'br_t1', alias: 'title', label: 'Subject', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    {
      id: 'br_t2',
      alias: 'customer_id',
      label: 'Customer',
      type: 'relation',
      targetSeed: 'clienti',
      onDelete: 'SET NULL',
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
    {
      id: 'br_t3',
      alias: 'priority',
      label: 'Priority',
      type: 'text',
      options: ['low', 'medium', 'high'],
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
    {
      id: 'br_t4',
      alias: 'category',
      label: 'Category',
      type: 'text',
      options: ['billing', 'technical', 'sales'],
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
    {
      id: 'br_t5',
      alias: 'ticket_status',
      label: 'Status',
      type: 'text',
      options: ['open', 'in_progress', 'closed'],
      requiredOnCreate: true,
      requiredOnUpdate: true,
    },
  ],
})

const changelog = defineSeed({
  slug: 'changelog',
  label: 'Release Note',
  labelPlural: 'Release Notes',
  displayNameAlias: 'version',
  dashboard: { icon: 'Rocket', group: 'Content', order: 4, views: ['table', 'gallery'] },
  allowDrafts: true,
  branches: [
    { id: 'br_ch1', alias: 'version', label: 'Version', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_ch2', alias: 'release_date', label: 'Release Date', type: 'date', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_ch3', alias: 'features', label: 'Features', type: 'richtext' },
  ],
})

const articoli = defineSeed({
  slug: 'articoli',
  label: 'Article',
  labelPlural: 'Articles',
  displayNameAlias: 'title',
  dashboard: { icon: 'FileText', group: 'Content', order: 5, views: ['table', 'gallery'] },
  allowDrafts: true,
  allowPublicRead: true,
  branches: [
    { id: 'br_ar1', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_ar2', alias: 'author', label: 'Author', type: 'text' },
    { id: 'br_ar3', alias: 'cover_image', label: 'Cover Image', type: 'file', fileOptions: { accept: 'image' } },
    { id: 'br_ar4', alias: 'body', label: 'Content', type: 'richtext' },
  ],
})

const seedsMap: Record<string, any> = { clienti, abbonamenti, ticket, changelog, articoli }

describe('Demo Fixtures vs Seed Validation Engine', () => {
  it('validates every demo fixture in DEMO_FIXTURES_BY_SEED_SLUG without validation errors', () => {
    for (const [slug, fixtures] of Object.entries(DEMO_FIXTURES_BY_SEED_SLUG)) {
      const seed = seedsMap[slug]
      expect(seed).toBeDefined()

      for (const entry of fixtures) {
        const res = validateAndSanitizeSeedPayload(seed, entry.data, {
          operation: 'create',
          allowNull: true,
          requireAtLeastOneValidField: true,
          enforceRequiredFields: true,
          idGenerator: SystemIdGenerator,
        })
        if (res.details.length > 0) {
          console.error(`Validation details for [${slug}:${entry.id}]:`, res.details)
        }
        expect(res.details, `Fixture [${slug}:${entry.id}] failed validation`).toEqual([])
      }
    }
  })
})
