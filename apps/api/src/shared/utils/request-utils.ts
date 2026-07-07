// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { HonoRequest } from "hono"

/** The header Cloudflare sets on every incoming request to the Worker. */
const CLOUDFLARE_CLIENT_IP_HEADER = "cf-connecting-ip"

/** The fallback value used when the IP header is absent (local dev, unit tests). */
const UNKNOWN_IP = "unknown"

/**
 * Extracts the real client IP address from a Cloudflare Worker request.
 *
 * Cloudflare injects the cf-connecting-ip header on every request that
 * passes through the edge. In local development (wrangler dev) or in
 * unit tests the header may be absent, in which case the string "unknown"
 * is returned so that rate-limiter keys remain non-empty and safe to use.
 *
 * Never derive security decisions from this value alone; treat it as a
 * best-effort hint for rate-limiting and logging purposes only.
 */
export function getClientIp(request: HonoRequest): string {
  return request.raw.headers.get(CLOUDFLARE_CLIENT_IP_HEADER) ?? UNKNOWN_IP
}
