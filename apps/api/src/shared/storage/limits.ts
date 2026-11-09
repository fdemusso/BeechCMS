// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * R2 has no capacity of its own to ask for: a bucket just grows. This is the free allowance of the Cloudflare plan,
 * the one figure every storage meter (the dashboard widget, the health check, the Storage settings) is measured
 * against, so they cannot disagree.
 */
export const R2_FREE_ALLOWANCE_BYTES = 10 * 1024 * 1024 * 1024
