// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { defineSeed } from '@beechcms/core'

export const clienti = defineSeed({
  slug: 'clienti',
  label: 'Cliente',
  labelPlural: 'Clienti',
  displayNameAlias: 'name',
  dashboard: { icon: 'Users', group: 'SaaS Platform', order: 1 },
  allowPublicRead: false,
  allowDrafts: false,
  branches: [
    { id: 'br_c1', alias: 'name', label: 'Nome Azienda / Contatto', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_c2', alias: 'email', label: 'Email Contatto', type: 'text', requiredOnCreate: true, requiredOnUpdate: true, policies: { classification: 'confidential' } },
    { id: 'br_c3', alias: 'company', label: 'Azienda', type: 'text' },
    {
      id: 'br_c4',
      alias: 'tier',
      label: 'Piano',
      type: 'text',
      options: ['free', 'pro', 'enterprise'],
      requiredOnCreate: true,
      requiredOnUpdate: true
    },
    {
      id: 'br_c5',
      alias: 'account_status',
      label: 'Stato Account',
      type: 'text',
      options: ['active', 'churned'],
      requiredOnCreate: true,
      requiredOnUpdate: true
    },
    { id: 'br_c6', alias: 'mrr', label: 'MRR (€)', type: 'number', numberOptions: { format: 'currency', currency: 'EUR' }, policies: { classification: 'internal' } }
  ]
})

export const abbonamenti = defineSeed({
  slug: 'abbonamenti',
  label: 'Abbonamento',
  labelPlural: 'Abbonamenti',
  displayNameAlias: 'customer_id',
  dashboard: { icon: 'CreditCard', group: 'SaaS Platform', order: 2 },
  allowDrafts: false,
  branches: [
    {
      id: 'br_a1',
      alias: 'customer_id',
      label: 'Cliente',
      type: 'relation',
      targetSeed: 'clienti',
      onDelete: 'SET NULL',
      requiredOnCreate: true,
      requiredOnUpdate: true
    },
    { id: 'br_a2', alias: 'amount', label: 'Importo', type: 'number', numberOptions: { format: 'currency', currency: 'EUR' }, requiredOnCreate: true, requiredOnUpdate: true },
    {
      id: 'br_a3',
      alias: 'billing_cycle',
      label: 'Ciclo di Fatturazione',
      type: 'text',
      options: ['monthly', 'annual'],
      requiredOnCreate: true,
      requiredOnUpdate: true
    },
    {
      id: 'br_a4',
      alias: 'payment_status',
      label: 'Stato Pagamento',
      type: 'text',
      options: ['active', 'past_due', 'canceled'],
      requiredOnCreate: true,
      requiredOnUpdate: true
    }
  ]
})

export const ticket = defineSeed({
  slug: 'ticket',
  label: 'Ticket Supporto',
  labelPlural: 'Ticket Supporto',
  displayNameAlias: 'title',
  dashboard: { icon: 'LifeBuoy', group: 'Support', order: 3 },
  allowDrafts: false,
  branches: [
    { id: 'br_t1', alias: 'title', label: 'Oggetto', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    {
      id: 'br_t2',
      alias: 'customer_id',
      label: 'Cliente',
      type: 'relation',
      targetSeed: 'clienti',
      onDelete: 'SET NULL',
      requiredOnCreate: true,
      requiredOnUpdate: true
    },
    {
      id: 'br_t3',
      alias: 'priority',
      label: 'Priorità',
      type: 'text',
      options: ['low', 'medium', 'high'],
      requiredOnCreate: true,
      requiredOnUpdate: true
    },
    {
      id: 'br_t4',
      alias: 'category',
      label: 'Categoria',
      type: 'text',
      options: ['billing', 'technical', 'sales'],
      requiredOnCreate: true,
      requiredOnUpdate: true
    },
    {
      id: 'br_t5',
      alias: 'ticket_status',
      label: 'Stato',
      type: 'text',
      options: ['open', 'in_progress', 'closed'],
      requiredOnCreate: true,
      requiredOnUpdate: true
    }
  ]
})

export const changelog = defineSeed({
  slug: 'changelog',
  label: 'Release Note',
  labelPlural: 'Release Notes',
  displayNameAlias: 'version',
  dashboard: { icon: 'Rocket', group: 'Content', order: 4 },
  allowDrafts: true,
  branches: [
    { id: 'br_ch1', alias: 'version', label: 'Versione', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_ch2', alias: 'release_date', label: 'Data Rilascio', type: 'date', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_ch3', alias: 'features', label: 'Novità', type: 'richtext' }
  ]
})

export const articoli = defineSeed({
  slug: 'articoli',
  label: 'Articolo',
  labelPlural: 'Articoli',
  displayNameAlias: 'title',
  dashboard: { icon: 'FileText', group: 'Content', order: 5 },
  allowDrafts: true,
  allowPublicRead: true,
  branches: [
    { id: 'br_ar1', alias: 'title', label: 'Titolo', type: 'text', requiredOnCreate: true, requiredOnUpdate: true },
    { id: 'br_ar2', alias: 'author', label: 'Autore', type: 'text' },
    { id: 'br_ar3', alias: 'cover_image', label: 'Immagine Copertina', type: 'text' },
    { id: 'br_ar4', alias: 'body', label: 'Contenuto', type: 'richtext' }
  ]
})

export const seeds = [clienti, abbonamenti, ticket, changelog, articoli]
