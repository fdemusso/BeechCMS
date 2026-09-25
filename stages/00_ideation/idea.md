# Proposta Feature: Unified Media Delivery & Edge Transformation Layer (Issue #111)

## 1. Visione & Contesto (Sintesi di Issue #111 e Commenti)
La gestione dei media in BeechCMS attualmente serve i file caricati su R2 in modo statico e diretto tramite `GET /api/media/:key`. Se un autore carica immagini non compresse ad alta risoluzione (es. foto da 4-8 MB), i siti vetrina e i frontend subiscono un forte degrado di performance (Core Web Vitals / LCP) e gli sviluppatori sono costretti a delegare a servizi esterni a pagamento (Cloudinary, Imgix).

La proposta originaria ipotizzava un endpoint dedicato `/api/media/resize/:key`. 
Tuttavia, come definito nel **Refined delivery contract** (commento all'Issue #111), l'obiettivo reale non è una semplice "rotta di resize", ma un **layer unificato e sicuro di media-delivery** che estende `GET /api/media/:key` trasformandolo nel punto di accesso canonico e cachabile per tutti gli asset gestiti.

---

## 2. Pilastri Chiave della Feature

### A. Endpoint Unificato & Backward Compatibility
- Mantenimento dell'endpoint `GET /api/media/:key`.
- Se richiesto **senza parametri**: serve l'asset originale R2 preservando l'attuale comportamento e gli header di sicurezza/cache (`max-age=31536000, immutable`).
- Se richiesto **con parametri di trasformazione validi**: applica la trasformazione e restituisce la variante derivata ottimizzata.

### B. Sicurezza e Protezione DoS (Source & Transformation Safety)
- **Zero Proxying Esterno**: trasformazione applicabile esclusivamente a chiavi R2 gestite da BeechCMS.
- **Validazione & Sanificazione rigorosa**:
  - Parametri supportati: `w` (width), `h` (height), `fit` (`cover`, `contain`, `scale-down`), `format` (`original`, `webp`, `jpeg`), `quality` (range 10–100, default 82).
  - **Flessibilità con Pixel Budget**: supporto a dimensioni continue (non vincolate a breakpoint fissi) fino a una dimensione massima per lato (es. `max 3840px`) e un budget di pixel totale (es. `width * height <= 16.777.216`, ~16 Mpx / 4K). Se il calcolo sfora, rifiuto immediato con errore `400 Bad Request`.
  - **Gestione asset non-raster**: i file non trasformabili (SVG, PDF, video, audio o documenti) con parametri di trasformazione allegati vengono **rigorosamente rifiutati con errore `400 Bad Request`** (`Cannot transform non-raster asset`). Zero spreco di calcolo ed evidenziazione immediata di errori di markup.
  - Mantenimento delle protezioni stored-XSS già attive (CSP sandbox su tipi attivi).
  - Correzione automatica dell'orientamento EXIF e emissione corretta degli header `Content-Type`.

### C. Normalizzazione Parametri, Canonical Caching ed ETag
- **Canonicalizzazione della query string**: ordinamento deterministico e normalizzazione dei parametri per garantire che `?w=800&h=450` e `?h=450&w=800` condividano la medesima chiave di cache sulla CDN.
- **Header HTTP e Cache**:
  - `Cache-Control: public, max-age=31536000, immutable` su varianti derivate stabili.
  - `ETag` deterministico derivato dall'identità dell'asset sorgente + hash dei parametri normalizzati.
- Compatibilità con richieste condizionali HTTP (`If-None-Match: 304 Not Modified`).

### D. Edge Runtime & Strategia di Fallback
- Esecuzione delle trasformazioni tramite le capacità native di Cloudflare Workers (`fetch(..., { cf: { image: { ... } } })`).
- **Politica di Fallback (Strict YAGNI)**: negli ambienti privi di supporto nativo a `cf.image` (test locali Vitest, Miniflare, self-hosted senza zone add-on), l'endpoint effettua un **passthrough trasparente** dell'asset originale R2, iniettando un header diagnostico `X-Beech-Media-Transform: passthrough-unsupported`. Nessuna dipendenza da motori WASM esterni.

### E. Developer Experience (DX) & Client Helper
- **Pure Utility Functions in `@beechcms/client` (Zero Framework Lock-in)**:
  - Utility per generazione URL canonico: `media(keyOrUrl, options)`
  - Utility per generazione attributi responsive: `mediaSrcSet(keyOrUrl, widths, options)`
  - Documentazione con pattern/esempi pronti per HTML, React (`next/image`, `<img>`), Astro.
  - Nessun componente React JSX/UI pesante nel core o nei package client per questa fase.

---

## 3. Delimitazioni e Ambito Fuori Scope (YAGNI v1)
- **NO AVIF nella prima release**: supporto limitato a WebP e JPEG per verificare costi, supporto runtime e cache hit rate prima di introdurre AVIF.
- **NO Image Proxy per URL esterni**: nessun fetch su domini terzi.
- **NO Filtri avanzati / Watermarking**: niente blur, contrasto, rotazioni arbitrarie o watermark.
- **NO Editor visuale di Crop/Focal Point nel Dashboard (per ora)**: predisposizione del contratto a livello di schema per futuri metadati (Issue #381), ma senza implementazione UI in questo sprint.
- **NO Componenti React JSX dedicati**: solo utility pure TypeScript.
