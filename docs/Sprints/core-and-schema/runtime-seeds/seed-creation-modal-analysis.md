# Sprint 07: Seed Creation Modal Analysis

## Obiettivo
Analizzare la fattibilità di sostituire l'attuale `SeedEditorDialog` (in `/admin/settings?tab=content-types`) con `EntryEditorDialog`, integrando l'approccio di `create-entry-form.tsx`, per unificare l'interfaccia di creazione dei Seed (runtime seeds) con quella dei contenuti standard.

## Analisi dei componenti

### 1. `EntryEditorDialog`
- **Funzione:** È il modale universale per la creazione/modifica delle entry dei contenuti.
- **Meccanismo:** È **schema-driven**. Legge la definizione del `Seed`, usa `LayoutRenderer` e itera sui `Branch` per renderizzare dinamicamente i componenti `FieldEdit`.
- **Limiti attuali:** Per creare un Seed usando `EntryEditorDialog`, il Seed stesso dovrebbe essere modellato come una "Entry" di un "Meta-Seed". Tuttavia, un Seed ha proprietà complesse:
  - Campi stringa (slug, label).
  - Campi booleani (allowDrafts, ecc.).
  - Proprietà nidificate (`dashboard`).
  - **Un array dinamico di oggetti** (`branches`).
- Attualmente, `@beechcms/core` (`BranchType`) **non supporta** tipi di dato come `array` o `repeater` per oggetti complessi.

### 2. `create-entry-form.tsx`
- **Funzione:** Form per la configurazione delle automazioni (Azione "Create Entry").
- **Meccanismo:** Utilizza `useFieldArray` di `react-hook-form` per gestire una lista dinamica di mappature (`field_map`), permettendo di aggiungere/rimuovere righe dinamicamente (es. `targetAlias` <- `sourceAlias`).
- **Valore per questo task:** Rappresenta il pattern esatto necessario per gestire dinamicamente l'array `branches` di un Seed all'interno di un form unificato.

## Strategia per unificare le interfacce

Per utilizzare `EntryEditorDialog` per la creazione dei Seed, ci sono due approcci principali:

### Approccio 1: Full Schema-Driven (Creazione di un "Meta-Seed")
Questo approccio spinge al massimo l'architettura schema-driven del CMS.
1. **Nuovo BranchType `repeater` / `array` / `sub-seed`:**
   Dobbiamo introdurre un nuovo tipo di campo nel motore Botanical (`packages/core/src/types.ts`) che supporti un array di oggetti strutturati.
2. **Implementazione del FieldRenderer:**
   Creare un nuovo componente `FieldEditRepeater` (ispirato a `create-entry-form.tsx` usando `useFieldArray`) che gestisca la lista di oggetti nidificati. Questo componente verrà registrato nel `fieldRegistry`.
3. **Definizione del Meta-Seed `_seed`:**
   Creare una definizione di Seed di sistema per descrivere la struttura di un Seed:
   - `label` (text)
   - `slug` (text)
   - `dashboardIcon` (text), ecc.
   - `branches` (repeater)
4. **Adattamento API / Hook:**
   `EntryEditorDialog` dovrebbe essere istruito su come comportarsi quando si salva un'entry di tipo `_seed` (le chiamate API andrebbero inviate all'endpoint dei seed `POST /api/seeds` anziché `POST /api/content/_seed`).

### Approccio 2: Refactoring Visivo e Condivisione Componenti
Se l'Approccio 1 richiede modifiche troppo profonde al Botanical Engine, un approccio più "soft" consiste nel riscrivere `SeedEditorDialog`:
1. **Mantenere un Dialog separato (`SeedEditorDialog`), ma strutturarlo esattamente come `EntryEditorDialog`**: Stesso header, stesso scrollable body, stessa gestione degli errori (alert) e stesso footer fisso in basso.
2. **Utilizzare FormLayout/LayoutRenderer "Simulato"**: Potremmo definire uno schema locale (Zod) e far generare i campi standard (general, dashboard) dal motore schema-driven di `EntryEditorDialog` per i campi semplici.
3. **Riutilizzare l'approccio `create-entry-form.tsx` per i Branches:** Mantenere una sezione custom per gestire i `branches` tramite `useFieldArray` e lo stile UI dei campi inline.

## Conclusioni

**Sì, è possibile unificare l'interfaccia, ma richiede un importante lavoro architetturale.**

L'approccio più allineato con la filosofia di Beech CMS (Approccio 1) richiede di potenziare il Botanical Engine per supportare campi di tipo "array di oggetti". Il pattern di `create-entry-form.tsx` (`useFieldArray`) è la chiave per sviluppare il FieldRenderer per questo nuovo tipo di dato.

Fino a quando `@beechcms/core` non supporterà i campi "repeater/array", la sostituzione *diretta* del modale con `EntryEditorDialog` non è possibile "out of the box", ma richiede l'implementazione del BranchType adeguato oppure l'adozione dell'Approccio 2 (simulazione architetturale ma stessa UI).
