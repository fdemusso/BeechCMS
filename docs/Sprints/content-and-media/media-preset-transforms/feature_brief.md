# 1. Feature Definition and Core Value

BeechCMS serve oggi i media caricati su R2 in modo statico tramite `GET /api/media/:key`. Autori che caricano immagini non compresse ad alta risoluzione (4-8 MB) degradano le Core Web Vitals (LCP) dei siti che consumano il CMS, e gli sviluppatori sono costretti a delegare la trasformazione a servizi esterni a pagamento (Cloudinary, Imgix), aggiungendo costo, latenza di integrazione e una dipendenza esterna non necessaria.

La feature estende l'endpoint pubblico esistente `GET /api/media/:key` in un layer di media-delivery con trasformazione edge-native (ridimensionamento, conversione di formato, compressione), cacheabile in modo canonico. Il valore indispensabile è eliminare la necessità di un servizio esterno per il caso d'uso più comune (resize/conversione di immagini raster pubbliche) senza introdurre superfici di attacco nuove: ogni trasformazione possibile è pre-registrata in un catalogo finito di preset, non generata da parametri numerici liberi. Questo rende il costo di storage/cache/compute della feature strutturalmente limitato e prevedibile, a differenza di un resize-endpoint a parametri arbitrari.

# 2. Domain Boundaries and Business Rules

**Entità logiche coinvolte:**
- **Media Object (R2/S3)**: il binario sorgente, identificato da una `key`. Esiste indipendentemente da qualsiasi content item che lo referenzi.
- **Preset di Trasformazione**: entità di configurazione (non un content item), un catalogo finito e nominato di trasformazioni valide. Due famiglie: *crop fisso* (`w`×`h`×`fit=cover`) e *scala responsive* (`w` fisso, `fit=scale-down`, `h` derivato).
- **Variante Derivata**: il risultato cacheable di (Media Object + Preset + format + quality), mai generata da combinazioni libere di parametri.

**Confine architetturale con il sistema di autorizzazione esistente:** BeechCMS ha già un sistema di classificazione a 4 livelli (`DataClassification`: `public | internal | confidential | restricted`, risolto da `resolveClassification()` in `packages/core/src/engine/policies.ts`), ma questo governa la visibilità dei **campi di un content entry**, non i singoli oggetti binari in R2. Il controllo d'accesso sui media segue un binario separato e ownership-based, esposto da `GET /api/upload/download-url/:key` (richiede ruolo `admin` o `uploaded_by === userId`, presigned URL con TTL 900s). Questa feature **non tocca e non estende** quel binario: `GET /api/media/:key` resta, per design, pubblico e non autenticato, con cache `immutable` a livello edge. La trasformazione media si applica esclusivamente al binario pubblico; qualunque esigenza di trasformare asset privati/ownership-gated è un dominio distinto, fuori da questa feature.

**Regola di dominio non negoziabile:** nessun parametro di trasformazione (`w`, `h`, `quality`) può accettare un valore numerico libero fornito dal client. Ogni richiesta di trasformazione deve risolvere a un nome di preset pre-registrato nel catalogo attivo (default imbustato + estensioni via env var). Questa regola esiste per eliminare — non limitare — la cardinalità delle varianti derivate, che altrimenti costituirebbe una superficie di amplificazione di costo (compute Workers + storage cache) sfruttabile da un attaccante non autenticato, dato che l'endpoint è pubblico per design.

# 3. Primary Requirements (User Stories)

* AS A frontend developer I WANT to request a pre-registered crop preset (es. `thumbnail`, `card`, `og-image`, `hero`, `avatar`) via query string su `GET /api/media/:key` SO THAT ottengo una variante ottimizzata a dimensioni fisse senza gestire io stesso il resize o pagare un servizio esterno.

* AS A frontend developer I WANT to request a pre-registered "scala responsive" preset (es. `w-640`, `w-1920`, `w-3840`) SO THAT posso costruire layout responsive (srcset) senza specificare altezze o parametri liberi, lasciando che l'aspect ratio nativo dell'asset sia preservato.

* AS AN unauthenticated site visitor I WANT che l'immagine trasformata richiesta venga servita con header di cache aggressivi e deterministici (`Cache-Control: immutable`, `ETag` stabile) SO THAT il mio browser e la CDN evitano richieste ripetute per lo stesso asset+preset.

* AS A platform operator I WANT che ogni richiesta con parametri di trasformazione non riconosciuti (preset inesistente, asset non-raster, combinazione non valida) venga rifiutata immediatamente con `400 Bad Request` SO THAT il sistema non spreca cicli di calcolo né genera varianti di cache indesiderate.

* AS A BeechCMS core maintainer I WANT che il catalogo dei preset e il ceiling massimo di dimensione abbiano un default sicuro imbustato nel core, sovrascrivibile via env var SO THAT ogni progetto ottiene protezione anti-DoS out-of-the-box, con la possibilità di personalizzare il catalogo per esigenze specifiche.

* AS A frontend developer I WANT una utility pura (`media(keyOrUrl, { preset, format?, quality? })`) per generare l'URL canonico di una variante SO THAT non devo costruire a mano query string né conoscere le regole di canonicalizzazione/ordinamento dei parametri.

* AS A frontend developer I WANT una utility pura (`mediaSrcSet(keyOrUrl, presetNames[], options)`) che accetti solo nomi di preset "a scala" SO THAT posso generare un attributo `srcset` responsive standard restando comunque dentro il catalogo whitelisted, senza reintrodurre parametri liberi.

