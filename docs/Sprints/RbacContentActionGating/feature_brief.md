# 1. Feature Definition and Core Value

Beech CMS deve evolvere da strumento editoriale a uso interno a portale collaborativo multi-stakeholder, capace di ospitare in sicurezza account esterni (partner, fornitori, clienti B2B) accanto al proprietario del sito e al team interno. Il problema reale da risolvere è l'assenza di un sistema di identità, autorizzazione e isolamento dei dati: oggi non esiste un modo controllato per concedere a soggetti diversi accesso granulare e reciprocamente isolato a porzioni specifiche del CMS. Senza questo, ogni apertura della dashboard a terzi è un rischio (accesso indiscriminato) o un collo di bottiglia (tutto passa da un unico operatore). La feature è indispensabile perché è la precondizione per trasformare Beech CMS in una piattaforma multi-tenant affidabile, senza la quale l'ambizione B2B del prodotto resta bloccata.

# 2. Domain Boundaries and Business Rules

**Entità logiche coinvolte:**
- **Account (Utente)**: identità autenticata, creata esclusivamente da chi possiede `manage_users` (sistema chiuso a invito, nessuna auto-registrazione).
- **Ruolo**: template riutilizzabile e componibile a runtime, composto da un insieme nominato di permessi atomici presi da un enum chiuso (nessuna estensione runtime dei tipi di permesso; solo il developer, in codice, può introdurre nuovi permessi quando nasce una nuova funzionalità/schermata).
- **Scope**: perimetro di applicazione di un ruolo. Granularità a livello di Seed (`content_{slug}`), oppure scope globale (`*`) riservato a funzioni di coordinamento trasversale.
- **Assegnazione (Utente ↔ Ruolo ↔ Scope)**: tripla che lega un utente a un ruolo dentro un determinato scope. Un utente può avere N assegnazioni indipendenti (ruoli diversi su scope diversi, o più ruoli sullo stesso scope); i permessi effettivi sono l'unione additiva di tutte le assegnazioni attive. Ogni richiesta viene valutata in stile ABAC: subject-attribute (assegnazioni dell'utente) × resource-attribute (scope della risorsa richiesta) × action (permesso richiesto).
- **Invito**: token con scadenza e single-use obbligatori, che pre-associa ruolo+scope a un account non ancora attivato; l'utente completa la registrazione (imposta credenziali) tramite link.

