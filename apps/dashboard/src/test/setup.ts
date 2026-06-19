// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"
import * as React from "react"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import itTranslations from "@/locales/it.json"
import enTranslations from "@/locales/en.json"

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  return new Proxy(actual, {
    get: (target, prop) => {
      if (typeof prop === "string" && /^[A-Z]/.test(prop)) {
        return () => React.createElement("svg", { "data-testid": `icon-${prop}` })
      }
      return target[prop as keyof typeof target]
    },
  })
})

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    lng: "en",
    resources: {
      it: { translation: itTranslations },
      en: { translation: enTranslations },
    },
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  })
} else {
  i18n.changeLanguage("en")
}

// Radix UI (DropdownMenu/ContextMenu) in jsdom può richiedere PointerEvent/ResizeObserver.
if (typeof globalThis.PointerEvent === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.PointerEvent = globalThis.MouseEvent as any
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = function() {};
}

// TipTap's placeholder viewport tracking calls document.elementFromPoint,
// not implemented in jsdom.
if (!document.elementFromPoint) {
  document.elementFromPoint = () => null
}

// Radix UI Select uses pointer capture APIs not implemented in jsdom.
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!window.HTMLElement.prototype.setPointerCapture) {
  window.HTMLElement.prototype.setPointerCapture = () => {};
}
if (!window.HTMLElement.prototype.releasePointerCapture) {
  window.HTMLElement.prototype.releasePointerCapture = () => {};
}
