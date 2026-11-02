# 1. Feature Definition and Core Value

La dashboard di BeechCMS deve essere completamente RBAC: non rivela mai dati a chi non ha lo scope per vederli, e organizza i propri contenuti per ruolo. Il sistema legacy dei ruoli (`users.role` con valori `admin` / `editor`, il claim JWT `role`) esce totalmente dal sistema.

Il problema reale è doppio:

1. **Leak di dati verificato.** Tutte le rotte `/api/content/stats/*` sono protette solo da `view_analytics` globale e non filtrano per seed. Chi ha `content:read` solo sul seed `prodotti` e `view_analytics` vede conteggi, nomi, log di attività (utente, email, slug, id, dettagli) e file dei media di tutti gli altri seed. I widget non dichiarano i permessi che richiedono e il renderer non filtra nulla. Il layout può contenere riferimenti a seed che il lettore non può vedere.
2. **Autorizzazione incoerente e legacy.** Il selettore ruoli del builder lavora su `users.role`, quindi i ruoli RBAC reali sono invisibili. Il gate di modifica del layout è diviso tra middleware (`manage_users`) e handler (legacy admin). L'asse "sviluppatore" (`users.role = 'admin'`) vive in parallelo all'RBAC, con tre significati diversi della parola `isDeveloper`.

Il valore è una combinazione di "chi sei" e "cosa puoi fare":

- Il **ruolo** decide quali tab della dashboard vedi (organizzazione).
- Lo **scope** (i seed che puoi leggere) decide quali widget e quali dati vedi (protezione).

Principio cardine: **il layout non è mai l'autorità**. La visibilità delle tab per ruolo è organizzazione. La protezione dei dati vive nelle rotte API, che applicano RBAC per scope. La UI nasconde per cortesia, il server rifiuta.

---

# 2. Domain Boundaries and Business Rules

## Entità coinvolte

- **Utente.** Titolare di zero o più assegnazioni. Un account senza assegnazioni non ha visibilità.
- **Ruolo.** Oggetto globale, senza scope proprio. Bundle di permessi atomici, identificato da un id stabile. Il nome non è l'identificatore.
- **Assegnazione.** La tripla (utente, ruolo, scope), dove lo scope è `*` oppure lo slug di un seed. Le assegnazioni decadute (seed cancellato) non conferiscono nulla.
- **Seed.** Perimetro di isolamento dei dati. L'isolamento è per seed, mai per riga.
- **Layout della dashboard.** Un unico documento (scope `default`) composto da tab. Ogni tab contiene sezioni, colonne e widget.
- **Tab.** Unità di organizzazione del layout. Ha un elenco opzionale di ruoli destinatari.
- **Widget.** Componente che dichiara i permessi necessari per essere usato.
- **Permesso.** Elemento del vocabolario chiuso. Questa feature ne aggiunge due: `manage_layout` e `manage_seeds`.

## Regole di business inderogabili

### Fonte della verità e fail-closed
1. L'autorizzazione dei dati è applicata dal server a ogni richiesta. Nessuna decisione di sicurezza dipende da ciò che il layout contiene o da ciò che la UI mostra.
2. Ogni stato ambiguo o orfano si risolve negando l'accesso, mai concedendolo.

### Layout e tab
3. Esiste un solo layout (scope `default`). Gli scope per ruolo, il selettore ruoli del builder, la lista dei ruoli noti e la risoluzione a catena di scope scompaiono. Le eventuali righe `role:*` già presenti nel database sono ignorate.
4. Ogni tab ha un campo opzionale con gli id dei ruoli destinatari (non i nomi). Elenco assente o vuoto significa tab visibile a tutti. Elenco non vuoto significa tab visibile a chi possiede almeno uno di quei ruoli con un'assegnazione attiva, in qualunque scope.
5. Una tab è visibile solo se, oltre alla regola sui ruoli, il chiamante può usare almeno un suo widget. Una tab senza widget utilizzabili è nascosta del tutto. Una sezione senza widget visibili sparisce.
6. Il server filtra il layout prima di servirlo: configurazione e widget di tab non autorizzate non arrivano mai al client. Elimina anche i widget che puntano a un seed che il chiamante non può leggere.
7. Un utente vede l'unione delle tab dei propri ruoli. Non esiste priorità tra ruoli multipli.
8. Esempio guida: un Commerciante assegnato su `prodotti` e uno assegnato su `ordini` vedono la stessa tab, ma ciascuno solo i widget dei propri seed. Un Redattore e un Commerciante con la stessa lettura sugli stessi seed possono avere tab diverse.