**Confini architetturali imprescindibili (per l'Architect a valle):**
- **Dev vs BeechAdmin — asse separato, non gerarchico.** Il Developer non è un ruolo del sistema RBAC e non ha un account nella tabella utenti Beech: opera fuori dashboard, via CLI/migrazioni. È l'UNICO soggetto capace di modificare lo schema/le colonne dei Seed. Nessun permesso `manage_seeds` esiste nell'enum dashboard, in nessuna circostanza, per nessun ruolo — nemmeno BeechAdmin.
- **BeechAdmin (proprietario)**: account con scope `*`, protetto da guardrail anti-auto-eliminazione (impossibile revocare o eliminare l'ultimo SuperAdmin attivo). Governa account, ruoli, scope e contenuti; non governa lo schema.
- **Isolamento dati a livello di Seed**, non row-level: ogni soggetto isolato ha il proprio Seed dedicato, evitando filtri riga-per-riga sulla stessa tabella.
- **Regola anti-escalation**: chi possiede `manage_roles` o `manage_users` può creare/assegnare ruoli e scope solo entro (mai oltre) i permessi e gli scope che possiede lui stesso.
- **Modello puramente additivo**: nessun permesso negativo, nessuna gerarchia di conflitto tra ruoli.
- **Zero-trust di default**: account creato direttamente (non da invito) senza ruoli/scope non ha alcuna visibilità né potere, sempre.
- **Visibilità UI derivata dai permessi**: ogni schermata/funzionalità non-CRUD (es. Analytics) ha un proprio permesso dedicato nell'enum; l'assenza del permesso nasconde la sezione, senza eccezioni di default.

# 3. Primary Requirements (User Stories)

* AS A BeechAdmin I WANT invitare un nuovo account pre-assegnandogli ruolo e scope tramite link di invito con scadenza SO THAT posso onboardare partner/collaboratori senza mai esporre accessi non controllati
* AS A BeechAdmin I WANT definire ruoli componibili a runtime scegliendo permessi da un set atomico predefinito SO THAT posso adattare i permessi alla natura mutevole di ogni collaborazione senza intervento del developer
* AS A titolare di `manage_roles`/`manage_users` scoped I WANT assegnare ruoli e scope ad altri utenti solo entro i permessi e gli scope che possiedo SO THAT non posso mai generare un'escalation di privilegio oltre il mio potere
* AS A partner/fornitore esterno I WANT operare solo sul Seed a me assegnato SO THAT i miei dati restano isolati da quelli di altri soggetti sulla stessa piattaforma
* AS A BeechAdmin I WANT creare un account con solo permesso `content:read` SO THAT posso concedere accesso demo/sola-visualizzazione senza rischio di modifica
* AS A editor con permessi limitati I WANT non vedere sezioni come Analytics per cui non ho permesso SO THAT l'interfaccia riflette esattamente ciò che sono autorizzato a fare, senza confusione o superficie d'attacco extra
* AS A BeechAdmin I WANT disattivare/riattivare un account con revoca istantanea delle sessioni attive SO THAT posso reagire immediatamente a un accesso non più autorizzato
* AS A developer I WANT restare l'unico soggetto capace di modificare lo schema dei Seed SO THAT nessuna azione da dashboard, a nessun livello di privilegio, può danneggiare la struttura dati di Beech

# 4. Secondary Requirements and Logical Constraints

- L'invito, se scaduto prima del completamento, deve poter essere rigenerato da chi ha `manage_users` mantenendo la stessa pre-assegnazione ruolo+scope, senza ricreare l'account da zero.
- La disattivazione di un account è reversibile (booleano attivo/disattivo); non è richiesta una distinzione con l'eliminazione definitiva per la prima iterazione della feature.
- Se un Seed viene eliminato o disattivato, tutti gli scope associati a quel Seed, per qualunque account, decadono coerentemente (nessuna assegnazione "orfana" resta valida).
- L'enum dei permessi è chiuso: `content:read`, `content:create`, `content:update`, `content:delete` (scoped su Seed), `manage_users` (scoped), `manage_roles` (scoped), più un permesso dedicato per ciascuna schermata/funzionalità non-CRUD futura (es. `view_analytics`). `manage_seeds` non fa parte dell'enum e non può mai essere aggiunto tramite RBAC.
- Un utente con `manage_users`/`manage_roles` scoped su Seed X non può mai assegnare un ruolo o uno scope che ecceda Seed X, indipendentemente dai permessi del ruolo stesso.
- Ultimo SuperAdmin attivo (scope `*` con pieni poteri) non può essere auto-revocato né eliminato, da nessun soggetto, incluso se stesso.
- Ogni nuova schermata/funzionalità dashboard non-CRUD introdotta in futuro richiede l'aggiunta di un nuovo permesso dedicato in codice (mai a runtime), da nascondere per default a chi non lo possiede.

# 5. Out of Scope (Discarded during sparring)

- Permessi negativi o gerarchie di conflitto tra ruoli (scartato: il modello resta puramente additivo).
- Estensione runtime dell'enum dei permessi (es. permessi custom da plugin): scartato, enum resta chiuso e gestito solo dal developer in codice.
- Ruolo duplicato per scope (es. "Editor-SeedA", "Editor-SeedB" come oggetti distinti): scartato in favore della tripla Utente↔Ruolo↔Scope in stile ABAC, per evitare esplosione di oggetti Ruolo.
- Distinzione disattivazione vs eliminazione account con gestione differenziata dei dati storici: scartato per questa iterazione, basta un toggle attivo/disattivo.
- `content:publish` come permesso separato da `content:update` (workflow draft/publish): fuori scope, nessun bisogno confermato in questa fase.
- Qualunque permesso `manage_seeds` o equivalente esposto a livello dashboard/RBAC: escluso categoricamente, resta esclusivo del developer fuori sistema.
- Filtri di isolamento dati row-level sulla stessa tabella: scartato in favore di isolamento a livello di Seed dedicato.
