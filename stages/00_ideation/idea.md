Il `text` con `options` (select a valore singolo) va eliminato e sostituito dai `tags` con scelta. Le opzioni sono sempre trattate come array: oggettivamente è il modello giusto.

PROBLEMA:
Oggi un campo "scelta" (es. `tier`: free / pro / enterprise) può essere definito in due modi incoerenti:
- `text` con `options`: dropdown a valore singolo, salvato come stringa (`"pro"`).
- `tags` con `options`: chip a selezione multipla, salvato come array (`["pro"]`).
Nei seed demo i campi a scelta singola erano `tags`, ma il form li instradava al select dei `text`, che emetteva una stringa. Risultato: `Field 'tier' expects type 'array' but received 'string'` e valore non caricato aprendo un'entry. Inoltre `options` oggi non è vincolante: il validatore dei `tags` accetta qualsiasi stringa.

DECISIONI GIÀ PRESE:
1. Il `text` con `options` sparisce come tipo di campo a scelta. Lo sostituiscono i `tags` con `options`. Le opzioni sono sempre un array.
2. I `tags` con `options` possono essere a scelta singola (si può selezionare un solo tag) o multipla. Il dato resta sempre un array. Nel form si mantiene il dropdown (select) per l'inserimento di un tag con scelta; la visualizzazione (form, tabella, gallery, kanban) è quella dei tag: chip colorati.
3. Per ogni seed deve essere possibile scegliere il colore di ogni opzione (almeno per i tag a scelta singola; da chiarire se vale per tutti). Il dropdown mostra un pallino colore accanto a ogni voce. Oggi il colore deriva dalla posizione nell'array (`colorForOption`, palette fissa): il colore per opzione cambia la forma di `options` (da `string[]` a oggetti con valore e colore).
4. Il kanban su un campo tag con scelta mostra una colonna per ogni opzione possibile, più "Senza valore" se non obbligatorio. Si tratta come un asse `tags`.
5. `options` diventa vincolante (opzione A): quando è definito, il validatore rifiuta (400) i valori fuori dall'elenco. Senza `options` i tag restano liberi come oggi.
6. Nessuna migrazione dei dati. I seed demo vengono riscritti da zero (es. `tier: ['pro']` dichiarato come tag a scelta singola). Il cambio è documentato come NON compatibile con i database precedenti e obbliga a una migrazione/ripartenza da DB nuovo.

DA CHIARIRE NELLO SPARRING:
- Come si dichiara la scelta singola nel seed (nome e forma dell'opzione, es. `multiple: false`) e dove si applica il limite (validatore core, form, API, import, MCP).
- Forma di `options` con colori per opzione e compatibilità con i seed già scritti che usano `string[]`.
- Il colore per opzione vale solo per la scelta singola o per tutti i `tags` con `options`?
- Cosa succede a un'entry che ha un valore non più presente nelle `options` (opzione rimossa o rinominata dal seed).
- Impatto su filtri, ordinamento (`tags` ora ordinabile nella toolbar), raggruppamento, formattazione condizionale, automazioni e widget che oggi leggono `text` con `options`.
- Impatto sull'asse kanban (`KanbanAxisBranchType`, `resolveKanbanColumns`) quando il `text` con `options` non esiste più.
- Cosa succede al seed builder (UI per definire le opzioni, colori e modalità singola/multipla) e al MCP/CLI `schema plan/apply`.
- Testo della nota di rottura e posizione nella documentazione di versione.
