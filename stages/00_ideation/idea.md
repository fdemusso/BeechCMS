Dashboard completamente RBAC. La dashboard non deve mai rivelare dati a chi non ha lo scope per vederli, e il sistema legacy (`users.role`, claim JWT `role`) esce totalmente dalla dashboard. Ogni tab della dashboard può essere assegnata a uno o più ruoli RBAC: chi non possiede quel ruolo non vede la tab. L'entry editor è fuori da questa iterazione.

PROBLEMA VERIFICATO NEL CODICE:
- Il selettore in alto a sinistra del builder usa `KNOWN_DASHBOARD_ROLES = ['admin','editor']`, cioè `users.role` legacy. Ogni account creato via RBAC o invito ha `role = 'editor'` fisso: i ruoli RBAC reali (SuperAdmin, ruoli custom) sono invisibili.
- Il gate di modifica è incoerente: il middleware richiede `manage_users` globale, l'handler richiede legacy admin (`canEditDashboard` sul claim JWT). Il bottone "Personalizza" usa il claim JWT.
- I widget per seed (`/api/widget/*/:seed`) sono già sicuri: `content:read` sullo slug del seed più i controlli per colonna.
- LEAK REALE: tutte le rotte `/api/content/stats/*` hanno come unico gate `view_analytics` GLOBALE e non filtrano per seed. `total` somma tutti i seed, `breakdown` elenca nome e conteggio di ogni seed, `recent-activity` restituisce il log di tutti i seed (utente, email, `entity_slug`, `entity_id`, `details`), `media-library` e `unused-media` elencano i file di tutti i seed, `setup-checklist` espone gli slug. Chi ha `view_analytics` e `content:read` solo su `prodotti` vede attività e conteggi di `ordini`.
- I widget non dichiarano quali permessi richiedono e il renderer non filtra nulla.
- Il layout (JSON in `dashboard_layouts`) può contenere `config.seedSlug` di seed che il lettore non può vedere.
- Gli scope sono già per seed: l'assegnazione è (utente, ruolo, scope) con scope = `*` o slug del seed; il seed sta sull'assegnazione, non sul ruolo. Oggi solo `content:*` è valutato davvero per seed; `view_analytics`, `manage_users` e `manage_roles` sono valutati solo a livello globale.

DECISIONI PRESE:
1. Il layout non è mai l'autorità. La visibilità delle tab per ruolo è organizzazione; la protezione dei dati sta nelle rotte API, che applicano RBAC per scope. La UI nasconde per cortesia, il server rifiuta.
2. Un solo layout (scope `default`). Si eliminano gli scope `role:*`, il selettore ruoli del builder, `KNOWN_DASHBOARD_ROLES`, `roleScope`, `resolveDashboardScopeChain` e le rotte `/:scope` e `/scopes`. Le righe `role:*` già nel DB sono ignorate (il DB è solo di test, nessuna compatibilità).
3. Ogni tab (`DashboardPageLayout`) ha un campo opzionale `roleIds` (id dei ruoli RBAC, non i nomi). `roleIds` assente o vuoto = tab visibile a tutti. Non vuoto = visibile a chi ha almeno uno di quei ruoli con un'assegnazione attiva, in qualunque scope (le assegnazioni decadute non contano).
4. Il server filtra le tab prima di servire il layout, così configurazioni e widget di tab non autorizzate non arrivano al client. Toglie anche i widget con `config.seedSlug` di un seed che il chiamante non può leggere.
5. I `roleIds` sono validati al salvataggio: un id sconosciuto è un 422, mai rimosso in silenzio (svuotare la lista renderebbe la tab pubblica). Un id orfano dopo la cancellazione di un ruolo non conferisce accesso a nessuno (fail-closed); il builder lo mostra come "ruolo eliminato", rimovibile. Nessun hook sulla cancellazione del ruolo.
6. Zero legacy nella dashboard: via `canEditDashboard`, `ROLES_ALLOWED_TO_EDIT_DASHBOARD`, `user.role` in `dashboard-page`, le righe legacy di `/api/dashboard-layout` in `PROTECTED_ROUTES`. Via `role` da `ActorContext`/`resolveActor` dopo aver verificato che nessuna policy in core lo legga. Il developer mantiene sempre SuperAdmin, quindi non serve nessun bypass `isDeveloper`.
7. Nuovo permesso `manage_layout`: chi lo possiede può modificare il contenuto (sezioni, colonne, widget) delle tab dei ruoli che possiede. Esempio: un Commerciante vede la dashboard dei Commercianti ma non la modifica; se gli viene dato `manage_layout` può agire su quella tab. Il permesso può arrivare da qualunque ruolo posseduto (aggiunto al ruolo Commerciante, oppure un secondo ruolo "Layout Manager" assegnato al singolo utente). Servono: voce in `PERMISSIONS`, migrazione che allarghi il CHECK di `role_permissions` (rebuild della tabella, come `0032`), inserimento nel ruolo SuperAdmin, UI dei ruoli, locale, doc RBAC.
8. Enforcement del salvataggio: il layout è un solo documento, quindi il `PUT` di chi non ha poteri strutturali viene confrontato con il layout salvato. Le pagine non sue devono essere identiche; non può aggiungere, rimuovere o riordinare pagine; non può cambiare `roleIds` (altrimenti estenderebbe da solo la visibilità). Compare-and-swap su `updated_at` per evitare sovrascritture tra editor. Il builder di chi ha poteri parziali mostra solo le sue tab, senza gestione pagine né ruoli.
9. Ogni `WidgetDefinition` dichiara `requires` (campo opzionale additivo in `@beechcms/widget-sdk`): un permesso globale, oppure `content:read` sul seed in `config.seedSlug`, oppure `content:read` su almeno un seed. Il renderer lo valuta con `usePermissions` (stesse funzioni di core). Un widget non autorizzato è nascosto, e una sezione senza widget visibili sparisce. Il builder offre solo i widget che l'autore può usare; il generatore del default esclude ciò che l'utente non può vedere.
10. Chiusura delle sorgenti dati (Fase 1, indipendente dal resto):
   - `stats/total`, `breakdown`, `recent-activity` passano da `view_analytics` globale ad `AUTHED` con proiezione in-handler per `content:read` per seed (stesso pattern già ratificato di drafts e search, helper `filterSeedsByPermission`). Conteggi sommati sui soli seed leggibili; il log filtrato per `entity_slug` nei seed leggibili; le righe non legate a un seed (utenti, impostazioni) richiedono `manage_users`.
   - `health`, `cloudflare`, `storage/sync` restano `view_analytics` globale (infrastruttura, non dati di seed).
   - `setup-checklist` richiede un permesso amministrativo (proposta: `manage_users` globale).
   - Test d'integrazione di isolamento: utente con `content:read` su `prodotti` e `view_analytics` non riceve nulla di `ordini`.

