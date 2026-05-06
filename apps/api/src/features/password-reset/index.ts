/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Env, Variables } from '../../types'
import { requestPasswordReset } from './request'
import { resetPassword } from './reset'

export const passwordResetApp = new Hono<{ Bindings: Env; Variables: Variables }>()

// Feature flag: lets the dashboard know whether to show the forgot-password link
passwordResetApp.get('/auth/features', (context) => {
  return context.json({ passwordReset: Boolean(context.env.RESEND_API_KEY) })
})

passwordResetApp.post('/auth/forgot-password', requestPasswordReset)
passwordResetApp.post('/auth/reset-password', resetPassword)
