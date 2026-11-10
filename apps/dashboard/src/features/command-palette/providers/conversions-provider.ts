// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { Clock, HardDrive, Palette, Ruler } from "@/components/icons"
import type { IconComponent } from "@/lib/icon-registry"
import type { PaletteProvider } from "../types"
import { convertValue, REM_BASE_PX, type ConversionKind } from "../lib/convert-value"
import { EXACT_MATCH_SCORE } from "../lib/rank-palette-items"

const KIND_ICONS: Readonly<Record<ConversionKind, IconComponent>> = {
  css: Ruler,
  storage: HardDrive,
  color: Palette,
  "unix-seconds": Clock,
  "unix-millis": Clock,
}

/** CSS units, storage units, hex colours and Unix timestamps recognised from the bare input. No prefix: `=` queries skip it. */
export function createConversionsProvider(deps: { t: TFunction }): PaletteProvider {
  const { t } = deps

  const hintFor = (kind: ConversionKind): string => {
    switch (kind) {
      case "css":
        return t("commandPalette.conversionHint.css", { base: REM_BASE_PX })
      case "storage":
        return t("commandPalette.conversionHint.storage")
      case "color":
        return t("commandPalette.copyHint")
      case "unix-seconds":
        return t("commandPalette.conversionHint.unixSeconds")
      case "unix-millis":
        return t("commandPalette.conversionHint.unixMillis")
    }
  }

  return {
    id: "convert",
    pages: ["root"],
    getItems: ({ query }) => {
      const conversion = convertValue(query)
      if (!conversion) return []

      const { kind, from, to } = conversion
      return [
        {
          id: `convert:${kind}`,
          section: t("commandPalette.conversion"),
          label: t("commandPalette.conversionResult", { from, to }),
          description: hintFor(kind),
          icon: KIND_ICONS[kind],
          score: EXACT_MATCH_SCORE,
          perform: { kind: "copy", value: to },
        },
      ]
    },
  }
}
