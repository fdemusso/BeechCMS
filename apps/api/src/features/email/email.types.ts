/**
 * Tipi condivisi del modulo email di Beech CMS.
 *
 * Tutti i tipi usati tra provider, service e template sono definiti qui
 * in modo che ogni layer rimanga disaccoppiato dagli altri.
 */

// ── Locale ────────────────────────────────────────────────────────────────────

/**
 * Lingue supportate dal sistema di template email.
 *
 * Per aggiungere una nuova lingua:
 *  1. Aggiungi il codice ISO qui (es. `'fr'`).
 *  2. Aggiungi la traduzione corrispondente nell'oggetto `COPY` di ogni
 *     file in `templates/`. TypeScript segnalerà le chiavi mancanti.
 */
export const SUPPORTED_EMAIL_LOCALES = ['en', 'it'] as const
export type EmailLocale = (typeof SUPPORTED_EMAIL_LOCALES)[number]

/**
 * Risolve una stringa locale non verificata (es. dal body di una request)
 * a un valore `EmailLocale` supportato. Qualsiasi valore sconosciuto
 * ricade su `'en'` in modo sicuro.
 *
 * @param raw - Valore grezzo dal client (può essere qualsiasi cosa).
 * @returns Un `EmailLocale` valido, sempre.
 */
export function resolveEmailLocale(raw: unknown): EmailLocale {
  if (
    typeof raw === 'string' &&
    (SUPPORTED_EMAIL_LOCALES as readonly string[]).includes(raw)
  ) {
    return raw as EmailLocale
  }
  return 'en'
}

// ── Messaggio outbound ────────────────────────────────────────────────────────

/**
 * Il messaggio email risolto che il provider riceve e invia.
 * Viene costruito dal service combinando i parametri della chiamata
 * con l'output del template builder.
 */
export interface OutboundEmail {
  /** Indirizzo mittente in formato RFC 5321 (es. "Beech CMS <noreply@beechcms.dev>"). */
  from: string
  /** Lista degli indirizzi destinatari. Deve contenere almeno un elemento. */
  to: string[]
  subject: string
  /** Corpo HTML completo. Deve essere un documento HTML valido (vedi `templates/shell.ts`). */
  html: string
}

// ── Parametri delle funzioni del service ──────────────────────────────────────

/**
 * Parametri condivisi da ogni funzione di invio email in `email.service.ts`.
 * Le funzioni specifiche estendono questo tipo con i campi aggiuntivi
 * necessari al proprio template.
 */
export interface BaseEmailParams {
  /** Indirizzo del destinatario principale. */
  to: string
  /** Lingua del corpo email. Usa `resolveEmailLocale()` prima di passarlo qui. */
  locale: EmailLocale
  /**
   * API key Resend (o del provider attivo). Deve essere non vuota —
   * il chiamante è responsabile di validarla prima di invocare il service.
   */
  apiKey: string
  /**
   * Indirizzo mittente in formato RFC 5321.
   * Default: "Beech CMS <onboarding@resend.dev>" (mittente di test Resend).
   * In produzione, impostare un indirizzo verificato tramite la variabile
   * d'ambiente `EMAIL_FROM`.
   */
  from?: string
  /**
   * Quando `true`, gli errori del provider vengono loggati in console.
   * Impostare `false` in produzione per non esporre dettagli interni.
   */
  isDev?: boolean
}

/** Parametri per l'email di reset password — aggiunge l'URL di reset. */
export interface PasswordResetEmailParams extends BaseEmailParams {
  /**
   * URL completo che l'utente clicca per impostare la nuova password.
   * Contiene il token in chiaro come query param `?token=<uuid>`.
   * Costruito dal chiamante come `${APP_URL}/reset-password?token=${token}`.
   */
  resetUrl: string
}

/** Parametri per la notifica "password modificata". Nessun campo aggiuntivo. */
export type PasswordChangedEmailParams = BaseEmailParams
