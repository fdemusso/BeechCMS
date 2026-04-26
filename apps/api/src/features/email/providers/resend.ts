/// <reference types="@cloudflare/workers-types" />
import type { EmailProvider } from '../email.provider'
import type { OutboundEmail } from '../email.types'

/** Endpoint REST di Resend per l'invio email. */
const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * Implementazione Resend di EmailProvider.
 *
 * Questo è l'UNICO file del modulo email che conosce Resend.
 * Ogni altro file è completamente ignaro di quale provider sia attivo.
 *
 * ─── COME SOSTITUIRE QUESTO PROVIDER ─────────────────────────────────────────
 *  1. Crea un nuovo file in `providers/`  (es. `providers/sendgrid.ts`).
 *  2. Esporta una classe che implementa `EmailProvider`  (un solo metodo: `send`).
 *  3. In `email.service.ts` sostituisci `new ResendEmailProvider(…)` con la
 *     tua nuova classe nella funzione `createProvider()`.
 *  4. Aggiorna le variabili d'ambiente in `types.ts` e `wrangler.jsonc`.
 *  5. Nessun altro file nel progetto va modificato.
 *
 * Documentazione API Resend: https://resend.com/docs/api-reference/emails/send-email
 * ─────────────────────────────────────────────────────────────────────────────
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string

  /** Quando `true`, gli errori vengono loggati in console (solo in sviluppo). */
  private readonly isDev: boolean

  constructor(apiKey: string, isDev = false) {
    this.apiKey = apiKey
    this.isDev = isDev
  }

  /**
   * Invia l'email tramite la REST API di Resend (`POST /emails`).
   *
   * Lancia un'eccezione se Resend risponde con uno status non-2xx, in modo
   * che il chiamante (`email.service.ts`) possa decidere se propagare l'errore
   * o gestirlo silenziosamente (fire-and-forget).
   *
   * Il corpo della response viene letto per il log solo in ambiente di sviluppo,
   * per evitare di consumare il body stream in produzione inutilmente.
   */
  async send(email: OutboundEmail): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email),
    })

    if (!response.ok) {
      const detail = this.isDev
        ? await response.text()
        : `HTTP ${response.status}`
      throw new Error(`[ResendEmailProvider] invio fallito — ${detail}`)
    }
  }
}
