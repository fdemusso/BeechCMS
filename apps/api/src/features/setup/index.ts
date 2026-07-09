// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { publicProblem } from '../../public/problem-details'

const setupApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * GET /auth/setup
 * Returns setup status + environment flags for the wizard.
 */
setupApp.get('/auth/setup', async (context) => {
  const userCount = await context.get('userRepository').countAll()
  const needsSetup = userCount === 0

  // Environment details (dev flag, mail/qstash configuration) are only useful
  // to the wizard itself — once an admin exists, this endpoint stays public
  // (the dashboard polls it pre-login) but must not leak them any further.
  if (!needsSetup) {
    return context.json({ needsSetup })
  }

  const isDeveloper = context.env.ENV === 'development'
  const mail =
    context.env.EMAIL_PROVIDER === 'smtp' ||
    !!(context.env.EMAIL_API_KEY || context.env.RESEND_API_KEY)
  const qstash = !!context.env.QSTASH_TOKEN

  return context.json({
    needsSetup,
    environment: { isDeveloper, services: { mail, qstash } },
  })
})

/**
 * POST /auth/setup
 * Creates the first administrator account and persists site defaults.
 */
setupApp.post('/auth/setup', async (context) => {
  const userCount = await context.get('userRepository').countAll()

  if (userCount > 0) {
    return publicProblem(context, {
      type: 'setup-already-done',
      title: 'Setup already completed',
      status: 403,
      detail: 'An administrator account already exists. Initial setup can only be performed once.',
    })
  }

  let payload: unknown
  try {
    payload = await context.req.json()
  } catch {
    return publicProblem(context, {
      type: 'bad-request',
      title: 'Invalid JSON body',
      status: 400,
      detail: 'The request body could not be parsed as valid JSON.',
    })
  }

  if (!payload || typeof payload !== 'object') {
    return publicProblem(context, {
      type: 'bad-request',
      title: 'Invalid request',
      status: 400,
      detail: 'The request payload is missing or invalid.',
    })
  }

  const p = payload as Record<string, unknown>
  const { email, password, name, surname, settings, track, company, loadDemoData } = p

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Valid email required',
      status: 422,
      detail: 'A valid email address is required for the administrator account.',
    })
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Invalid password',
      status: 422,
      detail: 'Password must be between 8 and 128 characters long.',
    })
  }

  if (new TextEncoder().encode(password).length > 72) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Invalid password',
      status: 422,
      detail: 'Password must not exceed 72 bytes when UTF-8 encoded.',
    })
  }

  if (!settings || typeof settings !== 'object') {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Settings required',
      status: 422,
      detail: 'settings.language, settings.timezone, and settings.currency are required.',
    })
  }

  const s = settings as Record<string, unknown>
  const language = typeof s.language === 'string' ? s.language : ''
  const timezone = typeof s.timezone === 'string' ? s.timezone.trim() : ''
  const currency = typeof s.currency === 'string' ? s.currency.trim() : ''

  if (!['it', 'en'].includes(language)) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Invalid language',
      status: 422,
      detail: 'settings.language must be "it" or "en".',
    })
  }

  if (!timezone) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Timezone required',
      status: 422,
      detail: 'settings.timezone must be a non-empty IANA timezone string.',
    })
  }

  if (!currency) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Currency required',
      status: 422,
      detail: 'settings.currency must be a non-empty ISO 4217 currency code.',
    })
  }

  if (track === 'normal') {
    if (!company || typeof company !== 'object') {
      return publicProblem(context, {
        type: 'validation-error',
        title: 'Company info required',
        status: 422,
        detail: 'company.name and company.website are required for the normal track.',
      })
    }
    const c = company as Record<string, unknown>
    if (typeof c.name !== 'string' || !c.name.trim()) {
      return publicProblem(context, {
        type: 'validation-error',
        title: 'Company name required',
        status: 422,
        detail: 'company.name must be a non-empty string.',
      })
    }
    if (typeof c.website !== 'string' || !c.website.trim()) {
      return publicProblem(context, {
        type: 'validation-error',
        title: 'Company website required',
        status: 422,
        detail: 'company.website must be a valid URL.',
      })
    }
    try {
      new URL(c.website.trim())
    } catch {
      return publicProblem(context, {
        type: 'validation-error',
        title: 'Invalid company website',
        status: 422,
        detail: 'company.website must be a valid URL.',
      })
    }
  }

  if (track === 'developer' && loadDemoData === true) {
    await context.get('demoDataRepository').loadDemoData()

    // Inject custom SaaS dashboard layout
    const layout = {
      version: 1,
      pages: [
        {
          id: 'page-1',
          slug: 'overview',
          label: 'Overview',
          icon: 'LayoutDashboard',
          sections: [
            {
              id: 'sec-0',
              hideLabel: true,
              columns: [
                { id: 'c0', widgets: [{ id: 'w0', type: 'core/text', config: { content: '# Acme SaaS Analytics\nBenvenuto nella dashboard di produzione. Qui puoi monitorare le metriche in tempo reale.' } }] }
              ]
            },
            {
              id: 'sec-1',
              hideLabel: true,
              columns: [
                { id: 'c1', widgets: [{ id: 'w1', type: 'core/stat', config: { seedSlug: 'clienti', formula: { op: 'sum', column: 'mrr' }, window: 'all' }, title: 'Totale MRR' }] },
                { id: 'c2', widgets: [{ id: 'w2', type: 'core/stat', config: { seedSlug: 'clienti', formula: { op: 'count' }, window: 'all' }, title: 'Clienti Attivi' }] },
                { id: 'c3', widgets: [{ id: 'w3', type: 'core/stat', config: { seedSlug: 'abbonamenti', formula: { op: 'count' }, window: 'all' }, title: 'Abbonamenti' }] },
                { id: 'c4', widgets: [{ id: 'w4', type: 'core/stat', config: { seedSlug: 'ticket', formula: { op: 'countWhere', column: 'ticket_status', value: 'open' }, window: 'all' }, title: 'Ticket Aperti' }] }
              ]
            },
            {
              id: 'sec-2',
              hideLabel: true,
              columns: [
                { id: 'c5', widgets: [{ id: 'w5', type: 'core/area-chart', config: { seedSlug: 'clienti', groupColumn: 'created_at', window: 'all' }, title: 'Andamento Iscrizioni' }] },
                { id: 'c6', widgets: [{ id: 'w6', type: 'core/pie-chart', config: { seedSlug: 'clienti', column: 'tier', window: 'all' }, title: 'Distribuzione Piani' }] }
              ],
              columnSpans: [8, 4]
            },
            {
              id: 'sec-3',
              hideLabel: true,
              columns: [
                { id: 'c7', widgets: [{ id: 'w7', type: 'core/data-table', config: { seedSlug: 'clienti', pageSize: 5 }, title: 'Ultimi Iscritti' }] },
                { id: 'c8', widgets: [{ id: 'w8', type: 'core/data-table', config: { seedSlug: 'changelog', pageSize: 5 }, title: 'Ultime Release' }] }
              ],
              columnSpans: [6, 6]
            }
          ]
        },
        {
          id: 'page-2',
          slug: 'operations',
          label: 'Operations',
          icon: 'LifeBuoy',
          sections: [
            {
              id: 'sec-4',
              hideLabel: true,
              columns: [
                { id: 'c9', widgets: [{ id: 'w9', type: 'core/stat', config: { seedSlug: 'ticket', formula: { op: 'countWhere', column: 'priority', value: 'high' }, window: 'all' }, title: 'Ticket Alta Priorità' }] },
                { id: 'c10', widgets: [{ id: 'w10', type: 'core/stat', config: { seedSlug: 'ticket', formula: { op: 'countWhere', column: 'ticket_status', value: 'closed' }, window: 'all' }, title: 'Ticket Chiusi' }] },
                { id: 'c11', widgets: [{ id: 'w11', type: 'core/stat', config: { seedSlug: 'changelog', formula: { op: 'count' }, window: 'all' }, title: 'Update Rilasciati' }] }
              ]
            },
            {
              id: 'sec-5',
              hideLabel: true,
              columns: [
                { id: 'c12', widgets: [{ id: 'w12', type: 'core/bar-chart', config: { seedSlug: 'ticket', groupColumn: 'created_at', window: 'all' }, title: 'Ticket nel tempo' }] },
                { id: 'c13', widgets: [{ id: 'w13', type: 'core/line-chart', config: { seedSlug: 'abbonamenti', groupColumn: 'created_at', window: 'all' }, title: 'Nuovi Abbonamenti' }] }
              ],
              columnSpans: [6, 6]
            },
            {
              id: 'sec-6',
              hideLabel: true,
              columns: [
                { id: 'c14', widgets: [{ id: 'w14', type: 'core/data-table', config: { seedSlug: 'ticket', pageSize: 10 }, title: 'Ticket in lavorazione' }] }
              ]
            }
          ]
        }
      ]
    }
    await context.get('dashboardLayoutRepository').upsert('default', layout as any, 'system')
  }

  const passwordHash = await context.get('hashProvider').hash(password)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = typeof name === 'string' ? name.trim() : null
  const normalizedSurname = typeof surname === 'string' ? surname.trim() : null

  await context.get('userRepository').create({
    id: context.get('idGenerator').uuid(),
    email: normalizedEmail,
    passwordHash,
    role: 'admin',
    name: normalizedName,
    surname: normalizedSurname,
  })

  if (track === 'normal' && company && typeof company === 'object') {
    const c = company as Record<string, unknown>
    const companyName = (c.name as string).trim()
    await context.get('siteSettingsRepository').setMany({
      defaultLanguage: language,
      timezone,
      currency,
      companyName,
      companyWebsite: (c.website as string).trim(),
      companyAbbreviation: typeof c.abbreviation === 'string' ? c.abbreviation.trim() || null : null,
      siteTitle: companyName,
    })
  } else {
    await context.get('siteSettingsRepository').setMany({ defaultLanguage: language, timezone, currency })
  }

  return context.json({ success: true }, 201)
})

export { setupApp }
