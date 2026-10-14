// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { HonoRequest } from 'hono'

/**
 * Parses the request body as a JSON object.
 *
 * @remarks
 * Valid JSON of another shape (`null`, an array, a number, a string) is a client error, not a
 * crash: the handlers read properties off the body immediately and `JSON.parse('null')` succeeds.
 *
 * @returns The parsed object, or `null` when the body is not valid JSON or not a JSON object.
 */
export async function readJsonObject(req: HonoRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json()
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
    return body as Record<string, unknown>
  } catch {
    return null
  }
}