### Widget
9. Ogni definizione di widget dichiara un requisito opzionale e additivo. Il requisito può essere: un permesso globale, oppure `content:read` sul seed indicato nella configurazione del widget, oppure `content:read` su almeno un seed.
10. Il renderer valuta il requisito con le stesse funzioni di autorizzazione del core. Un widget non autorizzato è nascosto.
11. Il builder offre all'autore solo i widget che può usare. Il generatore del layout di default esclude ciò che l'utente non può vedere.

### Ruoli destinatari delle tab
12. Gli id dei ruoli sono validati al salvataggio. Un id sconosciuto è un errore di validazione (422), mai rimosso in silenzio, perché svuotare l'elenco renderebbe la tab pubblica.
13. Un id orfano (ruolo cancellato dopo il salvataggio) non conferisce accesso a nessuno. Il builder lo mostra come "ruolo eliminato" e lo rende rimovibile. La cancellazione di un ruolo non esegue nessuna pulizia sui layout.

### Chi può fare cosa sul layout
14. `manage_layout` consente di modificare il **contenuto** (sezioni, colonne, widget) di **tutte** le tab. Si assegna solo a scope globale.
15. Le operazioni **strutturali** (creare, eliminare, riordinare tab, assegnare o cambiare i ruoli destinatari) richiedono `manage_roles` globale. Chi ha `manage_roles` globale vede anche tutte le tab.
16. SuperAdmin possiede entrambi i permessi. Il permesso può arrivare da qualunque ruolo posseduto (aggiunto a un ruolo esistente, oppure un ruolo dedicato assegnato al singolo utente).
17. Chi ha solo `manage_layout` non può aggiungere, rimuovere o riordinare tab, né cambiare i ruoli destinatari. Altrimenti estenderebbe da solo la visibilità.
18. Il salvataggio è protetto da compare-and-swap sull'ultimo aggiornamento, per evitare sovrascritture tra editor concorrenti.

### Widget che l'autore non può usare
19. Quando un autore con `manage_layout` apre una tab che contiene widget su seed che non può leggere, vede un segnaposto opaco "widget non disponibile". Non vede tipo, seed né configurazione. Non può modificarlo, rimuoverlo né spostarlo.
20. Al salvataggio il server reinserisce i widget bloccati dal layout già salvato, senza fidarsi del client. Una sezione composta solo da widget bloccati non può essere rimossa dall'autore.
21. L'eliminazione di una tab intera, anche con widget bloccati, spetta a chi ha `manage_roles` globale, perché è una operazione strutturale e non rivela dati.

### Sorgenti dati (chiusura del leak)
22. `stats/total`, `breakdown` e `recent-activity` passano da `view_analytics` globale a un gate di sola autenticazione con proiezione per scope dentro l'handler, sul modello già ratificato per bozze e ricerca. I conteggi sono la somma dei soli seed leggibili. Il log è filtrato per i seed leggibili. Le righe non legate a un seed (utenti, impostazioni) richiedono `manage_users`.
23. `health`, `cloudflare` e `storage/sync` restano `view_analytics` globale, perché sono infrastruttura e non dati di seed.
24. `setup-checklist` richiede `manage_users` globale, perché espone gli slug dei seed.
25. `media-library` e `unused-media` non appartengono a un seed. Richiedono `content:read` assegnato a scope globale. Un `content:read` su un singolo seed non basta.
26. Esiste un test d'integrazione di isolamento: un utente con `content:read` su `prodotti` e `view_analytics` non riceve nulla riguardante `ordini`.

