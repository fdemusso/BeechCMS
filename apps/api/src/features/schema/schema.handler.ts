// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'

const schemaApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Ritorna l'intero schema del CMS (la lista dei Seed configurati).
 * Usato dalla Dashboard per generare dinamicamente il menu e le form.
 */
schemaApp.get('/', async (context) => {
  const registry = context.get('seedRegistry')
  return context.json(registry.all())
})

export { schemaApp }
