// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../../types'

/** The `Input` of `requireUploadFile`: what `hc` sends as `form` and what the handler reads back. */
export type UploadFileInput = { in: { form: { file: File } }; out: { form: { file: File } } }

/**
 * Refuses the proxied upload in production before the body is read: the Worker must never parse
 * upload bytes there. It is a middleware so it stays ahead of `requireUploadFile` in the chain.
 */
export const refuseProxiedUploadInProduction: MiddlewareHandler<AppEnv> = async (context, next) => {
  if (context.env.ENV === 'production') return context.json({ error: 'presigned_urls_required' }, 501)
  await next()
}

/**
 * Reads the multipart body and requires a `file` part, which is also where the request type for
 * `hc` comes from. On success the file is readable as `context.req.valid('form').file`.
 */
export const requireUploadFile: MiddlewareHandler<AppEnv, string, UploadFileInput> = async (context, next) => {
  let form: FormData
  try {
    form = await context.req.formData()
  } catch {
    return context.json({ error: 'Invalid multipart form data' }, 400)
  }

  const file = form.get('file')
  if (!file || typeof file === 'string') return context.json({ error: 'file is required' }, 400)

  context.req.addValidatedData('form', { file })
  await next()
}
