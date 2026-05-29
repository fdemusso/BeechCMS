// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import "@testing-library/jest-dom/vitest"
import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import itTranslations from "@/locales/it.json"
import enTranslations from "@/locales/en.json"

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
