# 1. Feature Definition and Core Value

Nei sistemi headless moderni, i campi JSON rappresentano la via primaria per memorizzare configurazioni strutturate, schemi dinamici e metadati di integrazione. In BeechCMS, i campi con tipologia JSON sono attualmente bloccati a livello di Core nell'engine di layout, impedendo la loro visualizzazione ed editing nei form della dashboard; laddove presenti come fallback, vengono renderizzati tramite una semplice area di testo monocromatica priva di convalida in tempo reale, evidenziazione sintattica e ausili visivi.

Questa feature sblocca il supporto nativo per i campi JSON nel motore di layout e introduce un editor visuale specializzato basato su CodeMirror 6. L'obiettivo essenziale è consentire a sviluppatori e content editor di visualizzare, revisionare e manipolare dati JSON strutturati in modo sicuro, ergonomico e leggibile, eliminando gli errori di digitazione e allineando l'esperienza utente agli standard qualitativi degli altri campi complessi del CMS.

# 2. Domain Boundaries and Business Rules

### Entità Logiche Coinvolte
* **Branch Definition (Core Engine)**: L'entità di schema che definisce il tipo di dato. Il tipo JSON cessa di appartenere ai tipi non supportati dal Layout Builder e viene promosso a tipo con vincolo a tutta larghezza.
* **Layout Engine (Core Layout)**: Il modulo responsabile della generazione del layout predefinito e della validazione strutturale delle sezioni. Impone la regola che ogni campo JSON debba risiedere esclusivamente in una sezione isolata a colonna singola.
* **Layout Builder (Dashboard Feature)**: L'interfaccia visiva di configurazione del form. Regola le interazioni di trascinamento e il selettore di colonne, impedendo la compresenza di campi JSON con altri campi o la suddivisione della sezione in più colonne.
* **Entry Editor Form & Validation (Dashboard Feature)**: L'orchestratore del form dell'entry. Mantiene lo stato transitorio durante la digitazione, convalida la conformità sintattica prima del salvataggio e serializza il dato strutturato per le API.
* **JSON Field Component (Dashboard Fields)**: Il componente visivo di editing. Incapsula l'editor di codice per i payload generici, preservando la logica esistente a badge per i campi tag con opzioni predefinite.

### Regole di Business e Invarianti
1. **Invariante Full-Width nel Layout**: Il campo JSON è vincolato a sezioni a una singola colonna a tutta larghezza. È vietato inserire un campo JSON in sezioni a due, tre o quattro colonne, ed è vietato affiancarlo ad altri campi nella stessa sezione.
2. **Conformità del Layout Predefinito**: Durante la generazione automatica del layout da uno schema Seed, ogni campo JSON deve ricevere automaticamente una sezione dedicata a tutta larghezza.
3. **Contratto Dati Rigoroso**: Verso l'API e il database, il valore deve essere sempre un oggetto o un array valido. Una stringa non valida non può mai essere inviata al backend.
4. **Normalizzazione del Valore Vuoto**: Se il campo è vuoto o viene completamente svuotato dall'utente, il valore inviato e persistito deve normalizzarsi a un oggetto JSON valido vuoto, evitando campi corrotti o valori nulli non gestiti.
5. **Preservazione dei Tag Predefiniti**: I campi che utilizzano opzioni predefinite per la selezione di tag devono continuare a utilizzare la visualizzazione a badge colorati; l'editor di codice subentra esclusivamente per JSON generici o tag aperti.

# 3. Primary Requirements (User Stories)

* AS A Content Editor I WANT visualizzare i dati JSON con evidenziazione sintattica colorata SO THAT possa distinguere immediatamente chiavi, valori numerici, stringhe e booleani.
* AS A Content Editor I WANT ricevere una segnalazione immediata degli errori di sintassi inline durante la digitazione SO THAT possa correggere parentesi, apici o virgole mancanti prima di tentare il salvataggio dell'entry.
* AS A Content Editor I WANT che il JSON venga formattato e indentato automaticamente all'apertura SO THAT possa leggere comodamente metadati o configurazioni autogenerate senza doverli decodificare manualmente su una sola riga.
* AS A Content Editor I WANT poter collassare ed espandere oggetti e array nidificati SO THAT possa navigare strutture dati gerarchiche senza disperdere la concentrazione.
* AS A Developer I WANT che i campi JSON definiti nei Seed appaiano automaticamente nell'Entry Editor SO THAT non debba ricorrere a configurazioni manuali per esporli nella dashboard.
* AS A Developer I WANT che il Layout Builder impedisca il posizionamento scorretto del campo JSON in colonne strette SO THAT l'editor mantenga sempre lo spazio visivo orizzontale necessario per lavorare.
* AS A Content Editor I WANT poter consultare il JSON in modalità di sola lettura quando non ho i permessi di modifica SO THAT possa visualizzare i metadati formattati senza rischiare alterazioni accidentali.