# 4. Secondary Requirements and Logical Constraints

**Vincoli sul catalogo preset:**
- Il catalogo di default include preset a crop fisso (`thumbnail` 200×200, `avatar` 128×128, `card` 400×300, `og-image` 1200×630, `hero` 1920×800, tutti `fit=cover`) e preset a scala (`w-320` … `w-5120`, `fit=scale-down`, passo standard fino a `5120px` per coprire pannelli ultrawide 32:9 nativi).
- Il catalogo è sovrascrivibile/estendibile via env var; se la env var è assente, si applica interamente il default sopra descritto. Va documentato con un esempio concreto nel file env di riferimento.
- Un nome di preset non presente nel catalogo attivo produce sempre `400 Bad Request`, mai un fallback silenzioso a un preset simile.

**Vincolo anti-DoS sull'asse derivato (edge case emerso in sparring):** nei preset "a scala", l'altezza è sempre derivata dall'aspect ratio nativo dell'asset sorgente, mai fornita dal client. Un asset con aspect ratio patologico (es. screenshot estremamente verticale) potrebbe generare un'altezza derivata enorme anche a partire da una `w` whitelisted, vanificando la protezione. L'altezza derivata deve quindi essere clampata al ceiling globale di dimensione massima (default `5120px` per lato); se il calcolo la supera, la richiesta è rifiutata con `400 Bad Request`, non troncata silenziosamente.

**Vincoli su format e quality:**
- `format` accetta solo `original | webp | jpeg` (AVIF esplicitamente fuori scope v1). È l'unico parametro non derivato da un preset, ma essendo un enum a 3 valori non reintroduce cardinalità significativa.
- `quality` non è più un range continuo (`10-100`): è vincolato a un enum fisso `low | medium | high` (default `medium`, ≈82), per la stessa ragione anti-cardinalità applicata a `w`/`h`.

**Gestione asset non trasformabili:** file non raster (SVG, PDF, video, audio, documenti) richiesti con un preset qualsiasi allegato vengono rifiutati con `400 Bad Request` (`Cannot transform non-raster asset`). Le protezioni stored-XSS già attive sui tipi di contenuto pericolosi restano invariate e si applicano prima di qualunque logica di trasformazione.

**Canonicalizzazione e cache:**
- La combinazione (asset key, preset name, format, quality) produce una chiave di cache canonica e deterministica; l'ordine dei parametri nella query string non deve influenzare la chiave.
- `ETag` deterministico derivato dall'identità dell'asset sorgente + preset + format + quality.
- Supporto a richieste condizionali HTTP (`If-None-Match` → `304 Not Modified`).
- Correzione automatica dell'orientamento EXIF prima della trasformazione, con emissione dell'header `Content-Type` corretto per il formato di output.

**Fallback edge runtime:** negli ambienti privi di supporto nativo alle trasformazioni immagine di Cloudflare Workers (test locali Vitest, Miniflare, self-hosted senza zone add-on), l'endpoint effettua passthrough trasparente dell'asset originale, con header diagnostico `X-Beech-Media-Transform: passthrough-unsupported`. Nessuna dipendenza da motori WASM esterni per coprire questi ambienti.

**Backward compatibility:** `GET /api/media/:key` richiesto senza alcun parametro di preset continua a servire l'asset originale, preservando esattamente il comportamento e gli header attuali (`Cache-Control: public, max-age=31536000, immutable`).

**Confine con il sistema di autorizzazione:** nessuna interazione con `DataClassification` o con l'endpoint ownership-gated `GET /api/upload/download-url/:key`. La feature assume che tutto ciò che passa per `GET /api/media/:key` sia, per definizione architetturale pre-esistente, pubblico.

# 5. Out of Scope (Discarded during sparring)

- **Parametri di trasformazione numerici liberi** (`w`, `h`, `quality` come range continuo) — sostituiti interamente da un catalogo di preset nominati per eliminare (non limitare) la superficie di amplificazione DoS su un endpoint pubblico non autenticato.
- **Rate limiting come meccanismo primario anti-abuso** — scartato a favore della whitelist di preset, giudicata più efficiente per questo caso specifico.
- **Trasformazione di asset privati/ownership-gated** (`GET /api/upload/download-url/:key`) — resta un dominio separato, invariato da questa feature; un'eventuale trasformazione autenticata e non cacheable all'edge è un problema distinto, non affrontato qui.
- **AVIF nella prima release** — solo WebP e JPEG, per verificare costi/supporto runtime/cache hit rate prima di estendere il set di formati.
- **Image proxy per URL esterni** — zero fetch su domini terzi, trasformazione applicabile esclusivamente a chiavi R2 gestite da BeechCMS.
- **Filtri avanzati, watermarking, crop/focal point editor nel Dashboard** — nessun blur, contrasto, rotazione arbitraria o watermark; nessuna UI di crop visuale in questo sprint (predisposizione dati per Issue #381 non inclusa).
- **Componenti React JSX/UI dedicati** — solo utility pure TypeScript, nessun componente framework-specific nel core o nei package client.
- **Registro preset per-schema / per-content-type** — il catalogo preset è globale (env var), non personalizzabile a livello di singolo content type o campo in questa fase; emerso in sparring come possibile estensione futura ma non richiesto per v1.
