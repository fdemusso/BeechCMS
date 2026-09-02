# Idea Draft: Supporto Editor JSON con CodeMirror 6 (Issue #299)

## 1. Contesto e Problema

Attualmente nel monorepo BeechCMS:
1. **Esclusione Architetturale**: In `@beechcms/core` (`packages/core/src/dashboard-layout/seed-layout.ts`), l'insieme `UNSUPPORTED_BRANCH_TYPES` include hardcoded `'json'`. Di conseguenza, qualsiasi branch con `type: 'json'` definito in `seeds.ts` viene escluso da `generateDefaultLayout` e rimosso da `validateLayoutAgainstSeed`. Il campo non appare nell'Entry Editor né nel Layout Builder.
2. **Deficit di UX / Visualizzazione**: Il componente di fallback esistente in `apps/dashboard` (`JsonEdit`) utilizza una semplice `<textarea>` monocromatica per i campi JSON generici. In assenza di colorazione sintattica dei token (chiavi, valori, tipi), indentazione guidata e bracket matching, la lettura e la modifica di strutture gerarchiche complesse risulta faticosa e soggetta a errori di battitura (apici, virgole, parentesi mancanti), che vengono notificati solo a valle durante il salvataggio.

## 2. Soluzione Proposta

### A. Sblocco nel Core (`@beechcms/core`)
* Rimuovere `'json'` dal set `UNSUPPORTED_BRANCH_TYPES` in `packages/core/src/dashboard-layout/seed-layout.ts`.
* Includere il supporto a `type: 'json'` nella generazione automatica dei layout (`generateDefaultLayout`), valutando l'assegnazione a `FULL_WIDTH_BRANCH_TYPES` per garantire spazio visivo orizzontale adeguato all'editor di codice.
* Mantenere la conformità al Botanical Invariant e alle policy esistenti (`policies.visibility = 'hidden'`).

### B. Integrazione CodeMirror 6 (`apps/dashboard`)
* Sostituire la `<textarea>` generica in `apps/dashboard/src/components/fields/edit/json.tsx` con un editor leggero basato su **CodeMirror 6** (`@codemirror/lang-json`, `@codemirror/view`, `@codemirror/state` o `@uiw/react-codemirror`).
* **Funzionalità chiave di UX**:
  * **Syntax Highlighting**: Colori differenziati per chiavi JSON, stringhe, numeri, booleani e null, facilitando la scansione visiva della gerarchia.
  * **Bracket Matching**: Evidenziazione visiva immediata della chiusura delle parentesi graffe `{}` e quadre `[]`.
  * **Code Folding**: Gutter con possibilità di collassare/espandere blocchi e oggetti annidati.
  * **Linting / Diagnostica Live**: Segnalazione visiva immediata di errori di sintassi JSON inline con `lintGutter` e `jsonParseLinter`.
  * **Integrazione Design System**: Tema neutro coordinato con la palette di BeechCMS e supporto automatico a Dark/Light Mode tramite le variabili CSS (`hsl(var(--background))`, `hsl(var(--foreground))`, `hsl(var(--border))`).
  * **Preservazione Specializzazione Tags**: Mantenere inalterata la modalità a chip/badge per i branch `type: 'tags'` o con opzioni predefinite.

## 3. Scelte Architetturali ed Esclusioni (YAGNI)

* **No Monaco Editor**: Rifiutato (VETO) per eccessivo peso del bundle (~5MB+), necessità di web worker dedicati e complessità architetturale sproporzionata rispetto alle necessità.
* **No Nuove Proprietà Schema**: Nessuna proprietà `dashboard: { hidden: true }` ad-hoc; per nascondere campi dalla UI si usa la configurazione ufficiale `policies: { visibility: 'hidden' }` già presente nel Core.
* **Dipendenze Minime**: Sfruttare la modularità ad albero di CodeMirror 6 (impatto stimato ~70–90 KB gzip, zero worker esterni, compatibile Vite ed Edge).

## 4. Risultato Atteso

* I campi con `type: 'json'` definiti nei seed diventano visibili ed editabili nell'Entry Editor di default.
* L'esperienza di inserimento e revisione dati JSON è allineata qualitativamente al resto della dashboard (es. TipTap per richtext, Repeater ordinabile), garantendo leggibilità immediata e sicurezza sintattica.
