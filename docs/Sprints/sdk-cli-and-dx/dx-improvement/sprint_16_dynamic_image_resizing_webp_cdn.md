## ── Sprint 16: Dynamic Image Resizing & WebP CDN ──

### Problema
I siti vetrina commerciali richiedono immagini veloci e super ottimizzate per raggiungere ottimi punteggi SEO (Core Web Vitals). Se l'amministratore carica un'immagine di copertina non ottimizzata da 4MB (es. PNG da una fotocamera), il browser la scaricherà per intero. Gli sviluppatori sono costretti a usare costosi servizi esterni di Image CDN (es. Cloudinary o Imgix).

### Soluzione proposta: Edge Image Resizer
Sfruttare le capacità di ridimensionamento delle immagini di Cloudflare Workers per creare un endpoint CDN di ridimensionamento dinamico nativo.

#### Endpoint di rendering:
```
GET /api/media/resize/:key?w=800&h=600&format=webp&q=80
```
Il server intercetta la richiesta, preleva l'immagine originale dal bucket R2, esegue il resizing e la conversione di formato (WebP/AVIF) tramite le API edge di Cloudflare, e restituisce il file ottimizzato impostando header HTTP di cache a lungo termine (`Cache-Control`).

### Checklist di Implementazione (Sprint 16)
- [ ] Creare l'endpoint `/api/media/resize/:key` all'interno del modulo `upload`.
- [ ] Integrare l'uso dell'API nativa di Cloudflare `fetch(..., { cf: { image: { ... } } })` o implementare un'integrazione con un image processor WASM in-worker se si desidera compatibilità totale in contesti self-hosted non-CF.
- [ ] Configurare gli header di caching per salvare le varianti ridimensionate sulla CDN di Cloudflare o in un bucket di cache temporaneo.
- [ ] Aggiungere test di integrazione per verificare il corretto ridimensionamento.
