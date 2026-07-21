// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { Hono } from 'hono'
import { Receiver } from '@upstash/qstash'
import type { AppEnv } from '../../types'
import { createNotificationSchema, type CreateNotificationInput } from '@beechcms/core'

export const webhooksApp = new Hono<AppEnv>()

webhooksApp.post('/qstash', async (context) => {
  const currentSigningKey = context.env.QSTASH_CURRENT_SIGNING_KEY
  const nextSigningKey = context.env.QSTASH_NEXT_SIGNING_KEY

  if (!currentSigningKey || !nextSigningKey) {
    console.error('QStash webhook called but signing keys are not configured')
    return context.text('Configuration error', 500)
  }

  const receiver = new Receiver({
    currentSigningKey,
    nextSigningKey,
  })

  const body = await context.req.text()
  const signature = context.req.header('Upstash-Signature')

  if (!signature) {
    return context.text('Missing signature', 401)
  }

  try {
    const isValid = await receiver.verify({
      signature,
      body,
      url: context.req.url,
    })

    if (!isValid) {
      return context.text('Invalid signature', 401)
    }
  } catch (err) {
    console.error('QStash signature verification failed', err)
    return context.text('Invalid signature', 401)
  }

  try {
    const rawInput = JSON.parse(body)
    const result = createNotificationSchema.safeParse(rawInput)

    if (!result.success) {
      console.error('Invalid QStash webhook payload', result.error)
      return context.text('Bad request: invalid payload', 400)
    }

    const input = result.data
    
    const notificationRepository = context.get('notificationRepository')
    
    await notificationRepository.create({
      title: input.title,
      message: input.message,
      type: input.type ?? 'info',
    })

    return context.text('OK', 200)
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Failed to parse QStash webhook payload as JSON', error)
      return context.text('Bad request: invalid JSON', 400)
    }
    console.error('Failed to process QStash webhook payload', error)
    return context.text('Internal server error', 500)
  }
})
