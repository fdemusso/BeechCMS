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
 * Checks if the application needs an initial setup (i.e., if no users exist).
 */
setupApp.get('/auth/setup', async (context) => {
  const userCount = await context.get('userRepository').countAll()
  return context.json({ needsSetup: userCount === 0 })
})

/**
 * POST /auth/setup
 * Creates the first administrator account. This endpoint is disabled once at least one user exists.
 */
setupApp.post('/auth/setup', async (context) => {
  const userCount = await context.get('userRepository').countAll()

  if (userCount > 0) {
    return publicProblem(context, {
      type: 'setup-already-done',
      title: 'Setup already completed',
      status: 403,
      detail: 'An administrator account already exists. Initial setup can only be performed once.'
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
      detail: 'The request body could not be parsed as valid JSON.'
    })
  }

  if (!payload || typeof payload !== 'object') {
    return publicProblem(context, {
      type: 'bad-request',
      title: 'Invalid request',
      status: 400,
      detail: 'The request payload is missing or invalid.'
    })
  }

  const { email, password, name } = payload as Record<string, unknown>

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Valid email required',
      status: 422,
      detail: 'A valid email address is required for the administrator account.'
    })
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return publicProblem(context, {
      type: 'validation-error',
      title: 'Invalid password',
      status: 422,
      detail: 'Password must be between 8 and 128 characters long.'
    })
  }

  const passwordHash = await context.get('hashProvider').hash(password)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = typeof name === 'string' ? name.trim() : null

  await context.get('userRepository').create({
    id: context.get('idGenerator').uuid(),
    email: normalizedEmail,
    passwordHash,
    role: 'admin',
    name: normalizedName,
  })

  return context.json({ success: true }, 201)
})

export { setupApp }


