// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

/**
 * Schema for rotating a hashed field value.
 * Used to update fields that have 'hash' privacy (e.g., passwords, PINs).
 */
export const rotateFieldRequestSchema = z.object({
  fieldAlias: z.string().min(1, "The field alias is required"),
  currentValue: z.string().min(1, "The current value is required"),
  nextValue: z.string().min(1, "The new value is required"),
})

export type RotateFieldRequest = z.infer<typeof rotateFieldRequestSchema>
