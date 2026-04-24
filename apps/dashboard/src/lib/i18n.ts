import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import it from "@/locales/it.json"
import en from "@/locales/en.json"

// lookupLocalStorage must match LANGUAGE_KEY in interface-tab.tsx
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

export default i18n