DA DECIDERE (con proposta):
A. Media library (`media-library`, `unused-media`): non sono dati di un seed. Proposta: `content:read` globale. Alternativa: `view_analytics` globale come oggi.
B. Chi vede tutte le tab e chi può fare operazioni strutturali (creare, eliminare, riordinare tab, assegnare `roleIds`). Conflitto emerso: `manage_layout` modifica solo le tab dei propri ruoli, quindi serve un'altra regola per chi vede e gestisce tutto. Proposta: `manage_roles` globale (assegnare ruoli alle tab è amministrazione dei ruoli) per vedere tutte le tab e fare le operazioni strutturali; SuperAdmin ha entrambi. Da confermare.
C. Scope di `manage_layout` per la dashboard. Proposta: assegnazione globale (`*`); l'assegnazione su un seed vale solo per l'entry editor di quel seed (fuori da questa iterazione).
D. Tab senza widget autorizzati. Proposta: nascosta del tutto. Alternativa: mostrata con un messaggio.
E. Ordine di consegna. Proposta: Fase 1 (chiusura leak e test di isolamento) per prima, da sola, prima di toccare layout e UI.

FASI:
1. Sorgenti dati: proiezione per scope su stats, gate delle rotte infrastrutturali, decisione sulla media library, test di isolamento.
2. Layout e tab per ruolo: `roleIds`, filtro lato server, validazione, rimozione di scope per ruolo e legacy, gate su permesso RBAC, builder con multi-select di ruoli per tab (con endpoint developer-free che restituisce id, nome e icona dei ruoli, perché `/api/rbac/roles` richiede `manage_users` o `manage_roles` e lo slice dashboard non può importare lo slice `rbac`), empty state, ricaduta sulla prima tab visibile se l'URL punta a una tab non visibile, invalidazione del layout quando cambiano le assegnazioni dell'utente.
3. `requires` nei widget `core/*` e nel renderer.
4. `manage_layout`: permesso, migrazione, enforcement a diff con compare-and-swap.
5. Pulizia: `role` fuori da `ActorContext`, doc (`06-role-based-dashboards.md`, `docs/api-reference.md`, `docs/reference/rbac-api.md`).

FUORI SCOPE:
- Entry editor e gate `canEditLayout` / `/api/schema/:slug/layout` (iterazione successiva; `manage_layout` per seed è già previsto lì).
- Dashboard per utente (`user:<id>`): esplicitamente escluso dalla serie dashboard.
- Layout diversi per ruolo (un layout per ruolo con precedenza): sostituito dalle tab per ruolo.
- Priorità tra ruoli multipli: non serve, perché ogni tab ha la sua lista di ruoli e un utente vede l'unione delle tab dei suoi ruoli.
