// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Body of `PUT /:slug/:id/draft`: the fields to draft, plus the envelope keys the handler strips
 * (`slug`, `status`, `updated_at`). It types the request for `hc` and refuses nothing: a body that
 * is not an object has always been read as `{}` (so it fails `requireAtLeastOneValidField`), and
 * the field-level refusals depend on the seed. The handler narrows with `normalizeBody`.
 */
export const draftBodySchema = z.custom<Record<string, unknown>>()