# 4. Secondary Requirements and Logical Constraints

### Comportamento e Dimensionamento dell'Editor
* **Altezza e Scorrimento**: L'editor deve avere un'altezza minima e un'altezza massima controllata, attivando uno scorrimento verticale interno per impedire che documenti estesi occupino eccessivo spazio verticale nell'interfaccia.
* **Scorrimento Orizzontale e Ritorno a Capo**: Deve essere abilitato il wrapping delle linee o lo scorrimento orizzontale fluido interno, prevenendo deformazioni del contenitore modale della dashboard.
* **Ausili Visivi**: L'editor deve includere indicatori visivi di corrispondenza delle parentesi aperte e chiuse, numeri di riga laterali e indicatore visivo delle pieghe di codice.

### Gestione dello Stato e Transizioni
* **Stato Transitorio durante la Digitazione**: Durante l'interazione dell'utente, lo stato locale del form deve poter contenere la stringa in corso di modifica, senza scatenare parsing bloccanti o errori fatali sul form genitore.
* **Intercettazione del Submit**: Al momento del salvataggio dell'entry (sia per bozze che per pubblicazioni definitive), il form deve verificare la validità sintattica del testo presente nell'editor. In presenza di errori di sintassi, il salvataggio deve essere interrotto e l'utente deve essere notificato tramite un messaggio di errore chiaro che indica il campo non valido.
* **Serializzazione Automatica**: Prima dell'invio all'API, il testo JSON valido deve essere convertito nella corrispondente struttura a oggetti nativa richiesta dallo schema di validazione del Core.
* **Rispetto dello Stato Read-Only**: In presenza di permessi di sola visualizzazione o form bloccato, l'editor deve impedire la modifica del testo e la digitazione, mantenendo attive la formattazione, la colorazione sintattica, la possibilità di selezionare il testo e di collassare i nodi.

### Vincoli del Layout Builder
* **Blocco nel Drag-and-Drop**: Il trascinamento di un campo JSON verso una sezione che contiene già altri campi, oppure verso sezioni con più di una colonna, deve essere rifiutato mostrando all'utente una notifica di avviso coerente con i vincoli dei campi a tutta larghezza.
* **Blocco Suddivisione Colonne**: Il menu contestuale di configurazione delle colonne di una sezione contenente un campo JSON non deve permettere la suddivisione in due o più colonne.
* **Resilienza del Validatore di Layout**: Il motore di validazione del layout a livello Core deve garantire la conformità delle sezioni, ripristinando o isolando automaticamente configurazioni non lecite.

# 5. Out of Scope (Discarded during sparring)

* **Monaco Editor / VS Code Embedded**: Escluso categoricamente per evitare un impatto proibitivo sul peso del pacchetto applicativo, la necessità di configurare web worker dedicati e una complessità architetturale ingiustificata per un campo form.
* **Supporto a Sezioni Multi-Colonna (1/2, 1/3, 1/4)**: Scartata la possibilità di collocare campi JSON in sezioni affiancate a più colonne; il campo richiede una sezione isolata a tutta larghezza per preservare l'integrità visiva dei gutter e la leggibilità.
* **Visualizzatore Grafico ad Albero (Tree View / Schema Form Dinamico)**: Esclusa qualsiasi visualizzazione a nodi interattivi stile form dinamico o ispettore ad albero; l'interazione rimane focalizzata sull'editing testuale strutturato.
* **Validazione contro JSON Schema personalizzato**: Esclusa la definizione o validazione a runtime contro schemi JSON Schema o JSON Type Definition personalizzati all'interno del branch; la convalida sintattica copre la correttezza del formato JSON standard.
* **Nuove Proprietà di Schema per Visibilità**: Esclusa l'introduzione di proprietà personalizzate ad-hoc nello schema dei Seed per nascondere i campi; la visibilità è regolata esclusivamente tramite le convenzioni e le policy di visibilità già previste dal Core.
* **Persistenza di Valori Nulli su Svuotamento**: Escluso l'invio di valori nulli o stringhe vuote quando il campo viene cancellato; il sistema converge sempre su un oggetto JSON valido vuoto.
