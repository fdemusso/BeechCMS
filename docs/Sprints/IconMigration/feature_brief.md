# 1. Feature Definition and Core Value

Migrazione dell'intero set di icone dell'applicazione Web Dashboard (`apps/dashboard`) dal doppio set attuale (`lucide-react` e `@radix-ui/react-icons`) alla nuova libreria unificata `reicon-react`.

La finalità di questo intervento è unificare l'identità visiva della dashboard secondo il nuovo design system Reicon, eliminando la ridondanza di dipendenze iconografiche, migliorando la pulizia del bundle client e garantendo l'omogeneità visiva su tutti i componenti UI (navigazione, form di editing, controlli dell'editor di testo e automazioni).

# 2. Domain Boundaries and Business Rules

### Entità Coinvolte:
- **UI Components (`apps/dashboard/src/components/ui/`)**: Componenti di base React/Shadcn (es. Button, Select, Dialog, Calendar, Checkbox, DropdownMenu, Sonner).
- **Navigation Components (`apps/dashboard/src/components/nav-*.tsx`, `config/dashboard-menu.ts`)**: Componenti e configurazioni della sidebar e del menu di navigazione.
- **Field & Content Editors (`apps/dashboard/src/components/fields/`, `components/ui/minimal-tiptap/`)**: Componenti di editing campi (Media, Relation, Repeater, JSON) e toolbar dell'editor Rich Text (TipTap).
- **Automation Workflows (`apps/dashboard/src/features/automations/`)**: Componenti dei workflow e trigger/actions/cron scheduler.
- **Icon Registry (`apps/dashboard/src/lib/icon-registry.ts`)**: Mappa di risoluzione a stringa per icone dinamiche usate dai Seed e dalle collezioni del CMS.
- **Package Manifest (`apps/dashboard/package.json`)**: Configurazione delle dipendenze del modulo dashboard.

### Regole di Business:
- **Sostituzione Diretta (No Wrapper):** Le icone di `reicon-react` devono essere importate direttamente nei componenti interessati. È vietato creare layer di astrazione o componenti adapter intermedi (es. `components/ui/icon.tsx`).
- **Nessuna Dipendenza Residua:** Al termine della migrazione, sia `lucide-react` che `@radix-ui/react-icons` devono essere totalmente disinstallati da `apps/dashboard`. Nessun pacchetto legacy deve rimanere come fallback.
- **Match Visivo Diretto:** In assenza di un'icona Reicon perfettamente identica 1:1, deve essere adottata l'icona Reicon concettualmente e visivamente più affine.
- **Preservazione API `icon-registry`:** Il registro `src/lib/icon-registry.ts` deve continuare a esporre la funzione `resolveIcon(name?: string)` e l'array `ICON_NAMES` con le medesime chiavi di stringa per garantire la retrocompatibilità con i seed esistenti, restituendo però i componenti `reicon-react`.

# 3. Primary Requirements (User Stories)

* AS A Frontend Developer I WANT TO import icons directly from `reicon-react` SO THAT the dashboard uses a single lightweight and modern icon set.
* AS A Dashboard User I WANT TO see a uniform and consistent visual style across all navigation items, form inputs, toolbars, and workflow components SO THAT the user interface feels polished and coherent.
* AS A CMS Administrator I WANT TO select and display seed/collection icons via string keys using `icon-registry.ts` SO THAT existing content models continue to render correct icons without breaking.

# 4. Secondary Requirements and Logical Constraints

- **Tailwind CSS Compatibility:** Tutte le icone Reicon inserite devono supportare correttamente le classi di utility Tailwind CSS attualmente in uso (es. `className="size-4"`, `className="size-5"`, `className="shrink-0"`, `text-muted-foreground`, ecc.).
- **Aggiornamento della Suite di Test:** I file di test esistenti che importano o verificano il registro delle icone (es. `src/test/lib/icon-registry.test.ts`) devono essere aggiornati per verificare la corretta risoluzione delle nuove icone `reicon-react`.
- **Pulizia del Bundle:** Verificare e rimuovere tutti gli import residui inutilizzati di `LucideIcon` o tipi legati alle vecchie librerie.

# 5. Out of Scope (Discarded during sparring)

- **Layer di Astrazione Custom (`components/ui/icon.tsx`):** Scartato per evitare sovra-ingegnerizzazione e codice superfluo (YAGNI).
- **Fallback a `lucide-react` / `@radix-ui/react-icons`:** Scartato per evitare dipendenze multiple nel bundle e incoerenza estetica.
- **Modifiche al Core o Altri Package:** L'intervento è strettamente limitato al perimetro di `apps/dashboard`.
