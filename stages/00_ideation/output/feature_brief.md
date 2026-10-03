# 1. Feature Definition and Core Value

Oggi Table, Gallery e Kanban sono tre viste fisse: il seed dichiara già quali tipi sono ammessi (`seed.dashboard.views`, con "table" sempre garantito), ma per ciascun tipo ammesso esiste **una sola istanza**, con id coincidente col tipo (`id === type`). La configurazione per-vista (titolo, conditional formatting) è tenuta solo in memoria e sparisce al reload — gap esplicitamente segnalato da un TODO nel codice attuale ("load and save view configuration at the user level"). Questo costringe i team di contenuto a un'unica lente per tipo di vista: ogni volta che serve un filtro o un raggruppamento diverso, la configurazione precedente viene sovrascritta, perché non esiste il concetto di "vista salvata" distinto dal "tipo di vista".

Il valore centrale della feature è elevare Table/Gallery/Kanban da viste singole fisse a **View Type**, ciascuno istanziabile N volte con configurazione nominata, condivisa e persistita (filtri, raggruppamento, aspetto, conditional formatting). Per sostenerlo, lo scaffolding già esistente (registry minimale `ViewRegistry`/`ViewDefinition`, allow-list seed-level) deve evolvere in un vero harness: un'interfaccia che collega il seed (operazioni SQL) al tipo di vista e alla toolbar, e che standardizza un concetto di "Elemento" condiviso (riga in Table, card in Gallery/Kanban) così che proprietà trasversali come il conditional formatting smettano di essere esclusive della Table e diventino una proprietà di qualunque vista.

# 2. Domain Boundaries and Business Rules

**Entità:**
- **Seed**: definizione di content type esistente, backing SQL. Continua a dichiarare `dashboard.views` come allow-list dei View Type permessi (`resolveAuthorizedViews`/`isViewAuthorized`, già in `packages/core`). Regola già implementata e da preservare: **"table" è sempre autorizzato**, indipendentemente dalla configurazione del seed — è il fallback universale e non può essere vietato.
- **View Type**: categoria di visualizzazione (oggi Table, Gallery, Kanban; riservati per il futuro altri tipi — Chart, Board, List, Calendar, Map, Timeline, Feed, Form, Dashboard — esposti in UI come placeholder visibili ma disabilitati, non selezionabili). Un View Type possiede la logica di rendering e la configurazione degli strumenti toolbar (`ViewDefinition.enabledTools`); non possiede dati.
- **Vista (istanza)**: configurazione nominata, persistita e condivisa, legata a esattamente un View Type e un content type (seed). Più istanze dello stesso View Type ammesso possono coesistere. Una Vista possiede: titolo, filtri, raggruppamento, aspetto, regole di conditional formatting, posizione nell'ordine dei tab. Le viste sono visibili identicamente a ogni utente con accesso a quel content type (proprietà condivisa/globale, non per-utente).
- **Elemento**: unità di rappresentazione per riga/card condivisa da tutti i View Type (row in Table, card in Gallery/Kanban). Espone verso l'harness un set uniforme di proprietà presentazionali, oggi limitato al conditional formatting (tono/colore + stile testo), valutabile a livello di intero elemento o di intersezione elemento/campo specifico.
- **Harness**: strato di interfaccia che collega il Seed (le sue operazioni dati SQL) al toolbar e al rendering di un View Type, e che standardizza il contratto dell'Elemento. Estende — non sostituisce — lo scaffolding `ViewRegistry`/`ViewDefinition` già esistente.

**Regole di dominio:**
- Un View Type non presente nell'allow-list `dashboard.views` del seed non deve essere creabile/selezionabile per quel content type, con "table" come unica eccezione sempre ammessa.
- Cancellare tutte le istanze di un View Type ammesso non-table è permesso; la content page deve allora mostrare uno stato vuoto centrato ("crea la tua prima vista") al posto di una toolbar/griglia vuota. Table ha sempre garantita almeno un'istanza.
- Il conditional formatting è una proprietà della Vista (non del Seed né della definizione di View Type) e deve avere lo stesso significato (tono colore, stile testo) sia che l'Elemento sia una riga Table, una card Gallery o una card Kanban — cambia solo la mappatura visiva (riga vs. card), non la semantica della regola.
- L'ordine delle viste (tab nello switcher) è stato per content type, riordinabile dall'utente via drag-and-drop, persistito e condiviso come il resto della configurazione della vista.
- L'editing degli entry è unificato: ogni View Type apre lo stesso Entry Editor per visualizzare/modificare un entry; nessun View Type mantiene una propria UI parallela di lettura/modifica.
- La generazione del layout di default dell'Entry Editor (nessun layout custom definito) deve collocare un singolo campo immagine/cover nella propria sezione a larghezza piena, in cima, prima degli altri campi, quando non è stato progettato un layout esplicito per quel seed.
- Tutti i View Type si rendono nello stesso grid/margini di pagina condivisi; un View Type controlla solo cosa succede dentro la propria area di contenuto, mai il chrome/margini circostanti.

