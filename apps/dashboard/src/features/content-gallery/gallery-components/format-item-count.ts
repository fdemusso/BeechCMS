// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"

export function formatItemCount(t: TFunction, count: number): string {
  return t("gallery.folders.itemCount", { count })
}
