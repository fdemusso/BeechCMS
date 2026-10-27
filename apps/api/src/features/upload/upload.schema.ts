// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { z } from 'zod'

const FILENAME_REQUIRED = 'filename is required'
const MIME_TYPE_REQUIRED = 'mimeType is required'
const SIZE_BYTES_INVALID = 'sizeBytes must be a positive number'
const KEY_REQUIRED = 'key is required'

/** A string with something other than whitespace in it. Not trimmed: the key is built from the raw name. */
const nonBlankString = (message: string) =>
  z.string({ error: message }).refine((value) => value.trim().length > 0, { error: message })

/**
 * Body of `POST /upload/presign`. The key order is the order the checks are reported in: the first
 * issue zod raises is the first thing the handler used to refuse. The object-level message covers a
 * body that is not an object at all, which used to fall through to the first required field.
 */
export const presignRequestSchema = z.object(
  {
    purpose: z.literal('import', { error: 'Invalid purpose' }).optional(),
    filename: nonBlankString(FILENAME_REQUIRED),
    mimeType: nonBlankString(MIME_TYPE_REQUIRED),
    sizeBytes: z.number({ error: SIZE_BYTES_INVALID }).positive({ error: SIZE_BYTES_INVALID }),
  },
  { error: FILENAME_REQUIRED },
)

/** Body of `POST /upload/confirm`. Whether the key is well formed is a rule of the handler. */
export const confirmRequestSchema = z.object({ key: nonBlankString(KEY_REQUIRED) }, { error: KEY_REQUIRED })

/** The message a refused body is answered with: the first rule it broke. */
export function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request body'
}
