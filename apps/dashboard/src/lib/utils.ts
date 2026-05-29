// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Backward-compat barrel.
 *
 * New code should import directly from a sub-module
 * (`@/lib/utils/cn`, `@/lib/utils/format`, `@/lib/utils/dom`, `@/lib/utils/api`).
 * The existing importers continue to work unchanged through this re-export
 * so this split is a zero-breaking-change refactor.
 */
export * from "./utils/cn"
export * from "./utils/format"
export * from "./utils/dom"
export * from "./utils/api"