### Asse sviluppatore e `users.role`
27. Il campo `users.role` (con il relativo vincolo), il claim JWT `role`, `role` in `ActorContext`/`resolveActor`, `requireAdmin` e l'attuale `isDeveloper` basato su `users.role` vengono rimossi completamente. Non è richiesta compatibilità con dati esistenti.
28. Nuovo permesso `manage_seeds`, valutato solo a livello globale (`*`), assegnato a SuperAdmin. Sostituisce il gate delle rotte `/api/seeds/*` e del gruppo Data Models nella dashboard. Chiunque possieda SuperAdmin potrà quindi modificare lo schema: la garanzia passa da "solo il developer" a "solo chi lo possiede", protetta dall'anti-escalation già esistente.
29. L'invariante attuale ("`manage_seeds` non deve mai essere aggiunto") è esplicitamente revocata. Il vocabolario, i docs e i commenti che la dichiarano vengono riscritti come decisione consapevole.
30. La dashboard deriva il gate Data Models dalla stessa valutazione dei permessi del core. Il payload di `/api/settings/me` perde il campo `isDeveloper`.
31. La protezione speciale dell'account Developer (non disattivabile, `SuperAdmin` non rimovibile) viene eliminata. Resta come unica garanzia l'invariante `last-global-admin`.
32. Il primo account creato da `POST /auth/setup` riceve `SuperAdmin`, come già avviene oggi. Il developer è riconoscibile solo per questo.

## Confini invalicabili

- Lo slice dashboard non può importare lo slice `rbac`. I dati dei ruoli necessari al builder passano da un endpoint dedicato, esposto a chi può modificare il layout, che restituisce solo id, nome e icona.
- Nessuna logica di autorizzazione viene reimplementata nella UI: si usano le stesse funzioni del core.
- Il vocabolario dei permessi resta chiuso. Ogni permesso nuovo arriva da una modifica di codice più una migrazione che allarga il vincolo di `role_permissions`.
- L'omonimo `isDeveloper` di `setup/index.ts` (flag d'ambiente `ENV === 'development'`) non è l'asse utente e non viene toccato.

---

# 3. Primary Requirements (User Stories)

