# 1. Feature Definition and Core Value

Un campo "scelta" (esempio: livello `tier` con voci free / pro / enterprise) oggi può essere dichiarato in due modi incoerenti: come testo con elenco di opzioni (valore singolo salvato come stringa) oppure come tag con elenco di opzioni (array). I seed demo dichiaravano tag, ma il form instradava il campo al selettore del testo, che emetteva una stringa: errore "expects type 'array' but received 'string'" e valore non caricato aprendo una entry. Inoltre l'elenco di opzioni non è vincolante e il colore di ogni opzione deriva dalla sua posizione nell'elenco (palette fissa), non da una scelta esplicita.

Problema reale: una scelta chiusa è un'etichetta, non testo libero. Trattarla come testo è un errore concettuale del modello.

Soluzione: il testo con opzioni sparisce come tipo di campo a scelta. Lo sostituiscono i tag con opzioni, con modalità singola o multipla. Il dato è sempre un array. Ogni opzione ha un valore univoco e un colore esplicito. L'elenco di opzioni diventa vincolante. Valore: un unico modello coerente per tutte le scelte, validazione reale, colori scelti dall'autore del seed, e un asse unico per kanban, ordinamento e raggruppamento.

# 2. Domain Boundaries and Business Rules

**Entità coinvolte**
- **Seed / Branch (campo di tipo tag):** definisce nome, opzioni, modalità singola/multipla, obbligatorietà. Unica fonte di verità dello schema. Le opzioni sono metadati statici del seed, non persistiti nei dati delle entry.
- **Opzione:** coppia (valore, colore). Il valore è l'identità effettiva e univoca; il colore è esclusivamente presentazionale e vive solo nel seed, mai nell'entry.
- **Entry (contenuto):** conserva solo i valori scelti, sempre come array di stringhe.
- **Validatore del core (Botanical Engine):** unica autorità sulle regole di validità del valore (appartenenza alle opzioni, cardinalità, duplicati, obbligatorietà). Form, API, import e MCP si limitano a conformarsi.
- **Validazione del seed (boot):** rifiuta seed malformati prima che il sistema parta.
- **Dashboard (form, tabella, gallery, kanban, toolbar, seed builder):** consumatori di presentazione e configurazione. Nessuna regola di validità propria.
- **Generatore di tipi, fingerprint dello schema, piano/applicazione dello schema (CLI e MCP):** devono riflettere la nuova forma delle opzioni e la modalità.

**Regole ferree**
1. Il campo di testo con opzioni non esiste più. Un seed che dichiara opzioni su un campo di testo è un errore fatale al boot, con messaggio che indica i tag come sostituto. Nessun ignoro silenzioso.
2. Le opzioni dei tag hanno forma ordinata di coppie (valore, colore). L'ordine è significativo (menu a tendina e colonne kanban). Valori univoci, verificati al boot.
3. Il colore è obbligatorio per ogni opzione, solo formato esadecimale.
4. Se le opzioni sono dichiarate, devono contenere almeno una voce. Opzioni vuote = errore fatale al boot.
5. Una semplice lista di stringhe come opzioni è rifiutata al boot. Nessuna doppia forma tollerata.
6. Il flag di cardinalità esistente (usato già per file e relazioni) viene riutilizzato; nessun nuovo concetto. Sui tag il valore predefinito è "multiplo". Impostato a "non multiplo" significa al massimo un elemento. Vale anche per i tag senza opzioni.
7. Il dato è sempre un array. Una stringa nuda non viene mai convertita silenziosamente: resta l'errore di tipo esistente.
8. Con opzioni definite, un valore fuori elenco è rifiutato in scrittura con errore 400. Senza opzioni i tag restano liberi.
9. Il colore esiste solo tramite le opzioni. I tag liberi hanno chip neutro senza colore; l'interpretazione di colore/hex dentro i valori liberi viene eliminata.
10. Kanban, ordinamento e raggruppamento sono supportati solo sui tag non multipli. Un campo tag multiplo non è offerto per questi usi; una configurazione di vista che lo referenzia è un errore di validazione.
11. Rottura di compatibilità deliberata: nessuna migrazione dei dati, i seed demo vengono riscritti da zero. La modifica è documentata come incompatibile con i database precedenti e richiede ripartenza da DB nuovo. La migrazione verso la 0.9 è rimandata.

