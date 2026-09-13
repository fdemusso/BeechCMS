# 1. Feature Definition and Core Value

Sviluppatori e clienti commerciali che usano Beech devono periodicamente spostare grandi volumi di dati dentro o fuori dal CMS (es. migrare 2000 prodotti da un vecchio e-commerce, esportare i messaggi clienti per analizzarli in Excel). Oggi questo richiede script custom per ogni cliente, con costo di sviluppo ricorrente e nessuna garanzia di validazione contro lo schema del content type.

Il valore indispensabile della feature è fornire due percorsi nativi, standardizzati e validati — export e import di massa — per qualunque content type, così che la migrazione dati smetta di essere un problema ad-hoc e diventi una capability di piattaforma.

# 2. Domain Boundaries and Business Rules

**Entità coinvolte:**
- **Content Record** — le righe esistenti in `content_{slug}` (D1), invariate nella loro struttura.
- **Content Schema** — la definizione del content type nel Botanical Engine; determina se il tipo è *flat* (solo campi scalari) o *relazionale* (contiene relazioni/array).
- **Import Job** — nuova entità, persistita in D1, con stato (`pending`/`processing`/`completed`/`failed`), report di esito e riferimento all'utente creatore.
- **File Storage (R2)** — riutilizza il meccanismo di presigned upload già esistente nel Media Engine (`PresignOptions`, `BeechBucket` in `packages/core/src/common/storage.ts`).
- **Queue** — riutilizza `IQueueService` (`CloudflareQueueService` su `env.QUEUE` in produzione, `InMemoryQueueService` in locale) già presente nell'architettura.

**Regole ferree:**
- L'**export** è sempre sincrono: risposta streamata direttamente nella response HTTP, paginata/chunked per non caricare l'intero result set in memoria. Nessun job, nessun passaggio da R2, nessuno stato persistito. Il numero di record esportabili in un singolo export sincrono è limitato a una soglia configurabile (per non incorrere nel timeout HTTP edge↔client e nel CPU time limit del Worker); oltre la soglia l'endpoint rifiuta la richiesta con `413` e invita a restringere il filtro/range, invece di iniziare uno stream che rischia di interrompersi a metà con un file corrotto.
- L'**import** è sempre asincrono: l'endpoint accoda un job su `IQueueService` e risponde immediatamente con un job id; l'elaborazione avviene in un consumer separato, a **chunk**: il consumer processa un numero limitato di righe per invocazione (soglia configurabile), persiste nel job l'offset raggiunto e il report parziale, e si ri-accoda per il chunk successivo fino a fine file. Il retry automatico della coda su un chunk fallito riparte dall'ultimo offset confermato, non dall'inizio del job — così non ri-processa righe già inserite con successo marcandole erroneamente come duplicati falliti.
- **ImportJob è un'entità gestita dal Botanical Engine** (un system content type dedicato), non uno storage D1 grezzo: rispetta l'invariante per cui l'handler di un job riceve solo il repository engine-mediated (`JobContext.repository: ContentRepository`) e mai un `D1Database` diretto (`queue.interface.ts`). Stato, progresso e report del job vengono letti/scritti tramite questo repository, come qualunque altro contenuto.
- Il file grezzo caricato su R2 per l'import viene **eliminato dal consumer** al raggiungimento di uno stato terminale del job (`completed` o `failed`); una lifecycle rule R2 di sicurezza (es. 24h) copre i casi di job orfani/bloccati, evitando accumulo indefinito di spazio.
- Il formato **CSV** è ammesso solo per content type *flat* (nessun campo relazionale/array). Una richiesta CSV su un content type relazionale viene rifiutata a monte con errore esplicito.
- Il formato **NDJSON** (newline-delimited JSON) è l'unico formato universale, valido per qualsiasi content type (flat o relazionale) e per entrambe le direzioni (export/import); sostituisce il generico `json` array perché processabile riga-per-riga senza caricare l'intero payload in memoria.
- L'**import è insert-only**: non esiste upsert/update. Una riga il cui identificatore univoco collide con un record esistente è conteggiata come riga fallita, mai sovrascritta né saltata silenziosamente.
- Ogni riga importata viene validata contro lo schema del Botanical Engine prima dell'inserimento; l'import è *best-effort* (le righe valide vengono inserite, quelle non valide falliscono e vengono riportate) — non è una transazione atomica sull'intero file.
- Permessi: **export** richiede scope di lettura sul seed target; **import** richiede scope di scrittura sul seed target. Nessun ruolo elevato/admin aggiuntivo richiesto.
- Il trasporto del file di import avviene esclusivamente via **upload R2 presigned** (stesso flusso del Media Engine); l'endpoint di import riceve un riferimento all'oggetto R2, mai il body grezzo del file.
- Lo stato del job è persistito in D1 (non in memoria) e sopravvive a riavvii/redeploy del Worker.
- Lo stato/report di un job è leggibile dall'utente creatore **o** da qualunque utente con scope di scrittura sullo stesso seed (stessa popolazione abilitata ad avviare import su quel seed) — vincolo enforced lato endpoint, non solo lato UI. Isolare il job al solo creatore romperebbe i flussi di team (es. il creatore è assente e nessun altro può verificare l'esito di un import da 10.000 record).
- L'import **non risolve dipendenze relazionali**: non esegue ordinamento topologico né retry differito per riferimenti in avanti. Le righe in un file NDJSON relazionale devono arrivare già ordinate parent-prima-di-child; una riga che referenzia una chiave non ancora inserita fallisce la validazione come qualunque altra FK non valida.