* AS A utente con `content:read` solo su alcuni seed I WANT che le statistiche della dashboard (conteggi, ripartizioni, attività recente) riguardino soltanto quei seed SO THAT non venga mai a conoscenza di nomi, conteggi, utenti o attività di seed che non posso leggere
* AS A utente con `content:read` globale I WANT vedere la media library e i media inutilizzati SO THAT possa gestire i file senza che chi ha un accesso limitato a pochi seed li veda
* AS A amministratore con `manage_users` globale I WANT accedere alla checklist di configurazione SO THAT gli slug dei seed e lo stato del sistema siano esposti solo a chi amministra
* AS A utente con un ruolo assegnato I WANT vedere nella dashboard le tab destinate ai miei ruoli SO THAT la mia dashboard sia organizzata per la mia figura aziendale
* AS A utente con accesso a una parte dei seed di una tab I WANT vedere solo i widget che posso usare SO THAT la dashboard sia coerente con il mio scope senza mostrarmi dati altrui
* AS A utente senza alcun widget utilizzabile in una tab I WANT che quella tab non compaia SO THAT non mi trovi davanti a una pagina vuota o a un messaggio di negazione
* AS A utente il cui URL punta a una tab che non posso vedere I WANT essere portato alla prima tab visibile SO THAT non trovi un errore né scopra l'esistenza di tab altrui
* AS A utente a cui cambiano le assegnazioni I WANT che la dashboard rifletta subito i nuovi ruoli SO THAT non veda tab o widget non più miei né me ne manchino di nuovi
* AS A titolare di `manage_roles` globale I WANT creare, eliminare e riordinare le tab e assegnare i ruoli destinatari di ciascuna SO THAT la dashboard sia organizzata per figure aziendali
* AS A titolare di `manage_roles` globale I WANT scegliere i ruoli di una tab da un elenco che mostra nome e icona, e vedere come "ruolo eliminato" un ruolo non più esistente SO THAT possa rimuoverlo e non lasciare una tab inaccessibile
* AS A titolare di `manage_layout` I WANT modificare sezioni, colonne e widget di qualunque tab SO THAT possa mantenere la dashboard senza avere poteri di amministrazione dei ruoli
* AS A titolare di `manage_layout` che non legge tutti i seed I WANT vedere i widget a me non accessibili come segnaposto opachi e preservati SO THAT possa modificare una tab mista senza vedere né distruggere ciò che non mi appartiene
* AS A autore del layout I WANT che il builder mi offra solo i widget che posso usare SO THAT non possa inserire componenti che io stesso non potrei vedere
* AS A autore del layout I WANT essere avvisato se un altro editor ha salvato nel frattempo SO THAT non sovrascriva il suo lavoro senza saperlo
* AS A amministratore di sistema I WANT assegnare `manage_layout` a un ruolo esistente o a un ruolo dedicato SO THAT possa delegare la manutenzione della dashboard senza dare poteri più ampi
* AS A SuperAdmin I WANT possedere `manage_layout` e `manage_seeds` SO THAT la piattaforma resti pienamente amministrabile
* AS A utente senza `manage_seeds` I WANT che il gruppo Data Models non compaia e che le rotte dei seed mi rifiutino SO THAT lo schema non possa essere modificato da chi non ne ha autorità
* AS A titolare di `manage_seeds` I WANT accedere al Seed Builder e alle rotte dei seed SO THAT possa modificare lo schema senza dipendere da un'identità legacy
* AS A sviluppatore della piattaforma I WANT che `users.role`, il claim JWT `role` e `requireAdmin` non esistano più SO THAT esista un solo modello di autorizzazione, quello RBAC con scope e permessi

---

# 4. Secondary Requirements and Logical Constraints

## Stati di errore e validazione
- Salvare un layout con un id ruolo sconosciuto restituisce un errore di validazione. Il layout non viene salvato e nessun id viene scartato in silenzio.
- Un salvataggio che arriva con una versione obsoleta del layout viene rifiutato per conflitto. L'editor deve poter ricaricare e riapplicare le proprie modifiche.
- Un salvataggio di chi ha solo `manage_layout` che modifica struttura, ordine, numero di tab o ruoli destinatari viene rifiutato, anche se il client è stato manipolato.
- Un salvataggio che tenta di alterare, rimuovere o spostare un widget bloccato viene rifiutato oppure normalizzato al contenuto salvato. Il server non si fida mai del client su ciò che l'autore non può vedere.
- Un utente che chiama una rotta statistica senza alcuno scope di lettura riceve risposte vuote o conteggi a zero per quella proiezione, mai un errore che riveli l'esistenza di seed altrui.
- Per i casi in cui l'utente ha autorità amministrativa ma non sul bersaglio specifico, vale la regola già esistente: 404 e non 403, per non creare un oracolo di enumerazione.

## Stato intermedio e coerenza
- Un ruolo cancellato lascia id orfani nelle tab. Quelle tab diventano invisibili a tutti i non titolari di `manage_roles`. Non si esegue nessuna pulizia automatica.
- Se tutti i ruoli di una tab sono orfani e nessun altro li possiede, la tab è invisibile a tutti tranne chi vede tutte le tab per `manage_roles`. È il comportamento fail-closed voluto.
- Se un'assegnazione decade (seed cancellato), i widget e le tab che dipendevano da quello scope tornano a essere filtrati, e tornano visibili se il seed viene ripristinato.
- Se il layout salvato è vuoto o assente, il generatore del layout di default produce un layout includendo solo ciò che l'utente può vedere. Due utenti diversi possono vedere due default diversi finché non esiste un layout salvato.
- Se l'intero layout filtrato è vuoto per un utente, la dashboard mostra uno stato vuoto esplicito, non una pagina rotta.
- La navigazione verso una tab non visibile ricade sulla prima tab visibile. Se non ne esiste nessuna, vale lo stato vuoto.
- Le assegnazioni cambiano in sessione. La cache del layout lato client si invalida quando cambiano le assegnazioni dell'utente, e il server ricalcola il filtro a ogni richiesta, senza fidarsi di cache di autorizzazione.

