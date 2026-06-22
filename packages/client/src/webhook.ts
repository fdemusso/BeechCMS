// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { verifyWebhookSignature } from '@beechcms/core/webhook-crypto'

/** Validates an inbound BeechCMS webhook (X-BeechCMS-Signature) against the shared secret. */
export async function verifyBeechSignature(
  body: string,
  signature: string | null,
  secret: string,
): Promise<boolean> {
  return verifyWebhookSignature(body, signature, secret)
}
