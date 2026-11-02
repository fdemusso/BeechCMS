// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Body the setup wizard sends to `POST /auth/setup`. `company` is read for the `normal` track and
 * `loadDemoData` for the `developer` one.
 */
export interface SetupRequest {
  email: string
  password: string
  name?: string
  surname?: string
  settings: { language: string; timezone: string; currency: string }
  track: 'developer' | 'normal'
  company?: { name: string; website: string; abbreviation?: string }
  loadDemoData?: boolean
}

/**
 * Body of `POST /auth/setup`. It types the request for `hc` and refuses nothing: this route is
 * open to anyone until the first admin exists, so each refusal has its own 422 problem type and
 * runs in the order the handler has always applied them (after the throttle and the "already
 * done" check, which come before the body is read at all).
 */
export const setupBodySchema = z.custom<SetupRequest>()
