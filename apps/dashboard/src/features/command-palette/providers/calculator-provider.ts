// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { TFunction } from "i18next"
import { Calculator } from "@/components/icons"
import type { PaletteProvider } from "../types"
import { evaluateExpression } from "../lib/evaluate-expression"
import { EXACT_MATCH_SCORE } from "../lib/rank-palette-items"

const RESULT_SIGNIFICANT_DIGITS = 12

/** Rounds away floating-point noise (`0.1+0.2`) and prints plain number text. */
function formatResult(value: number): string {
  return value === 0 ? "0" : String(Number(value.toPrecision(RESULT_SIGNIFICANT_DIGITS)))
}

/** Arithmetic answered in-row. Without the `=` prefix only a compound expression qualifies, so a lone number stays a search. */
export function createCalculatorProvider(deps: { t: TFunction }): PaletteProvider {
  const { t } = deps

  return {
    id: "calc",
    pages: ["root"],
    prefix: "=",
    getItems: ({ query, prefix }) => {
      const evaluated = evaluateExpression(query)
      if (!evaluated || (!prefix && !evaluated.compound)) return []

      const result = formatResult(evaluated.value)
      return [
        {
          id: "calc:result",
          section: t("commandPalette.calculator"),
          label: t("commandPalette.calculatorResult", { expression: query, result }),
          description: t("commandPalette.copyHint"),
          icon: Calculator,
          score: EXACT_MATCH_SCORE,
          perform: { kind: "copy", value: result },
        },
      ]
    },
  }
}
