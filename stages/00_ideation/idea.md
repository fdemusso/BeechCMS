Ogni eliminazione di entry passa SEMPRE e di default dal soft delete. La cancellazione fisica diretta non esiste più come azione ordinaria: nel contesto aziendale di Beech è pericolosa.

DECISIONI PRESE:
1. Soft delete obbligatorio. Il flag `softDelete` del seed è deprecato e no-op: ogni controllo che lo legge restituisce `true`; dal seed non viene mai letto (al suo posto `true`, con commento di deprecazione).
2. Eliminazione singola: diretta, nessun avviso. Dopo l'azione la UI nasconde l'entry e mostra un toast di 5 secondi con "Annulla". Il soft delete è IMMEDIATO sul server; "Annulla" chiama `restore`.
3. Eliminazione multipla: modale di conferma a schermo; nessun undo.
4. Retention: 14 giorni di default, impostazione globale nelle Settings. Override per seed tramite `retentionDays`; se il seed non lo definisce usa il globale. `0` = non purgare mai.
5. Slug: all'eliminazione lo slug diventa `<slug>_old_<timestamp al millisecondo>` (minuscolo), così non occupa più il vincolo unique. Al restore si ripristina lo slug originale; se nel frattempo è stato preso, auto-rinomina in `<slug>-restored-<id8>` (comportamento già esistente).
6. Ruoli e scope: ripristino e purge richiedono i permessi relativi al contenuto nel cestino. Anche la visibilità del cestino segue ruoli e scope: ogni utente vede e tocca solo ciò a cui ha accesso.
7. R2: i media restano finché l'entry è nel cestino; si cancellano solo alla purge.
