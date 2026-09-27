# 1. Feature Definition and Core Value

BeechCMS non ha oggi alcun supporto nativo alla localizzazione dei contenuti. Chi vuole servire più lingue è costretto a uno dei due compromessi standard del settore: duplicare i campi nello schema (`title_it`, `title_en`, ...), degradando DX e usabilità del pannello, oppure duplicare l'intero record per lingua, frammentando relazioni, inventario e analytics.

La feature introduce la **Field-Level Localization**: i campi testuali/contenutistici abilitati (`text`, `richtext`, `json`) memorizzano un dizionario JSON compatto (`{"it": "Scarpa", "en": "Shoe"}`) nella stessa colonna `TEXT` già esistente, preservando id, relazioni FK e metriche intatte — zero tabelle ponte, zero record duplicati.

Il valore indispensabile non è solo tecnico ma di **modello di controllo**: BeechCMS possiede già un motore di editing runtime dello schema (Seed/Branch editabili da Dashboard senza redeploy, senza migrazione). Questa feature attiva la i18n sullo stesso motore, come un'opzione di campo tra le altre — il che significa che **è chi compra/gestisce il sito, non lo sviluppatore, ad attivare la localizzazione su un campo**, in qualsiasi momento, senza toccare codice. Attivare/disattivare `localized` su un Branch è un'operazione di solo metadato: nessuna DDL, nessuna migrazione, nessun backfill, perché il tipo di colonna fisica non cambia mai.

# 2. Domain Boundaries and Business Rules

**Entità logiche coinvolte:**
- **Locale Configuration** (livello progetto): `locales: string[]` + `defaultLocale: string`, persistiti come chiavi nel `site_settings` esistente (key-value store), con default sicuro (`locales: [defaultLanguage]`) che rende la feature invisibile a un progetto mono-lingua.
- **Branch localizzabile**: proprietà opzionale `localized?: boolean` su un Branch di tipo `text | richtext | json`. Nessuna entità "seed localizzato" esiste: un Seed è localizzato solo per derivazione (possiede ≥1 branch con `localized: true`).
- **Valore Localizzato**: il dizionario JSON stesso, sempre memorizzato nella colonna nativa del branch, mai in una tabella separata.

**Confine architetturale con il motore Seed/Branch runtime (già esistente):** questa feature **non introduce una nuova superficie di controllo schema** — riusa quella già presente per la modifica runtime di content type e campi. Il toggle "Localizzato" è un'opzione di branch tra le altre (stesso livello di `numberOptions`, `fileOptions`), non un sotto-sistema separato.

**Confine con il sistema di classificazione dati (4 livelli):** un Branch con `localized: true` **non può** avere una classificazione che comporta storage cifrato o hashato (`confidential`/`restricted`). Il valore memorizzato per un campo del genere è un blob cifrato o un digest, non un dizionario JSON leggibile: applicare l'estrazione per-lingua a un valore del genere non ha senso semantico e romperebbe la decifratura. Questa combinazione deve essere **rifiutata esplicitamente in validazione**, non ignorata silenziosamente.

**Confine con filtri, ordinamento e ricerca full-text:** un campo localizzato resta filtrabile, ordinabile e ricercabile, ma sempre **attraverso la lingua attiva della richiesta**, mai contro il JSON grezzo. L'indicizzazione full-text copre simultaneamente tutti i valori di tutte le lingue presenti nel dizionario, indipendentemente da quante lingue sono registrate nella configurazione di progetto — aggiungere o rimuovere una lingua da `locales` non richiede mai reindicizzazione.

**Regola di dominio non negoziabile — opt-in a tre livelli indipendenti:**
1. Livello progetto: se `locales` non è configurato, la feature è totalmente inattiva.
2. Livello Seed: nessun flag seed-wide; un Seed può avere un mix arbitrario di branch localizzati e non.
3. Livello Branch: ogni branch attiva la localizzazione individualmente; default `false`.

**Regola di dominio non negoziabile — nessuna perdita di dati:** rimuovere una lingua da `locales` non cancella mai le traduzioni già scritte per quella lingua; restano come chiavi orfane nel dizionario finché uno strumento esplicito di pulizia (fuori scope v1) non viene invocato. Coerente con l'invariante "additive-only, no data loss" che già governa ogni altra modifica di schema a runtime in BeechCMS.

# 3. Primary Requirements (User Stories)

* AS A site owner non tecnico I WANT attivare la localizzazione su un campo di contenuto direttamente dal Seed Builder nella Dashboard SO THAT posso offrire contenuti multilingua senza assumere uno sviluppatore o attendere un deploy.

* AS A content editor I WANT un unico selettore di lingua nell'header dell'Entry Editor che aggiorna contestualmente tutti i campi localizzati SO THAT non devo cercare tab di lingua separati per ogni campo mentre scrivo.

* AS A content editor I WANT vedere quali campi non sono ancora tradotti nella lingua attiva, con un'azione rapida "Copia dal valore predefinito" SO THAT posso individuare e colmare le lacune di traduzione senza indovinare.

* AS A frontend developer I WANT che le richieste pubbliche a `apps/api` risolvano automaticamente la lingua (parametro `?lang`, header `Accept-Language`, o default di progetto) SO THAT ricevo un payload piatto e pronto al rendering senza fare parsing di alcun dizionario lato client.

