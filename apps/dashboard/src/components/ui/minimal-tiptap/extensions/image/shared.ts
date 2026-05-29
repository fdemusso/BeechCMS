// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Shared types for the image extension.
 *
 * Lives here so `image.ts` and `image-view-block.tsx` can both depend on
 * these types without importing from each other (which would create a cycle).
 */

export type UploadReturnType =
  | string
  | {
      id: string | number
      src: string
    }
