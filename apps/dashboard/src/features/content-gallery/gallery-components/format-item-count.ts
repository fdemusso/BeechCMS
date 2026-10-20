// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import type { Seed } from "@beechcms/core"

/** Conteggio nel nome del seed: singolare con 1 elemento, plurale (se definito) altrimenti. */
export function formatItemCount(t: TFunction, count: number, seed: Pick<Seed, "label" | "labelPlural">): string {
  const label = count === 1 ? seed.label : (seed.labelPlural ?? seed.label)
  return t("gallery.folders.itemCount", { count, label })
}
