# 1. Feature Definition and Core Value

Oggi l'eliminazione di un'entry è soft solo se il seed ha il flag `softDelete`; altrimenti è una cancellazione fisica irreversibile. In un contesto aziendale questo è un rischio di perdita dati accidentale, e il comportamento dipende da una scelta per-seed che l'utente finale non vede. Inoltre il cestino non ha una politica di conservazione effettiva: la scadenza per retention esiste come query ma nessun processo la esegue.

La feature rende il soft delete l'unico percorso ordinario di eliminazione, con un'esperienza rapida (singolo senza attrito, annullabile per 5 secondi), una conferma esplicita solo per le azioni multiple, e una conservazione di 14 giorni configurabile dopo la quale i dati vengono purgati definitivamente. Il cestino rispetta ruoli e scope, quindi nessun utente può ripristinare o purgare ciò a cui non ha accesso.

# 2. Domain Boundaries and Business Rules

**Entità coinvolte**
- **Entry:** record di un seed. Può essere attiva o nel cestino.
- **Seed:** definisce lo schema; può dichiarare una retention propria.
- **Cestino:** vista delle entry eliminate, filtrata per ruoli e scope dell'utente.
- **Impostazioni globali:** contengono la retention di default.
- **Registro delle cancellazioni (deletion ledger):** log esterno di verità sulle purge definitive.
- **Media (R2):** file collegati alle entry, con ciclo di vita separato da quello della riga.
- **Ruoli e permessi:** determinano chi vede, ripristina e purga.

**Regole ferree**
- Ogni eliminazione di entry è soft. Non esiste più un percorso di cancellazione fisica come azione ordinaria dell'utente.
- Il flag `softDelete` del seed è deprecato e no-op: ogni punto che lo legge si comporta come se valesse `true`, e dal seed non viene mai letto. Resta nei tipi solo per non rompere i seed già scritti, con commento di deprecazione, anche nella documentazione.
- La purge definitiva avviene solo da un'entry già nel cestino, per azione esplicita di un utente autorizzato o per scadenza della retention.
- La retention è globale con default 14 giorni. Un seed può sovrascriverla; se non la definisce usa il valore globale. Il valore `0` significa "non purgare mai".
- Al soft delete lo slug diventa `<slug>_old_<timestamp al millisecondo>` in minuscolo, così non occupa il vincolo unique. Il timestamp preciso garantisce l'unicità anche per eliminazioni ripetute dello stesso slug nello stesso giorno.
- Al restore lo slug originale viene ripristinato. Se è stato assegnato a un'altra entry nel frattempo, si applica l'auto-rinomina `<slug>-restored-<id8>`.
- I media su R2 non vengono toccati dal soft delete e restano ripristinabili con l'entry; vengono cancellati solo dalla purge.
- Ripristino e purge richiedono i permessi relativi al contenuto nel cestino. Visibilità, elenco e azioni del cestino rispettano ruoli e scope e le policy di visibilità dei campi (masked/hidden) già in vigore.
- Il soft delete è immediato sul server; la UI non ritarda mai l'operazione. "Annulla" è un restore.
- La feature non introduce dipendenze tra slice oltre a quelle già esistenti: contenuto, cestino, impostazioni e permessi restano nei propri confini.

# 3. Primary Requirements (User Stories)

* AS A editor I WANT eliminare una singola entry con un solo gesto e senza alcun avviso SO THAT il lavoro quotidiano di pulizia resti rapido.
* AS A editor I WANT vedere un toast di 5 secondi con "Annulla" dopo l'eliminazione di una singola entry SO THAT possa recuperare subito un'azione fatta per errore.
* AS A editor I WANT che l'entry sparisca dalla UI nell'istante dell'eliminazione SO THAT l'interfaccia rifletta subito l'azione.
* AS A editor I WANT una modale di conferma quando elimino più entry insieme SO THAT un'azione di massa non parta per sbaglio.
* AS A editor I WANT ripristinare un'entry dal cestino SO THAT i dati eliminati per errore tornino disponibili con i loro media.
* AS A administrator I WANT che i dati eliminati siano conservati 14 giorni di default SO THAT esista una finestra di recupero uniforme senza configurazioni per seed.
* AS A administrator I WANT impostare la retention globale dalle Settings SO THAT l'organizzazione adegui la conservazione alle proprie policy.
* AS A administrator I WANT sovrascrivere la retention su un singolo seed SO THAT contenuti con requisiti diversi abbiano una conservazione propria senza modificare gli altri.
* AS A administrator I WANT impostare la retention a `0` SO THAT i dati eliminati non vengano mai purgati automaticamente.
* AS A administrator I WANT purgare definitivamente un'entry dal cestino SO THAT dati da rimuovere subito non attendano la scadenza.
* AS A user with restricted access I WANT vedere e gestire nel cestino solo le entry a cui ho accesso per ruolo e scope SO THAT non possa ripristinare o purgare contenuti altrui.
* AS A seed author I WANT che ogni seed esistente adotti il soft delete senza modifiche SO THAT non debba riscrivere gli schemi.