* AS A frontend developer I WANT un metodo `.lang(code)` sul query builder dell'SDK tipizzato SO THAT posso richiedere una lingua specifica in modo dichiarativo senza costruire manualmente la query string.

* AS AN unauthenticated site visitor I WANT che la ricerca full-text trovi contenuti indipendentemente dalla lingua in cui ho digitato la query SO THAT la ricerca non esclude silenziosamente contenuti tradotti.

* AS A BeechCMS core maintainer I WANT che attivare/disattivare la localizzazione su un campo sia un'operazione di solo metadato, senza migrazione né riscrittura dati SO THAT la feature non comprometta mai le garanzie di DDL additiva già offerte dal motore Seed runtime.

* AS A platform operator I WANT che rimuovere una lingua dall'elenco del progetto non cancelli o corrompa mai le traduzioni già salvate SO THAT un errore di configurazione non possa mai causare perdita silenziosa di dati.

# 4. Secondary Requirements and Logical Constraints

**Vincoli sui tipi di campo:**
- `localized` è valido esclusivamente su branch `text`, `richtext`, `json`. Su qualsiasi altro tipo (`number`, `boolean`, `date`, `file`, `tags`, `relation`, `repeater` — inclusi i sub-branch di un repeater) la validazione dello schema **rifiuta** esplicitamente la combinazione, non la ignora silenziosamente.
- `localized: true` è incompatibile con una classificazione che comporta storage `encrypt` o `hash` (branch `confidential`/`restricted`); rifiutato in validazione allo stesso modo.
- Per `json`, la localizzazione è **whole-value swap** al livello top (`{"it": {...}, "en": {...}}`): nessuna traduzione annidata dentro la struttura. Traduzione parziale di sotto-chiavi è esplicitamente fuori scope.

**Normalizzazione e fallback:**
- Un payload che scrive una stringa semplice su un campo localizzato viene automaticamente incapsulato sotto `defaultLocale`. Stringhe vuote e chiavi di lingua non registrate vengono ripulite in scrittura.
- In lettura, la risoluzione segue sempre la catena: valore nella lingua richiesta → valore in `defaultLocale` → valore grezzo pre-esistente (per contenuti scritti prima che il campo diventasse localizzato). Questa catena garantisce che **attivare `localized` su un campo con righe già esistenti non richieda mai un job di backfill**: il fallback gestisce il dato legacy in modo trasparente fin dalla prima query.
- `requiredOnCreate`/`requiredOnUpdate` su un branch localizzato validano la presenza della sola chiave `defaultLocale`, non di tutte le lingue registrate.

**API pubblica e negoziazione:**
- Risoluzione lingua con priorità: parametro `?lang=<code>` → header `Accept-Language` → `defaultLocale` di progetto.
- Risposta di default sempre "piatta" (zero parsing JSON lato client); modalità `?lang=all` (o `?lang=*`) per ottenere il dizionario completo, riservata a client speciali/backoffice/export.
- La lingua risolta entra nella chiave di cache edge; header `Vary: Accept-Language` applicato automaticamente.

**Dashboard UX:**
- Selettore di lingua unico nell'header dell'Entry Editor, non tab/controlli duplicati per campo.
- Indicatore visivo di fallback quando la lingua attiva non ha ancora un valore, con azione rapida di copia dal default.
- Indicatore sintetico di completamento traduzioni nella scheda dell'articolo.

**Compatibilità e non-distruttività:**
- Un progetto senza `locales` configurato non osserva alcuna differenza di comportamento rispetto a oggi.
- Un Seed può avere qualsiasi combinazione di branch localizzati/non localizzati.
- Rimuovere una lingua da `locales` non tocca mai i dati già scritti; è un'operazione di sola configurazione. Un eventuale strumento di pulizia delle chiavi orfane è un'estensione futura, non parte di questa v1.

# 5. Out of Scope (Discarded during sparring)

- **Localized System Slugs (URL Slugs Tradotti)** — lo slug resta identificatore univoco globale; nessun routing/alias differenziato per lingua.
- **Traduzione Automatica Integrata (AI / DeepL out-of-the-box)** — nessuna integrazione nativa; delegabile a script esterni o al tool MCP.
- **Traduzione dell'Interfaccia Dashboard (UI i18n)** — ambito esclusivamente Content i18n, non i testi/menu della console admin.
- **Permessi di Modifica per Singola Lingua (RBAC granulare)** — nessuna restrizione tipo "editor X può modificare solo la lingua DE"; i permessi di scrittura restano unificati sul record.
- **Traduzione annidata/parziale dentro un campo `json`** — solo whole-value swap al livello top.
- **Localizzazione di `number`, `boolean`, `date`, `file`, `tags`, `relation`, `repeater`** — esclusi per semantica di dominio (vedi §2) o per complessità sproporzionata (repeater).
- **Localizzazione di campi `confidential`/`restricted`** (storage cifrato/hashato) — combinazione incompatibile e rifiutata in validazione.
- **Strumento di purge delle chiavi di lingua orfane** dopo rimozione di una lingua da `locales` — la non-distruttività è garantita, la pulizia attiva è un'estensione futura.
- **Multi-currency / formattazione numerica per mercato** — dominio distinto dalla lingua, non affrontato qui.
