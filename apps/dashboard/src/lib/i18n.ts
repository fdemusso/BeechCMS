// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import en from "@/locales/en.json"
import it from "@/locales/it.json"
import es from "@/locales/es.json"
import de from "@/locales/de.json"
import fr from "@/locales/fr.json"

// lookupLocalStorage must match the language the Language tab of the settings writes (it goes through i18n itself).
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it },
      es: { translation: es },
      de: { translation: de },
      fr: { translation: fr },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "it", "es", "de", "fr"],
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
