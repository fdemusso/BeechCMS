// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import type { ActivityActor, ActivityLogEntry } from '@beechcms/core'
import type { AppEnv } from '../../../types'
import { getClientIp } from '../../utils/request-utils'

export type ActivityInput = Omit<ActivityLogEntry, 'actor'> & {
  /** Defaults to the authenticated caller; pass one for events with no session yet (sign-in, invitation accept). */
  actor?: ActivityActor
}

const MAX_USER_AGENT_LENGTH = 200

/** The authenticated caller as an activity actor, or `null` when the request carries no session. */
export function actorFromJwt(context: Context<AppEnv>): ActivityActor | null {
  const claims = context.get('jwtPayload')
  if (!claims) return null
  return {
    id: claims.sub,
    email: claims.email ?? 'unknown',
    name: [claims.name, claims.surname].filter(Boolean).join(' ') || null,
  }
}

/**
 * Where a request came from, for the sign-in trail: IP, country and city as Cloudflare reports them, plus the
 * browser's own description. Every field is best effort and absent when the edge did not send it (local dev,
 * tests). Cloudflare marks an unknown country `XX` and Tor `T1`: neither is worth showing.
 */
export function requestOrigin(context: Context<AppEnv>): { ip: string; country?: string; city?: string; userAgent?: string } {
  const country = context.req.header('cf-ipcountry')
  const edge = (context.req.raw as { cf?: { city?: unknown } }).cf
  const city = typeof edge?.city === 'string' && edge.city ? edge.city : undefined
  const userAgent = context.req.header('user-agent')?.slice(0, MAX_USER_AGENT_LENGTH)
  return {
    ip: getClientIp(context.req),
    ...(country && country !== 'XX' && country !== 'T1' ? { country } : {}),
    ...(city ? { city } : {}),
    ...(userAgent ? { userAgent } : {}),
  }
}

/**
 * Records one activity entry as the current caller. Logging is observability: a missing logger, a missing session
 * or a failing sink never reaches the request being served.
 */
export function logActivity(context: Context<AppEnv>, entry: ActivityInput): void {
  try {
    const logger = context.get('activityLogger')
    const actor = entry.actor ?? actorFromJwt(context)
    if (!logger || !actor) return
    void logger.log({ ...entry, actor })
  } catch (error) {
    console.error('logActivity: could not record activity entry', error)
  }
}