# 3. Primary Requirements (User Stories)

* AS A autore di seed I WANT dichiarare un campo di tipo tag con un elenco chiuso di opzioni e la modalità di scelta singola SO THAT posso modellare una scelta come un tier list senza usare un testo libero
* AS A autore di seed I WANT assegnare a ogni opzione un colore esadecimale esplicito SO THAT il colore non dipende più dalla posizione nell'elenco e resta stabile se riordino le opzioni
* AS A autore di seed I WANT che un seed malformato (testo con opzioni, opzioni come semplici stringhe, opzioni vuote, valori duplicati, colore non esadecimale) fallisca al boot con un messaggio chiaro SO THAT scopro l'errore subito e non a runtime
* AS A editor di contenuti I WANT scegliere un valore da un menu a tendina con un pallino colorato accanto a ogni voce SO THAT scelgo in modo rapido e riconoscibile
* AS A editor di contenuti I WANT aprire una entry e vedere il valore del tag caricato correttamente come chip colorato SO THAT l'errore di tipo array/stringa non si verifica più
* AS A consumatore API o integratore I WANT che i valori fuori dalle opzioni siano rifiutati con 400 e un messaggio che elenca i valori ammessi SO THAT i dati restano coerenti con lo schema
* AS A consumatore API o integratore I WANT che il valore di un tag sia sempre un array SO THAT il contratto del dato è uniforme per scelta singola e multipla
* AS A editor di contenuti I WANT vedere i tag come chip colorati in form, tabella, gallery e kanban SO THAT la presentazione è la stessa ovunque
* AS A editor di contenuti I WANT usare un tag a scelta singola come asse del kanban, con una colonna per ogni opzione (nell'ordine del seed) più "Senza valore" se il campo non è obbligatorio SO THAT posso gestire un flusso per stato o livello
* AS A editor di contenuti I WANT ordinare e raggruppare le entry per un tag a scelta singola secondo l'ordine delle opzioni SO THAT ottengo viste coerenti con il modello del seed
* AS A autore di seed I WANT definire opzioni, colori e modalità singola/multipla dal seed builder SO THAT non devo scrivere il seed a mano
* AS A operatore o agente (CLI e MCP) I WANT che piano e applicazione dello schema rilevino come differenza il cambio di forma delle opzioni e di modalità SO THAT le modifiche allo schema sono visibili e tracciabili
* AS A manutentore I WANT i seed demo riscritti da zero con tag a scelta singola (con le relative automazioni e formattazioni condizionali) SO THAT la demo riflette il nuovo modello
* AS A amministratore che aggiorna I WANT una nota di rottura chiara nella documentazione di versione SO THAT so che serve ripartire da un DB nuovo

# 4. Secondary Requirements and Logical Constraints

**Cardinalità e obbligatorietà**
- Non multiplo: massimo 1 elemento. Array vuoto valido se il campo non è obbligatorio; se obbligatorio (in creazione o in aggiornamento) richiede esattamente 1 elemento.
- Multiplo (predefinito): nessun massimo; se obbligatorio richiede almeno 1 elemento.
- Duplicati nello stesso array (es. due volte lo stesso valore): rifiutati con 400, nessuna deduplicazione silenziosa.
- Confronto dei valori esatto: nessun trim, nessuna normalizzazione di maiuscole/minuscole ("Pro" ≠ "pro").
- Una stringa nuda inviata a un campo tag è rifiutata con l'errore di tipo esistente (atteso array); nessuna coercizione.

**Valori obsoleti (opzione rimossa o rinominata nel seed)**
- Lettura sempre indulgente: una lista non fallisce per una riga con valore obsoleto. La dashboard mostra un chip grigio neutro con indicazione "non presente nelle opzioni".
- Scrittura: il valore obsoleto è rifiutato con 400 come qualsiasi valore fuori elenco. La migrazione dei dati esistenti non è gestita in questa feature (rimandata alla 0.9).

**Presentazione**
- Nel form il tag con opzioni usa un menu a tendina (scelta singola: un valore; multipla: più chip) con pallino colore per voce. La visualizzazione ovunque è quella dei tag (chip colorati).
- L'ordine delle opzioni determina ordine del menu, ordine delle colonne kanban e ordine di ordinamento.
- Il kanban mostra la colonna "Senza valore" solo se il campo non è obbligatorio.

**Ordinamento, raggruppamento, kanban**
- Disponibili solo su tag non multipli. Ordinamento per posizione dell'opzione nell'elenco del seed (non alfabetico). Per tag liberi non multipli senza opzioni: ordine alfabetico del valore.
- I tag multipli non sono offerti come asse né come colonna ordinabile/raggruppabile. Una vista già configurata su un tag multiplo è un errore di validazione, non un comportamento silenzioso.
- Filtri, ordinamento, raggruppamento, formattazione condizionale, automazioni e widget che leggevano il testo con opzioni devono funzionare sul tag a scelta singola con lo stesso comportamento funzionale. Nessuna capacità nuova richiesta, nessun livello di compatibilità: le regole vengono riscritte insieme ai seed.

**Impatto su componenti trasversali**
- Il tipo di asse kanban e la risoluzione delle colonne perdono il ramo "testo con opzioni" e trattano il tag come asse unico.
- Il fingerprint dello schema deve includere la nuova forma delle opzioni e la modalità, in modo che piano/applicazione mostrino la differenza.
- Il generatore di tipi dei seed deve riflettere array di stringhe per i tag (unione dei valori ammessi dove le opzioni sono definite).
- Il seed builder espone: editor delle opzioni (valore + colore esadecimale), interruttore singolo/multiplo, con le stesse regole del boot.

**Rottura di compatibilità**
- Nessuna migrazione dei dati. Database precedenti non supportati: ripartenza da DB nuovo.
- La nota di rottura va nella documentazione di versione e nel changelog, con l'indicazione che serve un DB nuovo e che i seed devono usare la nuova forma delle opzioni.
- La migrazione dei dati esistenti verso la 0.9 è esplicitamente rimandata a una fase successiva.

# 5. Out of Scope (Discarded during sparring)

- Migrazione automatica dei dati o dei seed esistenti (testo → tag, lista di stringhe → coppie): rimandata alla 0.9.
- Doppia forma tollerata per le opzioni (lista di stringhe oltre alle coppie): scartata, nessun livello di compatibilità.
- Colore opzionale con palette posizionale di ripiego: scartato, il colore è obbligatorio.
- Formati di colore diversi dall'esadecimale (nomi, token): scartati.
- Colore per i tag liberi senza opzioni e interpretazione di colore/hex nei valori liberi: scartati.
- Mappa a oggetto (hashmap) come struttura delle opzioni: scartata a favore di un array ordinato di coppie (ordine non garantito in una mappa).
- Nuovo flag dedicato alla scelta singola: scartato, si riutilizza il flag di cardinalità già esistente.
- Coercizione silenziosa di una stringa in array: scartata.
- Deduplicazione silenziosa dei duplicati e normalizzazione di maiuscole/spazi: scartate.
- Errore in lettura per righe con valore obsoleto: scartato, la lettura resta indulgente.
- Kanban, ordinamento e raggruppamento sui tag multipli (carta in più colonne, ordinamento per primo elemento): scartati, non supportati.
- Nuove capacità di filtro, ordinamento o raggruppamento oltre alla parità con il comportamento precedente: scartate.
- Livello di compatibilità per automazioni e formattazioni condizionali che referenziavano il testo con opzioni: scartato, riscritte con i seed.
