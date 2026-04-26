import type { OutboundEmail } from './email.types'

/**
 * EmailProvider — contratto formale per i provider di invio email.
 *
 * Ogni implementazione (Resend, SendGrid, Mailgun, SMTP, …) DEVE rispettare
 * questa interfaccia. È l'unico punto di accoppiamento tra il modulo email e
 * qualsiasi servizio esterno di terze parti.
 *
 * ─── COME CAMBIARE PROVIDER ──────────────────────────────────────────────────
 *  1. Crea un nuovo file sotto `providers/`  (es. `providers/sendgrid.ts`).
 *  2. Esporta una classe che implementa questa interfaccia.
 *  3. In `email.service.ts` sostituisci l'import e l'istanziazione del provider
 *     attuale con la tua nuova classe nella funzione `createProvider()`.
 *  4. Aggiorna le variabili d'ambiente necessarie in `types.ts` e `wrangler.jsonc`.
 *  5. Nessun altro file del progetto va toccato.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface EmailProvider {
  /**
   * Invia una singola email transazionale.
   *
   * @param email - Il messaggio completamente risolto: mittente, destinatario,
   *               oggetto e corpo HTML. Usa i builder in `templates/` per
   *               costruire questo oggetto in modo corretto.
   *
   * @returns Promise che si risolve quando il provider ha **accettato** il
   *          messaggio per la consegna. L'accettazione non garantisce la ricezione
   *          in inbox — quella dipende dal server del destinatario e dalla
   *          deliverability del provider.
   *
   * @throws {Error} Se il provider rifiuta la richiesta (autenticazione fallita,
   *                 errore di rete, payload non valido). Il chiamante
   *                 (`email.service.ts`) è responsabile di catturare e gestire
   *                 questo errore in modo appropriato.
   */
  send(email: OutboundEmail): Promise<void>
}
