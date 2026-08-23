# Feature Idea: HMAC Webhook Signature Verification SDK (`@beechcms/client/webhooks`)

> **Issue di riferimento:** [#329 — feat(sdk): HMAC Webhook Signature Verification SDK (@beechcms/client/webhooks)](https://github.com/fdemusso/BeechCMS/issues/329)

---

## 1. Vision & Obiettivo

Fornire agli sviluppatori un sotto-modulo ufficiale, ultra-leggero e isomorfico (`@beechcms/client/webhooks`) per verificare l'integrità e l'autenticità delle firme crittografiche HMAC-SHA256 sui webhook inviati da BeechCMS verso sistemi esterni (in stile Stripe/Svix).

Permette a qualsiasi server ricevente (Next.js App Router/API Routes, Express, Fastify, Cloudflare Workers, Node.js, Remix, Astro) di validare le notifiche in arrivo da BeechCMS in 1 riga di codice pulita ed ergonomica.

---

## 2. Contesto & Problema Attuale

1. **Assenza di sub-path export dedicato:** Attualmente il package `@beechcms/client` esporta solo il root barrel (`.`). Gli utenti non possono importare da `@beechcms/client/webhooks`.
2. **Ergonomia API migliorabile:** La funzione attuale `verifyBeechSignature` accetta parametri posizionali (`body, signature, secret`), mentre lo standard moderno di settore per gli SDK webhook predilige un oggetto di opzioni `{ payload, signature, secret }` o helper completi per il parsing degli eventi.
3. **Disallineamento documentazione:** La documentazione menzionava già l'oggetto `{ rawBody, signature, secret }`, richiedendo un allineamento rigoroso tra documentazione, tipi TypeScript ed esportazioni di pacchetto.

---

## 3. Requisiti Chiave e Proposta di Design

### A. Subpath Export in `package.json`
Nel `package.json` di `@beechcms/client`:
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./webhooks": {
      "import": "./dist/webhooks/index.js",
      "types": "./dist/webhooks/index.d.ts"
    }
  }
}
```

### B. Isomorfismo & Zero Dipendenze (Web Crypto API)
- Utilizzare nativamente `crypto.subtle` (Web Crypto API standard) disponibile su Node.js ≥ 18, Cloudflare Workers, Vercel Edge Runtime, Deno, Bun e browser.
- Confronto in tempo costante (`timingSafeEqual`) per proteggere da timing attacks.
- Tolleranza per firme con o senza prefisso `sha256=`.
- Nessuna dipendenza esterna pesante (zero runtime dependencies esterne nel client).

### C. API & DX Ergonomics
1. **`verifyBeechWebhookSignature(options)`**:
   - Accetta un oggetto con tipizzazione chiara:
     ```typescript
     export interface VerifyWebhookSignatureOptions {
       payload: string
       signature: string | null | undefined
       secret: string
     }
     ```
   - Supporto overload per argomenti posizionali `(payload, signature, secret)` per massima flessibilità e retrocompatibilità.
2. **`constructWebhookEvent<T>(options)`** *(Stripe-style helper)*:
   - Valida la firma HMAC e restituisce l'evento parsato come JSON tipizzato `T`.
   - Lancia `WebhookVerificationError` se la firma non è valida o `SyntaxError` se il payload JSON è corrotto.
3. **Costante Header:**
   - Esportare `BEECH_SIGNATURE_HEADER = 'x-beechcms-signature'` (e supporto alias `x-beech-signature`).
4. **Re-export:**
   - Esportazione dal sub-modulo `@beechcms/client/webhooks` e re-export dal barrel principale `@beechcms/client`.

---

## 4. Esempio di Utilizzo Target

### Next.js App Router (Route Handler)
```typescript
import { verifyBeechWebhookSignature, BEECH_SIGNATURE_HEADER } from '@beechcms/client/webhooks';

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get(BEECH_SIGNATURE_HEADER) ?? req.headers.get('x-beech-signature');
  const webhookSecret = process.env.BEECH_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const isValid = await verifyBeechWebhookSignature({
    payload,
    signature,
    secret: webhookSecret,
  });

  if (!isValid) {
    return new Response('Unauthorized: Invalid HMAC signature', { status: 401 });
  }

  const event = JSON.parse(payload);
  console.log('Evento webhook valido ricevuto:', event.type);

  return new Response('OK', { status: 200 });
}
```

### Approccio con `constructWebhookEvent`
```typescript
import { constructWebhookEvent } from '@beechcms/client/webhooks';

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('x-beechcms-signature');

  try {
    const event = await constructWebhookEvent<{ type: string; data: unknown }>({
      payload,
      signature,
      secret: process.env.BEECH_WEBHOOK_SECRET!,
    });

    console.log('Ricevuto evento:', event.type);
    return new Response('OK', { status: 200 });
  } catch (err) {
    return new Response('Invalid webhook', { status: 400 });
  }
}
```

---

## 5. Casi di Test & Copertura Requisiti

- **Firma Valida:** Verifica con HMAC SHA-256 valido (sia con prefisso `sha256=` che senza prefisso).
- **Manomissione Payload:** Verifica che un body alterato ritorni `false` o lanci `WebhookVerificationError`.
- **Secret Errato:** Rifiuto di firme calcolate con un secret differente.
- **Firma Assente/Nulla:** Gestione sicura di valori `null`, `undefined` o stringhe vuote.
- **Isomorfismo:** Test su runtime Node con Web Crypto nativo.
