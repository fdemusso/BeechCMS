# Sprint: Elevated TipTap Experience

Questo documento delinea la strategia per trasformare l'attuale editor di testo basato su TipTap in un sistema di authoring di classe superiore, integrato profondamente con l'ecosistema BeechCMS.

## Obiettivi
- **Notion-like Experience**: Scrittura fluida con comandi rapidi e menu contestuali.
- **Premium Toolbar**: Implementazione di una barra degli strumenti completa (ispirata al "Simple Editor" di tiptap.dev) costruita con shadcn/ui.
- **Headless Power**: Sfruttare la natura headless di TipTap per un controllo totale dell'UI, utilizzando estensioni open-source (molte ex-Pro ora gratuite).
- **Dati Strutturati**: Preparare il sistema al salvataggio in formato JSON per massima flessibilità.

---

## Fase 1: Premium UI & Core Extensions
La priorità è fornire gli strumenti minimi necessari per articoli professionali con un'interfaccia moderna.

- [ ] **Dependencies Update**:
  - `npm install @tiptap/extension-placeholder @tiptap/extension-bubble-menu @tiptap/extension-floating-menu @tiptap/suggestion @tiptap/extension-image @tiptap/extension-link @tiptap/extension-table @tiptap/extension-table-header @tiptap/extension-table-row @tiptap/extension-table-cell`
- [ ] **Shadcn Toolbar**: Sostituire l'attuale toolbar base con una versione avanzata che includa:
  - Dropdown per i formati (H1, H2, H3, Text).
  - Toggle group per stili (Bold, Italic, Code, Link).
  - Popover per l'inserimento di link e tabelle.
- [ ] **Bubble Menu**: Menu contestuale "galleggiante" che appare alla selezione del testo per formattazione rapida.
- [ ] **Placeholder**: Istruzione "Scrivi qualcosa o digita / per i comandi..." (estensione `@tiptap/extension-placeholder`).
- [ ] **Accessibilità Base (A11y)**: gestione focus/keyboard per toolbar, bubble e slash menu (es. `Tab`/`Esc`, selezione comando via frecce, aria-label coerenti).
- [ ] **Internazionalizzazione (i18n) UI**: labels e messaggi dell'editor devono passare da un layer unico (es. `t("...")`) invece di stringhe hardcoded.

## Fase 2: Notion-style Authoring (Slash Commands)
Trasformare l'editor in un hub interattivo.

- [ ] **Slash Commands**: Implementazione del menu a comparsa alla pressione di `/` (usando `@tiptap/suggestion`).
- [ ] **Floating Menu**: Menu che appare sulle righe vuote per inserire rapidamente nuovi blocchi (Immagini, Liste, Tabelle).
- [ ] **Drag & Drop / Upload Integration**:
  - **Vincolo SYSTEM_MAP**: L'upload deve avvenire esclusivamente tramite `POST /api/upload` (Media Engine).
  - Implementazione del link tra TipTap e l'endpoint di upload esistente, salvando solo l'URL finale nel nodo Immagine.
- [ ] **Modalità inserimento “a prova di errore”**: stati di loading e failure per upload/link (nessun contenuto fantasma; possibilità di riprovare).

## Fase 3: Architettura a Blocchi & Botanical Consistency
Abbandonare l'HTML come formato di salvataggio primario, assicurando la compatibilità con il core.

- [ ] **JSON Persistence**: Modifica del Botanical Engine per supportare il salvataggio dello stato TipTap.
- [ ] **Schema versionato + Migrazione retro-compatibile HTML → JSON**:
  - `schemaVersion` incluso nel richtext JSON.
  - Import one-shot (runtime fallback o job) per contenuti preesistenti salvati in HTML; in caso di fallimento, degradare in read-only sicuro.
