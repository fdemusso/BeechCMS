# 1. Feature Definition and Core Value

Oggi la Command Palette di BeechCMS è un semplice selettore di pagine e schemi. Chi usa il CMS (editor) e chi lo programma (developer) deve conoscere la struttura dei menu per raggiungere una schermata o eseguire un'azione, e per i compiti minori (un calcolo, una conversione di unità o di colore, un appunto) deve lasciare BeechCMS e aprire altri strumenti che non tutti hanno a disposizione.

BeechPal trasforma la palette nella superficie primaria di navigazione e azione da tastiera. Risolve tre problemi:

* **Raggiungibilità:** ogni schermata e ogni azione frequente si raggiunge digitando, senza conoscere la gerarchia dei menu.
* **Azione nel contesto:** chi sta modificando un contenuto o gestendo i media trova in cima le azioni pertinenti alla pagina in cui si trova.
* **Continuità del lavoro:** calcoli, conversioni e appunti rapidi si fanno senza uscire da BeechCMS.

Il valore è il tempo risparmiato e il lavoro che procede interamente da tastiera. L'interfaccia si adatta alla persona: ciascuno vede e può usare solo ciò che il proprio ruolo consente.

# 2. Domain Boundaries and Business Rules

## Entità logiche coinvolte

* **Palette:** il contenitore che raccoglie le voci, le ordina per pertinenza e le presenta in un'unica lista. Non conosce il dominio delle altre feature.
* **Provider di voci:** sorgenti indipendenti che contribuiscono con righe alla lista (navigazione, azioni di contesto, comandi di sistema, ricerca contenuti, calcolatrice, conversioni, Quick Notes, pin). Ogni provider risponde solo del proprio tipo di voce.
* **Feature ospiti (editor di contenuto, media library, altre pagine):** dichiarano le proprie azioni di contesto. La palette le raccoglie e non le importa né le implementa.
* **Contesto:** la pagina attiva, il tema, il ruolo e i permessi dell'utente corrente.
* **Utente e RBAC:** l'utente e il suo insieme di permessi con scope, valutati dallo stesso valutatore che governa il resto del dashboard.
* **Preferenze UI dell'utente:** un contenitore strutturato per utente, persistito lato server, che in questa feature ospita solo i pin.
* **Quick Notes:** appunti locali al browser, mai inviati al server.
* **Indice di ricerca lessicale:** i dati testuali dei contenuti su cui opera la ricerca.

## Regole di business inderogabili

1. **Un solo percorso di esecuzione.** Ogni azione che modifica dati, invocata dalla palette, passa dallo stesso percorso (validazione, permessi, effetti) del pulsante equivalente nell'interfaccia. La palette non ha una seconda implementazione.
2. **Conferma sulle azioni distruttive o irreversibili.** Svuotare il cestino, pubblicare e analoghe azioni chiedono sempre conferma prima di eseguire.
3. **RBAC come unica fonte di autorità.** La palette usa lo stesso valutatore dei permessi del resto del dashboard e non ne reimplementa la logica. Il server resta l'enforcement reale; la palette ha solo effetto cosmetico.
4. **Visibilità per permesso.**
   * Le superfici per cui l'utente non ha alcun permesso non compaiono (ad esempio Content Types senza il permesso di gestione degli schemi).
   * Le azioni che l'utente non può eseguire compaiono **disabilitate**, con l'indicazione del permesso mancante, mai nascoste e mai cliccabili.