## Vincoli temporali e di concorrenza
- Il layout è un documento unico, quindi due editor concorrenti possono scontrarsi. Il confronto sull'ultimo aggiornamento è obbligatorio per ogni scrittura.
- L'eliminazione o modifica di un ruolo non invalida i layout salvati ed è sempre fail-closed.

## Vincoli sui permessi
- `manage_layout` e `manage_seeds` si valutano solo a scope globale. Un'assegnazione su un singolo seed non li conferisce per la dashboard. L'eventuale valore per-seed di `manage_layout` è riservato alla futura iterazione dell'entry editor.
- Aggiungere `manage_layout` e `manage_seeds` richiede: la voce nel vocabolario, la migrazione che allarga il vincolo di `role_permissions` (ricostruzione della tabella, come già fatto per precedenti allargamenti), l'inserimento nel ruolo SuperAdmin, l'interfaccia di gestione dei ruoli, le traduzioni e la documentazione RBAC.
- L'anti-escalation esistente vale anche per i nuovi permessi: nessuno può assegnare un ruolo che contiene `manage_layout` o `manage_seeds` se non li possiede già a quello scope.
- I nuovi permessi vanno aggiunti alla UI dei ruoli nel gruppo corretto (Sistema), disabilitati per chi non li detiene.

## Rimozione del legacy
- Prima di rimuovere `role` da `ActorContext`, `resolveActor` e dal JWT, va verificato che nessuna policy del core lo legga.
- Vanno rimossi, nella dashboard: il controllo di modifica basato sul claim JWT, la lista dei ruoli ammessi alla modifica, la lettura di `user.role` nella pagina della dashboard, le righe legacy della rotta del layout nella tabella delle rotte protette.
- Il campo `isDeveloper` del payload `/api/settings/me` viene rimosso. I test che lo asseriscono (API e dashboard) vengono riscritti sul nuovo permesso.
- La logica in `users-tab` e `assignments-dialog` che usa `role === 'admin'` per proteggere l'account Developer viene eliminata.
- L'unico asse residuo che giustifica un'eccezione al "nessuna compatibilità" è il bootstrap: `POST /auth/setup` continua a creare il primo account con `SuperAdmin`.

## Vincoli di consegna e ordine di dipendenza
- **Fase 1, indipendente e prima.** Chiusura dei dati: proiezione per scope sulle rotte `stats/*`, gate di `health`/`cloudflare`/`storage/sync`/`setup-checklist`, regola della media library, test d'integrazione di isolamento. Deve poter essere rilasciata da sola, anche se le fasi successive slittano. È l'unico pezzo che chiude una violazione reale oggi.
- **Fase 2.** Layout e tab per ruolo: elenco dei ruoli per tab, filtro lato server, validazione, rimozione degli scope per ruolo, gate di modifica su permesso RBAC, builder con selezione multipla dei ruoli, endpoint ruoli dedicato, stato vuoto, ricaduta sulla prima tab visibile, invalidazione al cambio di assegnazioni.
- **Fase 3.** Requisito di permesso (`requires`) nei widget di core e nel renderer, esclusione dal generatore del default.
- **Fase 4.** `manage_layout`: permesso, migrazione, segnaposto per widget bloccati, enforcement sul salvataggio con compare-and-swap.
- **Fase 5.** `manage_seeds` e rimozione di `users.role`: nuovo permesso, migrazione, sostituzione del gate di `/api/seeds/*` e del gruppo Data Models, rimozione dell'asse legacy da JWT, `ActorContext`, `requireAdmin`, `isDeveloper`, interfaccia utenti e assegnazioni.
- **Fase 6.** Documentazione: `06-role-based-dashboards.md` (da riscrivere), `docs/api-reference.md`, `docs/reference/rbac-api.md`, `docs/manage/roles-permissions.md` e i commenti nel vocabolario che dichiaravano `manage_seeds` mai ammissibile.
- Le Fasi 2-4 non modificano le rotte dati della Fase 1. La Fase 5 tocca la sicurezza della piattaforma oltre la dashboard e va pianificata con attenzione separata.

