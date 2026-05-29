// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Backward-compat barrel.
 *
 * New code should import directly from `./shared`. Existing callers of
 * `@/components/ui/minimal-tiptap/utils` continue to work unchanged.
 */
export * from "./shared"
