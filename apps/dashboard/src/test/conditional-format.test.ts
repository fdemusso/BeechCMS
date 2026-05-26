// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"

import {
  getConditionalFormatCellClass,
  getConditionalFormatRowClass,
} from "@/lib/conditional-format"

import type { ConditionalFormatTone, ConditionalFormatTextStyle } from "@/lib/conditional-format"

const tones: Array<ConditionalFormatTone> = ["neutral", "info", "success", "warning", "danger"]

const styles: ConditionalFormatTextStyle[] = ["bold", "italic", "underline"]

describe("conditional-format - getConditionalFormatRowClass", () => {
  it("neutral: include bg-muted/35 + text style", () => {
    const className = getConditionalFormatRowClass("neutral", ["bold", "underline"])
    expect(className).toContain("bg-muted/35")
    expect(className).toContain("font-bold")
    expect(className).toContain("underline")
  })

  it("tutti i tone: includono le rispettive classi di sfondo", () => {
    const expected: Record<ConditionalFormatTone, string> = {
      neutral: "bg-muted/35",
      info: "bg-sky-500/12",
      success: "bg-emerald-500/12",
      warning: "bg-amber-500/12",
      danger: "bg-destructive/12",
    }

    for (const tone of tones) {
      const className = getConditionalFormatRowClass(tone, ["bold"])
      expect(className).toContain(expected[tone])
      expect(className).toContain("hover:") // robusto: ogni tone ha hover bg-...
      expect(className).toContain("font-bold")
    }
  })

  it("textStyles vuoto: non aggiunge classi di stile", () => {
    const className = getConditionalFormatRowClass("success", [])
    expect(className).toContain("bg-emerald-500/12")
    expect(className).not.toContain("font-bold")
    expect(className).not.toContain("italic")
    expect(className).not.toContain("underline")
  })
})

describe("conditional-format - getConditionalFormatCellClass", () => {
  it("success/info/warning/danger/neutral: includono i frammenti attesi", () => {
    const cases: Record<ConditionalFormatTone, string[]> = {
      neutral: ["font-medium", "[&_[data-slot=badge]]:!text-inherit"],
      info: ["font-medium", "text-sky-800", "dark:text-sky-200"],
      success: ["font-medium", "text-emerald-700", "dark:text-emerald-300"],
      warning: ["font-medium", "text-amber-800", "dark:text-amber-200"],
      danger: ["font-medium", "text-destructive"],
    }

    for (const tone of tones) {
      const className = getConditionalFormatCellClass(tone, styles)
      for (const needle of cases[tone]) {
        expect(className).toContain(needle)
      }
      // stili testo: bold/italic/underline devono comparire nel caso in cui siano presenti
      expect(className).toContain("font-bold")
      expect(className).toContain("italic")
      expect(className).toContain("underline")
    }
  })

  it("textStyles non presenti: non include font-bold/italic/underline", () => {
    const className = getConditionalFormatCellClass("neutral", [])
    expect(className).toContain("font-medium")
    expect(className).not.toContain("font-bold")
    expect(className).not.toContain("italic")
    expect(className).not.toContain("underline")
  })
})