# 3. Primary Requirements (User Stories)

* AS A sviluppatore/cliente con scope di lettura su un seed I WANT esportare tutti i record di un content type come stream (CSV o NDJSON) SO THAT posso migrare o analizzare i dati in Excel o in un altro sistema senza scrivere uno script custom.
* AS A sviluppatore/cliente con scope di scrittura su un seed I WANT inviare un file di import di massa (CSV per i tipi flat, NDJSON per i tipi relazionali) SO THAT posso caricare in blocco migliaia di record invece di scrivere script di insert riga-per-riga.
* AS A utente con scope di scrittura sul seed (creatore del job o collega con pari scope) I WANT interrogare lo stato del job e vedere un report riassuntivo (righe inserite, righe fallite, primi 100 errori) SO THAT il team può verificare l'esito anche se chi ha avviato l'import non è disponibile, e correggere/ritentare le righe fallite.
* AS the Botanical Engine I WANT validare ogni riga importata contro lo schema del content type prima dell'inserimento SO THAT nessun dato non valido finisce in D1, indipendentemente dal formato di import usato.

# 4. Secondary Requirements and Logical Constraints

- Una richiesta di export o import in formato CSV su un content type con campi relazionali/array viene rifiutata immediatamente con errore `400` esplicito, che indica di usare NDJSON.
- L'import non aggiorna mai record esistenti: una riga con chiave univoca già presente è conteggiata come fallita, non silenziosamente ignorata né sovrascritta.
- Il file di import deve essere caricato su R2 tramite URL presigned (riuso di `PresignOptions`/`BeechBucket`) prima che il job possa essere accodato; l'endpoint di import riceve solo il riferimento R2, mai il body del file.
- L'endpoint di import deve rispondere immediatamente con l'id del job, senza bloccarsi sul parsing/validazione del file (elaborazione demandata al consumer della coda).
- Lo stato e il report del job, gestiti tramite il repository engine-mediated (non D1 grezzo), devono restare consultabili anche dopo un riavvio/redeploy del Worker.
- Lo stato/report del job è leggibile dal creatore o da qualunque utente con scope di scrittura sullo stesso seed; qualunque altro utente riceve un errore di autorizzazione.
- Il report di errore di un job è limitato ai primi 100 errori riga-per-riga più un conteggio aggregato delle righe fallite, per contenere la dimensione della riga indipendentemente dalla policy di retention.
- I record dei job non vengono mai eliminati o scaduti automaticamente: la retention è indefinita. Il file grezzo su R2, invece, viene eliminato dal consumer al termine del job (successo o fallimento), con una lifecycle rule di backstop per gli orfani.
- L'export segue lo stesso vincolo flat/relazionale dell'import: CSV solo per content type flat, NDJSON per tutto il resto (inclusi i tipi relazionali).
- L'export non passa mai da R2: la risposta è sempre streamata direttamente nella HTTP response, ed è soggetta al cap sul numero di record esportabili sincronicamente.
- L'import elabora il file a chunk (soglia di righe per invocazione configurabile), persistendo un offset di avanzamento nel job; il retry di un chunk fallito riparte da quell'offset, non dall'inizio del file.
- L'import non ordina né risolve dipendenze relazionali tra righe: un riferimento in avanti (riga N cita una riga non ancora inserita) fallisce come una FK non valida qualsiasi; l'onere di ordinare le righe parent-prima-di-child è del chiamante.

# 5. Out of Scope (Discarded during sparring)

- Import transazionale atomico (tutto o niente) — scartato in favore dell'import best-effort con report dettagliato.
- Upsert/update tramite import — scartato; l'import in questa iterazione è esclusivamente insert-only.
- Supporto CSV per content type con relazioni/array — scartato; per questi tipi esiste solo NDJSON, nessuna euristica di flattening/serializzazione per forzare il CSV.
- Politica di scadenza/pulizia dei *record di job* (TTL, archiviazione) — scartata; i job restano persistiti per sempre (il file grezzo su R2, invece, viene ripulito attivamente — non è out of scope).
- Isolamento del job al solo creatore, con esclusione totale di altri utenti con scope di scrittura — scartato dopo revisione: troppo restrittivo per flussi di team; la visibilità è invece condivisa con chi ha scope di scrittura sul seed.
- Instradamento dell'export tramite R2 (pattern upload-poi-download) — scartato; l'export è sempre streaming diretto nella response HTTP.
- Gating dell'import bulk dietro un ruolo admin/elevato — scartato; lo scope di scrittura standard è sufficiente.
- Export sincrono senza alcun limite di dimensione del result set — scartato: rischio concreto di timeout HTTP (524) e stream troncato/corrotto su export di grandi dimensioni; sostituito da una soglia configurabile con rifiuto `413` oltre limite.
- Elaborazione dell'intero file di import in un'unica invocazione del consumer di coda — scartata: eccede i limiti di batch/CPU time della coda e, in caso di retry, ri-processerebbe righe già inserite marcandole come duplicati falliti; sostituita da elaborazione a chunk con cursor persistito.
- Risoluzione automatica di dipendenze relazionali/ordinamento topologico all'interno del file di import — scartata; l'ordinamento parent-prima-di-child è responsabilità del chiamante.