- [ ] **Core Integration & Validation**: Aggiornamento del tipo `richtext` in `@beech/core` affinché la validazione riconosca la struttura JSON.
- [ ] **Whitelisting dei nodi**: parser/validator accetta solo nodi/attributi controllati (blocco HTML arbitrario in attributi o contenuto).
- [ ] **Seed Linking (Botanical Spirit)**: Utilizzare i pattern di `@beech/core` per citare altre entità (Slash Commands) in modo coerente.
- [ ] **Entity Linking “end-to-end”**: nel nodo link/mention:
  - salvare riferimento stabile (id/slug del seed, non solo label),
  - risolvere in editor con preview card minima,
  - renderizzare nel consumer in modo deterministico (campi mancanti → fallback testuale).
- [ ] **Custom Node Views**: Componenti React per gestire nodi speciali (Immagini, Widgets).
- [ ] **Embed Node Views**: nodi embed controllati (video esterni, documenti, social) con editor dedicato e rendering safe.

## Fase 4: Frontend Delivery & Smart Rendering
Fornire gli strumenti per permettere a qualunque client di visualizzare i contenuti con facilità.

- [ ] **Universal Render Utility**: Funzione `renderRichText(json)` in `@beech/core` basata su `@tiptap/html`.
- [ ] **Styling System (Prose)**: Integrazione consigliata con `@tailwindcss/typography`.
- [ ] **Rendering “Safe by policy”**:
  - nessun rendering di HTML non sanificato,
  - sanitizzazione/normalizzazione attributi (link, immagini, embed),
  - output compatibile con CSP (evitare inline script/handler).
- [ ] **SSR/Static compatibility**: render deterministico e privo di dipendenze browser-only.

## Fase 5: Editorial Excellence & Polishing
Portare la qualità della scrittura al pari dei migliori editor professionali.

- [ ] **Typography Extension**: Automazione di virgolette intelligenti, trattini e simboli (`StarterKit` non li include).
- [ ] **Character Count & Stats**: Contatore in tempo reale con calcolo del tempo di lettura stimato.
- [ ] **Task List**: Supporto per checklist interattive (`@tiptap/extension-task-list`).
- [ ] **Underline & Highlight**: Integrazione grafia mancante e strumenti di evidenziazione.
- [ ] **Undo/Redo coerente**: inserimenti (upload, AI, entity linking) partecipano allo stack undo/redo.

## Fase 6: Advanced Layouts & Block Interaction
Rendere l'editor veramente "Notion-like" nella manipolazione dei blocchi.

- [ ] **DragHandle**: Integrazione del plugin ufficiale (ora open-source) per riordinare i blocchi trascinandoli.
- [ ] **Details / Accordion**: Supporto per sezioni espandibili/richiudibili direttamente nell'editor.
- [ ] **CodeBlockLowlight**: Se il CMS gestisce contenuti tecnici, integrazione di `lowlight` per syntax highlighting.
- [ ] **Navigazione a blocchi (Keyboard-first)**: selezione blocco, spostamento e inserimento da tastiera senza dipendere solo dal mouse.
- [ ] **Performance Budget**: durante digitazione/scroll mantenere latenza percepita bassa (nessun re-render globale; memoizzazione node view “heavy”).

## Fase 7: Deep CMS Integration & Focus
Fondere l'editor con l'esperienza di BeechCMS.

- [ ] **Media Gallery Picker**: Portale per scegliere immagini già caricate invece del solo upload diretto.
- [ ] **Focus Mode**: Modalità a tutto schermo per scrittura immersiva.
- [ ] **SEO Content Preview**: Analisi del testo per suggerimenti SEO in tempo reale.
- [ ] **Embed Picker controllato**: UI per inserire embed consentiti (es. YouTube/Vimeo) con whitelist domain, salvataggio del tipo + parametri minimi, rendering sicuro lato client.
- [ ] **Preview URL & Data Quality**: controlli rapidi in sidebar/toolbar (lunghezza titolo, presenza immagini, link interni validi).

## Fase 8: Custom AI Authoring (OpenRouter)
Potenziare la creazione di contenuti con l'intelligenza artificiale, mantenendo pieno controllo e zero costi fissi verso TipTap.