# 3. Primary Requirements (User Stories)

* AS A content editor I WANT creare più viste nominate dello stesso View Type (es. due viste Table con filtri diversi) SO THAT posso passare da una prospettiva all'altra sullo stesso contenuto senza riconfigurare i filtri ogni volta.
* AS A content editor I WANT che le viste che creo, rinomino, riordino o cancello siano visibili a tutti i colleghi con accesso a quel contenuto SO THAT il team condivide un set coerente e collaborativo di prospettive.
* AS A content editor I WANT riordinare i tab delle viste trascinandoli SO THAT posso disporre le viste che uso di più per prime.
* AS A content editor I WANT applicare conditional color formatting a righe in Table, card in Gallery e card in Kanban (e a un campo specifico al loro interno) SO THAT posso segnalare visivamente gli entry in base ai loro dati indipendentemente dal view type che sto usando.
* AS A content editor I WANT che cliccare una card in Gallery apra l'entry direttamente nello stesso Entry Editor usato da Table e Kanban SO THAT visualizzare e modificare i contenuti funziona allo stesso modo in ogni view type.
* AS A seed author I WANT restringere quali view type sono selezionabili per il mio content type SO THAT posso evitare visualizzazioni che non hanno senso per quei dati, mantenendo Table sempre disponibile come fallback garantito.
* AS A content editor I WANT che il bottone "New entry" mostri un sottomenu di template (anche se non ancora funzionante) SO THAT l'interfaccia comunica già il futuro flusso di creazione basato su template.

# 4. Secondary Requirements and Logical Constraints

- La configurazione di vista (titolo, filtri, raggruppamento, aspetto, conditional formatting, ordine) deve essere persistita lato server e condivisa tra utenti — non più solo in-memory, chiudendo il TODO già presente nell'implementazione attuale.
- La configurazione Kanban esistente, persistita per content-type slug (`useKanbanViewConfig`), **non viene migrata** nel nuovo modello per-istanza-vista: viene scartata, e ogni seed riparte con una vista Kanban di default nel nuovo modello.
- Il picker "Aggiungi vista" deve elencare visivamente ogni View Type concettualmente previsto (Table, Gallery, Kanban più i tipi futuri), con i tipi non implementati mostrati disabilitati anziché nascosti, così che l'estensibilità dell'harness sia visibile senza essere selezionabile.
- Cancellare l'ultima istanza di un View Type non-table deve degradare in modo controllato verso lo stato vuoto centrato "crea la tua prima vista", non verso una toolbar/griglia rotta o vuota senza spiegazione.
- La generazione del layout di default dell'Entry Editor deve trattare come caso speciale un campo immagine/cover singolo (branch file, non gallery/asset-list) dandogli una sezione dedicata a larghezza piena in cima, quando non esiste un layout custom — oggi solo richtext/json/file multipli ricevono questo trattamento.
- Rimuovere il peek panel read-only dedicato della Gallery non deve regredire il comportamento attuale di gating sui permessi (sola visualizzazione per utenti senza `content:update`), che deve restare equivalente a quanto già fornito dalla shell di rendering dell'Entry Editor.
- Il sottomenu "New entry con template" è esplicitamente No-Op: deve renderizzarsi ed essere chiudibile ma non deve innescare alcuna logica di creazione entry.
- I View Type futuri (non ancora implementati) non introducono alcun comportamento a runtime: esistono solo come voci disabilitate nel picker e come identificatori riservati nel dominio View Type, in attesa di una loro futura feature dedicata.

# 5. Out of Scope (Discarded during sparring)

- Un cap sul numero di istanze per View Type o viste di default bloccate/non cancellabili definite dal seed — richiesta solo un'allow-list a livello di tipo.
- Costruire UI o logica funzionante per qualunque View Type oltre Table/Gallery/Kanban (Chart, Calendar, Map, Timeline, Feed, Form, Dashboard, Board, List) — restano placeholder disabilitati.
- Un picker di template "New entry" funzionante — il sottomenu è solo visivo, No-Op.
- Regole di "visibilità condizionale" / nascondere interamente un elemento — scartate durante lo sparring; resta in scope solo il conditional color/text-style formatting, come oggi in Table, reso però universale.
- Migrare la configurazione Kanban esistente (per-slug) nel nuovo modello di persistenza per-istanza-vista — esplicitamente scartato; si riparte da zero.
- Viste personali per utente — le viste sono solo condivise/globali, non un concetto di spazio di lavoro personale.
- Progettazione dello schema di database per la persistenza delle viste — demandata allo stage di Architettura, essendo questo documento una definizione di prodotto/requisiti.
