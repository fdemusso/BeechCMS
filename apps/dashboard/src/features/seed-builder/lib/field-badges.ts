// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { resolveClassification } from "@beechcms/core"
import type { Branch } from "@beechcms/core"
import { Language, Star } from "@/components/icons"
import type { IconBadgeItem } from "@/components/ui/icon-badge"
import { CLASSIFICATION_ICONS } from "./field-types"

/** The badges of a field, in the order they read: required, localized, privacy tier (public included). */
export function fieldBadges(branch: Branch, t: TFunction): IconBadgeItem[] {
  const tier = resolveClassification(branch).classification
  return [
    ...(branch.requiredOnCreate === true
      ? [{ id: "required", icon: Star, label: t("seedBuilder.branchEditor.required") }]
      : []),
    ...(branch.localized === true
      ? [{ id: "localized", icon: Language, label: t("seedBuilder.branchEditor.localized") }]
      : []),
    { id: "tier", icon: CLASSIFICATION_ICONS[tier], label: t(`seedBuilder.policies.classification_${tier}`) },
  ]
}