## Criteri di accettazione trasversali
- Nessuna risposta API della dashboard contiene nome, conteggio, slug, attività o file di un seed che il chiamante non può leggere.
- Un utente con permessi parziali non può, in nessun modo, alterare la visibilità di una tab o ciò che non vede, nemmeno manipolando la richiesta.
- La dashboard non legge mai `users.role` né il claim JWT `role`.
- Nessuna logica di autorizzazione della UI diverge dalle funzioni del core.

---

# 5. Out of Scope (Discarded during sparring)

- **Entry editor.** Il gate di modifica del layout dell'entry editor e la rotta del layout per seed restano com'è oggi. Il valore per-seed di `manage_layout` è previsto lì, in un'iterazione successiva.
- **Dashboard per utente (`user:<id>`).** Esplicitamente escluso dalla serie dashboard.
- **Layout diversi per ruolo con precedenza.** Sostituito da un unico layout con tab destinate ai ruoli.
- **Priorità tra ruoli multipli.** Non serve: ogni tab ha la propria lista e un utente vede l'unione delle tab dei suoi ruoli.
- **Regola "tutto o niente" per le tab.** Scartata: una tab è visibile se si può usare almeno un widget. L'alternativa farebbe sparire in silenzio una tab quando un autore aggiunge un widget su un seed nuovo.
- **Visibilità delle tab derivata solo dai permessi o dai seed (senza ruoli).** Scartata: ruoli diversi con la stessa lettura possono avere tab diverse. L'elenco dei ruoli per tab resta.
- **Modifica isolata per tab** (un utente con `manage_layout` modifica solo le tab dei propri ruoli, con confronto strutturale per pagina). Scartata per costo e complessità. `manage_layout` vale per tutte le tab, e la struttura è di `manage_roles`.
- **Widget bloccati visibili e modificabili dall'autore, o tab non modificabile se mista.** Scartate: contraddicono il principio di non rivelare, o rendono la modifica quasi impossibile senza scope globale.
- **Hook sulla cancellazione del ruolo** per ripulire i layout. Scartato: gli id orfani sono gestiti fail-closed e mostrati come "ruolo eliminato".
- **Media library gated da `view_analytics` globale**, come oggi. Scartata: non chiude il leak.
- **Protezione speciale dell'account Developer** (non disattivabile, `SuperAdmin` non rimovibile) e qualunque marcatore di "proprietario". Scartati: resta solo l'invariante `last-global-admin`.
- **Bypass `isDeveloper` nei controlli della dashboard.** Non serve: il developer mantiene sempre SuperAdmin.
- **Compatibilità con dati esistenti.** Il database è solo di test: nessuna migrazione dei dati dei layout `role:*`, nessun periodo di convivenza con `users.role`.
- **Campo sostitutivo di `isDeveloper` nel payload `/api/settings/me`.** Non serve: il gate si deriva dai permessi.
- **Il flag d'ambiente omonimo `isDeveloper` di `setup/index.ts`.** Non è l'asse utente e non viene toccato in questa iterazione.
- **Un permesso di mutazione dello schema assegnabile per singolo seed.** Scartato: `manage_seeds` è solo globale.