5. **Confini tra slice.** La palette non dipende dal codice interno delle altre feature. Sono le feature a dichiarare le proprie azioni, e la palette le aggrega e le filtra per permessi.
6. **Nessun accesso diretto al database** dal livello palette; si usano i contratti esistenti dei repository e delle API.
7. **Prefissi facoltativi.** Senza prefisso la palette riconosce da sola il tipo di input. Il prefisso, se presente, instrada direttamente al provider corrispondente. Set ammesso: comandi di sistema, calcolatrice, Quick Notes, ricerca ristretta ai contenuti.
8. **Risultati in riga, nessun pannello laterale.** Il risultato di un calcolo o di una conversione compare come riga sotto la barra di input, nella stessa lista dei risultati. Le informazioni secondarie dei risultati di ricerca (stato, autore, data) compaiono come descrizione nella riga stessa.
9. **Coesistenza dei risultati.** Un input ambiguo non viene "dirottato" verso un solo provider: produce più righe ordinate per pertinenza (ad esempio, per un input che è sia un'espressione aritmetica sia un titolo, la sottrazione per prima e il contenuto omonimo subito dopo).
10. **Voci locali a latenza nulla.** I provider locali (calcolatrice, conversioni, note, comandi statici, navigazione, pin) rispondono in modo sincrono e senza attese percepibili durante la digitazione.
11. **Preferenze utente a chiavi chiuse.** Il contenitore delle preferenze UI ammette solo un elenco fisso di chiavi, validato lato server, con un limite massimo di dimensione. Questa feature scrive una sola chiave, quella dei pin.
12. **Persistenza per tipo di dato.**
    * Pin: per utente, persistiti lato server.
    * Voci recenti: solo nel browser, perché cambiano a ogni navigazione e si ricostruiscono da sole.
    * Quick Notes: solo nel browser, mai sincronizzate.

# 3. Primary Requirements (User Stories)

* AS A editor I WANT aprire la palette da tastiera e digitare il nome di una pagina o di una sezione SO THAT raggiungo la schermata senza conoscere la struttura dei menu.
* AS A developer I WANT raggiungere da tastiera schermate tecniche come Content Types, utenti e ruoli e le impostazioni di piattaforma SO THAT lavoro più velocemente sul sistema.
* AS A editor I WANT trovare in cima alla palette le azioni pertinenti alla pagina in cui mi trovo (ad esempio salva come bozza, pubblica, duplica, copia ID, storico revisioni quando modifico un contenuto) SO THAT eseguo le operazioni frequenti senza usare il mouse.
* AS A editor I WANT le azioni sulla media library (carica un asset, filtra per immagini, svuota il cestino) disponibili dalla palette SO THAT gestisco i media da tastiera.
* AS A utente con permessi limitati I WANT vedere disabilitate, con il permesso mancante indicato, le azioni che non posso eseguire e non vedere affatto le superfici a cui non ho accesso SO THAT la palette si adatta al mio ruolo e non mi induce a tentare operazioni vietate.
* AS A editor I WANT cercare un contenuto per titolo o testo direttamente dalla palette SO THAT lo apro senza passare dalle liste.
* AS A editor I WANT scrivere un'espressione aritmetica e vedere subito il risultato in una riga sotto la barra SO THAT faccio un calcolo senza lasciare BeechCMS.
* AS A editor I WANT convertire unità CSS, unità di storage, colori e timestamp scrivendo una richiesta come "16px to rem" SO THAT ottengo il valore senza strumenti esterni.
* AS A utente della palette I WANT che Invio su un risultato di calcolo o conversione copi il valore negli appunti e chiuda la palette con un messaggio di conferma SO THAT posso incollarlo subito dove serve.
* AS A editor I WANT salvare un appunto al volo scrivendolo nella palette, rivederlo, copiarlo ed eliminarlo SO THAT annoto un promemoria mentre scrivo un articolo.
* AS A developer I WANT eseguire comandi di sistema dalla palette (cambiare tema, audit degli schemi, stato del Worker, esportazione dei seed, log delle automazioni) SO THAT diagnostico e amministro senza cercare la pagina giusta.
* AS A utente della palette I WANT commutare dalla palette le mie preferenze personali (ad esempio tema, lingua, notifiche) SO THAT le cambio al volo.
* AS A utente della palette I WANT fissare tra i preferiti le voci che uso più spesso e ritrovarle in cima alla palette su qualsiasi browser o dispositivo SO THAT il mio spazio di lavoro riflette le mie abitudini.
* AS A utente esperto I WANT usare dei prefissi facoltativi per instradare subito la query al provider giusto SO THAT agisco più velocemente quando conosco la piattaforma.
* AS A utente della palette I WANT vedere tra le voci iniziali quelle usate di recente SO THAT riapro rapidamente ciò su cui ho appena lavorato.
* AS A utente della palette I WANT che la lista di scorciatoie da tastiera sia consultabile come voce normale SO THAT scopro i comandi disponibili senza un prefisso dedicato.

# 4. Secondary Requirements and Logical Constraints

## Esecuzione delle azioni e sicurezza
* Un'azione invocata dalla palette produce gli stessi errori, gli stessi messaggi e gli stessi effetti collaterali del pulsante equivalente. Se la validazione del contenuto fallisce (campi obbligatori mancanti, modifiche non salvate in conflitto), la palette mostra lo stesso esito del pulsante e non aggira nulla.
* Le azioni distruttive o irreversibili mostrano una conferma esplicita. Annullare la conferma lascia lo stato invariato e riporta alla palette.
* Un'azione disabilitata per mancanza di permesso non è eseguibile né con Invio né con scorciatoie. Un utente che perde un permesso durante la sessione vede la voce passare a disabilitata alla riapertura successiva della palette.
* Il server rifiuta comunque ogni richiesta non autorizzata; l'interfaccia della palette non è mai l'unico controllo.
* Se i permessi dell'utente non sono ancora disponibili (nessun payload), la palette si comporta come per un utente senza autorità: nessuna superficie protetta e nessuna azione abilitata.
* Le azioni distruttive su un contenuto aperto non devono agire su un record diverso da quello visibile: l'identità del bersaglio si fissa al momento della selezione dell'azione.

## Azioni di contesto
* Le azioni di contesto dipendono dalla pagina attiva e cambiano con la navigazione. Se la pagina non dichiara azioni, la palette mostra solo navigazione e comandi generali.
* Se una feature dichiara un'azione il cui bersaglio non esiste più (contenuto cancellato nel frattempo), l'azione fallisce con un messaggio chiaro, senza lasciare stato parziale.

## Ricerca (solo lessicale)
* La ricerca opera in modo lessicale e locale, sui dati testuali dei contenuti (titolo e campi testuali). La ricerca semantica non è inclusa.
* La ricerca non blocca la digitazione: le voci locali restano immediate mentre i risultati dei contenuti arrivano in coda, e una nuova digitazione annulla la ricerca precedente ancora in corso.
* Se i dati di ricerca non sono disponibili o la sorgente fallisce, la palette resta pienamente utilizzabile per tutte le altre voci e non mostra un errore bloccante.
* I risultati di ricerca rispettano la visibilità per permessi: l'utente non vede contenuti di seed che non può leggere.
* Con query vuota nessun contenuto viene elencato in massa; compaiono pin, recenti e navigazione.

## Calcolatrice, conversioni, colori
* Il parser delle espressioni è locale e sicuro e non usa valutazione dinamica di codice.
* Un'espressione non valida, incompleta o con divisione per zero non produce una riga di risultato e non genera errori visibili: la palette prosegue con gli altri risultati.
* Un input come "2025-5" produce due righe: la sottrazione come prima, il contenuto omonimo come seconda. L'ordine si basa sulla pertinenza e non va a scapito di nessuno dei due provider.
* Le conversioni coprono unità CSS (pixel e rem con base dichiarata), unità di storage, conversione di colori (ad esempio da esadecimale a RGB) e timestamp Unix. Le conversioni non riconosciute non producono righe.
* Le conversioni sono deterministiche e funzionano offline.

## Quick Notes
* Le note risiedono solo nel browser e sono separate per utente: un altro utente che accede dallo stesso browser non vede le note del precedente.
* Il numero di note e la lunghezza di ciascuna hanno un tetto, per non esaurire la quota di archiviazione del browser. Al raggiungimento del tetto l'utente riceve un messaggio chiaro e nessuna nota viene persa in silenzio.
* Al salvataggio di una nota compare un avviso visibile che dice che è salvata solo su questo browser.
* Se l'archiviazione del browser non è disponibile (navigazione privata, dati bloccati o svuotati), la palette funziona comunque e comunica che le note non sono salvabili.
* Una nota vuota non viene salvata. L'eliminazione di una nota è immediata e riguarda solo quella nota.

## Pin e preferenze utente
* Si possono fissare solo voci stabili: destinazioni di navigazione, comandi statici e seed. Sono esclusi i risultati di ricerca e le azioni parametriche legate a un record specifico.
* Il numero di pin ha un tetto basso, in modo che la sezione resti una scorciatoia.
* Ogni pin si ricalcola con RBAC a ogni apertura della palette. Un pin per cui l'utente perde il permesso resta in elenco e appare disabilitato; non viene cancellato, e torna attivo se il permesso torna.
* Un pin che si riferisce a una voce non più esistente (ad esempio un seed eliminato) non produce errori: viene mostrato come non disponibile o omesso, senza bloccare la palette.
* Le preferenze UI sono nuove rispetto a quelle di notifica esistenti, che non vanno riutilizzate né mescolate. Il contenitore ha chiavi chiuse, limite di dimensione e validazione lato server. Un utente senza dati parte da un contenitore vuoto, senza bisogno di backfill.
* Scrivere i pin richiede la persistenza lato server: se la scrittura fallisce, l'utente riceve un errore comprensibile e l'elenco mostrato non resta in uno stato falsamente salvato.
* Le preferenze di un utente non sono leggibili né modificabili da altri utenti.
* Le voci recenti restano locali al browser e si possono perdere senza danno.

## Comandi e impostazioni
* Le preferenze personali (tema, lingua, notifiche) si commutano direttamente dalla palette.
* Le impostazioni di piattaforma (SMTP, Turnstile, backup, storage) non si commutano dalla palette: la voce apre la pagina di impostazioni corrispondente. Compaiono solo per chi ha i permessi necessari.
* I comandi di sistema e diagnostica compaiono soltanto per i ruoli con il permesso pertinente.

## Prefissi e tastiera
* Senza prefisso la palette funziona in modo completo. Con il prefisso, la query viene instradata subito al provider corrispondente e le altre voci non compaiono.
* L'attivazione globale da tastiera e le scorciatoie esistenti (apertura, creazione rapida, ritorno indietro con cancellazione su input vuoto) continuano a funzionare.
* Invio esegue l'azione primaria della riga selezionata; l'azione secondaria, la copia dell'identificativo o del valore e il sottomenu delle azioni sono accessibili da tastiera.
* I testi della palette seguono il sistema di traduzione già usato dal dashboard.

## Prestazioni e stato
* La palette si apre e risponde senza ritardo percepibile. I dati necessari alle voci locali sono già disponibili all'apertura.
* La chiusura della palette azzera la query e riporta la navigazione alla pagina iniziale.

# 5. Out of Scope (Discarded during sparring)

* **Convertitore di valuta:** scartato. Richiederebbe un provider esterno di tassi di cambio, una cache e una politica per i tassi scaduti, con una dipendenza di terze parti e un dato finanziario di cui nessuno garantisce l'accuratezza. Riapribile solo con un caso d'uso concreto in un flusso di lavoro di BeechCMS.
* **Pannello di dettaglio laterale (master-detail / inspector):** scartato. Il risultato di un calcolo e le informazioni secondarie stanno nella riga stessa, come nella palette di riferimento.
* **Provider `@` per utenti, ruoli e permessi:** scartato. È solo navigazione e già coperto dalla voce di navigazione agli utenti e ruoli, visibile per permesso.
* **Prefissi `$`/`~` per le conversioni e `?` per guida e scorciatoie:** scartati. Le conversioni si riconoscono dall'input e le scorciatoie sono una voce normale.
* **Ricerca semantica (Tier 2), embedding e fusione dei ranking:** esclusa dalla prima versione. Dipende dalla generazione dell'indice vettoriale, oggi non presente nel repository, e dall'embedding della query, che è una chiamata al Worker a ogni digitazione. Da trattare come feature separata, lasciando predisposta l'interfaccia dei provider.
* **Workers AI e funzioni generative o basate su LLM:** esclusi finché non c'è una valutazione strategica sull'AI in BeechCMS.
* **Sincronizzazione cloud delle Quick Notes:** esclusa. Restano nel browser, senza backend dedicato e senza migrazione per le note.
* **Commutazione dalla palette delle impostazioni di piattaforma** (SMTP, Turnstile, backup, storage): esclusa per gli effetti collaterali e le dipendenze. Solo navigazione verso la pagina corrispondente.
* **Pin di risultati di ricerca e di azioni parametriche legate a un record:** esclusi. Si fissano solo voci stabili.
* **Persistenza lato server delle voci recenti:** esclusa. Resta locale al browser.
* **Uso del contenitore delle preferenze UI come archivio generico:** escluso. Chiavi chiuse e una sola chiave scritta da questa feature; qualsiasi altro dato per utente richiede una decisione esplicita a parte.
* **Riutilizzo delle preferenze di notifica esistenti per i pin:** escluso, per non mescolare dati di natura diversa.
* **Ordinamento e sprint di implementazione:** non definiti qui. Spettano all'agente della fase successiva.
