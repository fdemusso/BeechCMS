// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import it from "@/locales/it.json"
import en from "@/locales/en.json"

// lookupLocalStorage must match the language the Language tab of the settings writes (it goes through i18n itself).
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
    },
    fallbackLng: "en",
    supportedLngs: ["it", "en"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "beech_language",
    },
  })

// A screen reader pronounces the page by <html lang>: it has to say what the dashboard is written in.
const syncDocumentLanguage = (language?: string) => {
  if (typeof document !== "undefined" && language) document.documentElement.lang = language.split("-")[0]
}
i18n.on("initialized", () => syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language))
i18n.on("languageChanged", syncDocumentLanguage)

export default i18n