# 4. Secondary Requirements and Logical Constraints

- **Undo e stato del server:** l'annullamento chiama `restore`. Il restore fa scattare l'automazione `update`, come oggi. Il toast scade dopo 5 secondi; dopo la scadenza l'entry si recupera solo dal cestino.
- **Chiusura o ricarica del tab:** poiché il soft delete è già avvenuto sul server, non si perde nessuna eliminazione; l'unico effetto è che il toast "Annulla" non è più disponibile.
- **Eliminazioni singole ravvicinate:** ogni eliminazione genera il proprio annullamento; il comportamento di toast multipli va definito dall'Architect, ma nessuna eliminazione può annullarne un'altra.
- **Slug:** l'eliminazione rinomina lo slug; la rinomina e il restore devono mantenere l'originale recuperabile. Le entry nel cestino non bloccano mai la creazione di nuove entry con lo stesso slug. Il formato `_old_` non deve essere confuso con slug validi di entry attive.
- **Restore con slug occupato:** auto-rinomina in `<slug>-restored-<id8>`, l'utente non resta mai bloccato.
- **Bulk:** modale obbligatoria, esecuzione soft, nessun undo. I risultati parziali sono riportati per ogni id, senza far fallire l'intero batch.
- **Retention:** la purge per scadenza deve avere un esecutore periodico; oggi la query di scadenza esiste ma nessun processo la invoca. Il valore di retention per seed ha precedenza sul globale; assente significa globale; `0` significa mai. Valori non validi (negativi, non numerici) devono essere rifiutati.
- **Purge e ledger:** ogni purge, manuale o automatica, scrive prima nel registro delle cancellazioni; un fallimento del registro lascia la riga intatta. La riconciliazione dopo un restore del database resta valida.
- **Purge e media:** la cancellazione dei file R2 avviene solo alla purge; un fallimento resta non bloccante (file orfani possibili).
- **Permessi:** chi ha accesso in sola lettura a un seed vede il cestino ma non può ripristinare né purgare; chi non ha accesso non vede nulla. Azioni non permesse devono essere rifiutate anche se invocate direttamente via API.
- **Visibilità:** il cestino non deve rendere leggibili campi marcati masked o hidden.
- **Deprecazione del flag:** il vecchio errore 409 per seed senza soft delete e la rinomina dipendente dal flag non sono più raggiungibili. La documentazione indica il flag come deprecato e ignorato.
- **Query:** tutte le letture normali continuano a escludere le entry nel cestino, comprese join e backref che puntano a un parent eliminato.
- **Compatibilità dati:** nessuna migrazione richiesta secondo la policy del progetto (DB solo di test). Le entry già nel cestino prima della feature mantengono lo slug originale e restano ripristinabili.

# 5. Out of Scope (Discarded during sparring)

- Eliminazione ritardata di 5 secondi lato client con commit solo alla scadenza (scartata per fragilità: perdita di intento alla chiusura del tab, automazioni in ritardo, stato non coerente tra utenti).
- Undo per le eliminazioni multiple.
- Avviso o modale per l'eliminazione di una singola entry.
- Opt-out funzionante del soft delete per seed, e qualsiasi forma di hard delete diretto come azione ordinaria.
- Mantenere gli slug delle entry nel cestino come occupati nel vincolo unique.
- Rifiuto 409 al restore per slug occupato.
- Valori speciali di retention diversi da `0` (nessun `-1` o `null` con significato proprio).
- Configurazione della retention per ruolo o per utente.
- Migrazione dei dati esistenti.