- [ ] **OpenRouter Integration**:
  - Collegamento dell'API di OpenRouter (OpenAI-compatible) tramite Cloudflare Workers.
  - Implementazione di funzioni editoriali: "Migliora stile", "Riassumi", "Correggi grammatica", "Espandi paragrafo".
- [ ] **Conditional AI UI**:
  - Logica di attivazione: i comandi AI (nello Slash Menu e nel Bubble Menu) appaiono **solo se** è configurata una `OPENROUTER_API_KEY` nel sistema.
- [ ] **Streaming Content**: Inserimento del testo generato dall'IA in tempo reale direttamente nell'editor (`editor.commands.insertContent`).
- [ ] **AI Editing “non distruttivo”**: sostituzione/patch al livello di selezione con preservazione formattazione quando possibile; possibilità di annullare con `Undo`.

---

## Sfide Tecniche e Vincoli Operativi
L'elevazione dell'editor comporta alcune sfide architettoniche da monitorare:

1. **AI Proxy & Security**:
   - *Difficoltà*: Non vogliamo esporre la chiave OpenRouter lato client.
   - *Soluzione*: Tutte le richieste AI devono passare per un proxy nel Worker di BeechCMS che gestisce l'autenticazione e il rate-limiting.
2. **Context Dependency (Media Library)**: 
   - *Difficoltà*: Il componente `richtext.tsx` deve rimanere isolato ma ha bisogno di accedere allo stato globale per sfogliare la Media Gallery.
   - *Soluzione*: Utilizzare un pattern di "Iniezione di Dipendenze" (Dependency Injection).
3. **Bundle Size & Performance**: 
   - *Difficoltà*: L'aggiunta di molte estensioni e logica AI appesantisce il bundle.
   - *Soluzione*: Uso rigoroso del **Lazy Loading** e componenti "heavy" caricati on-demand.
4. **React 19 Compatibility**:
   - *Difficoltà*: Garantire che le estensioni custom per l'IA siano compatibili con il nuovo rendering di React 19.

5. **Sanitizzazione & XSS (RichText JSON)**:
   - *Difficoltà*: JSON richtext può veicolare link/attributi pericolosi se non validati.
   - *Soluzione*: validazione server-side/ingress + sanitizzazione in `renderRichText` + whitelisting attributi/nodi.

6. **Migrazione dati senza downtime**:
   - *Difficoltà*: contenuti già salvati in HTML devono continuare a funzionare.
   - *Soluzione*: import retro-compatibile (runtime fallback o job) con marcatura `schemaVersion` e test di regressione rendering.

> [!IMPORTANT]
> **Pieno Controllo (No Vendor Lock-in)**
> L'integrazione IA tramite OpenRouter ci permette di cambiare modello (GPT-4, Claude, Llama 3) in qualunque momento senza dover pagare abbonamenti a TipTap Pro o dipendere dai loro servizi cloud.

> [!IMPORTANT]
> **Il Principio della Bolla**
> Nonostante la potenza, il codice di TipTap deve rimanere contenuto nella sua "bolla" (`components/fields/edit/richtext.tsx`). Solo il parser e le tipizzazioni devono fuoriuscire verso `@beech/core`.

---

## Esclusioni Esplicite (per questo sprint)
- **Collaborazione real-time**: non incluso (gestione fuori scope).
- **Storia versioni / confronto revisioni**: gestita esternamente (non incluso nello sprint).

---

## Criteri di Completezza “Competitive 2026”
Per considerare lo sprint “forma finale” per un blog editor moderno (senza collab e senza revisione inside editor), devono essere vere tutte queste condizioni:
- l’editor mantiene un’ottima latenza percepita (digitazione e navigazione fluide) grazie a lazy loading e minimizzazione re-render,
- il salvataggio è stabile nel tempo grazie a `schemaVersion` e validazione del JSON,
- il rendering è safe by policy (nessun HTML/attributo pericoloso) e identico tra editor e consumer,
- embed, link interni e nodi speciali hanno un flusso completo (picker -> salvataggio -> preview editor -> rendering).
