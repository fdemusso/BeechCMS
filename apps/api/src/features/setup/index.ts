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
  const isDeveloper = context.env.ENV === 'development'
  const mail =
    context.env.EMAIL_PROVIDER === 'smtp' ||
    !!(context.env.EMAIL_API_KEY || context.env.RESEND_API_KEY)
  const qstash = !!context.env.QSTASH_TOKEN

  return context.json({
    needsSetup: userCount === 0,
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
