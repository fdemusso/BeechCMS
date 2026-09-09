# 1. Feature Definition and Core Value

L'attuale documentazione di BeechCMS è organizzata secondo una struttura a sidebar singola e piatta, una pagina iniziale priva di percorsi di onboarding guidati e file tecnici monolitici, tra cui un riferimento REST API di oltre duemila righe che rende ardua la consultazione e la manutenzione. Questa configurazione penalizza l'adozione da parte degli sviluppatori e non valorizza l'architettura edge-native basata su Cloudflare Workers, D1 e R2.

Il valore fondamentale di questa iniziativa risiede nella riprogettazione dell'esperienza documentale ispirata agli standard di eccellenza di Supabase Docs, declinata in modo rigoroso sull'identità visiva e sui principi architetturali di BeechCMS. Il progetto introduce un'architettura dell'informazione a sei macro-aree con menu dedicati, navigazione laterale contestuale, una pagina principale modulare a griglia informativa orientata ai framework frontend, prompt contestuali ottimizzati per strumenti di sviluppo basati su modelli linguistici, blocchi di codice statici con persistenza delle preferenze e la scomposizione modulare a fette verticali dell'intero corpus documentale e delle specifiche API. L'intervento è indispensabile per abbattere i tempi di apprendimento, velocizzare l'avvio di nuovi progetti e garantire che la documentazione rimanga snella, focalizzata e direttamente manutenibile in sincronia con il monorepo.

# 2. Domain Boundaries and Business Rules

Il dominio della funzionalità è circoscritto alla gestione e fruizione della documentazione tecnica del CMS ed è governato dalle seguenti entità logiche e regole operative:

* Macro-Aree di Navigazione: Le sei partizioni logiche di primo livello denominate Start, Funzionalità, Build, Manage, Reference e Resources. Ciascuna area costituisce un contesto di navigazione isolato.
* Stato di Navigazione Contestuale: Meccanismo di determinazione dinamica dell'albero laterale che espone unicamente i collegamenti pertinenti all'area attualmente attiva, impedendo sovrapposizioni o visualizzazioni globali disorientanti.
* Hub Principale Modulare: Struttura di atterraggio organizzata in raggruppamenti visivi che mettono in risalto l'accesso ai framework, le capacità portanti del motore, i pacchetti client ufficiali e i principi dell'infrastruttura edge.
* Nodo di Integrazione Framework: Scheda di guida per framework supportati che include requisiti di installazione, configurazione del client e un blocco di istruzioni dedicato per assistenti di sviluppo.
* Unità Prompt per Assistenti: Testo formattato e precompilato collocato all'inizio di ciascun percorso guidato per framework, contenente comandi di preparazione, sequenza di integrazione e puntamento all'URL della documentazione per guidare l'assistente senza allucinazioni.
* Scheda di Riferimento Verticale: Singola unità documentale isolata corrispondente a un endpoint o modulo funzionale, autonoma rispetto alle altre schede e priva di dipendenze incrociate non necessarie.
* Visualizzatore di Codice Statico: Componente di presentazione arricchito per listati di istruzioni con intestazione del file, indicatore del linguaggio, selettore a schede e pulsante di copia rapida.
* Archivio Preferenze Utente: Memoria locale al browser dedicata alla conservazione deterministica delle preferenze di strumenti e gestori di pacchetti.

Regole operative inderogabili:
* Separazione tra Contenuto e Presentazione: I file documentali devono contenere unicamente testo esplicativo e codice in formato testuale standard. Qualsiasi elemento grafico avanzato deve risiedere in componenti di presentazione riutilizzabili e non deve inquinare la scrittura dei contenuti.
* Modularità a Fette Verticali: Ogni guida o specifica deve rispecchiare una singola unità funzionale del sistema. È vietata la creazione di guide trasversali che accorpino concetti eterogenei privi di coesione di dominio.
* Segregazione Netta tra Reference e Guide Pratiche: La macro-area Reference deve raccogliere unicamente contratti tecnici formali, firme di funzioni, parametri e specifiche di risposta HTTP. I flussi operativi, i tutorial di integrazione e i comandi di onboarding appartengono esclusivamente alle aree Start e Build.
* Assoluta Staticità e Assenza di Ambienti di Esecuzione: È tassativamente vietata l'inclusione di editor di codice modificabili o runtime pesanti all'interno della documentazione, al fine di garantire massime prestazioni, totale compatibilità con la generazione statica e zero overhead per il lettore.
* Vincolo di Fedeltà al Marchio: Tutti gli stili, le evidenziazioni e le componenti devono rispettare unicamente la palette cromatica e la gerarchia tipografica del marchio BeechCMS, escludendo personalizzazioni visive generiche o mutuate passivamente da terzi.

# 3. Primary Requirements (User Stories)

* AS A Sviluppatore frontend che esplora BeechCMS I WANT accedere dalla pagina principale a una griglia modulare con percorsi diretti per il mio framework web SO THAT possa avviare l'integrazione e visualizzare i contenuti edge in pochi minuti.
* AS A Sviluppatore che usa strumenti di assistenza basati su intelligenza artificiale I WANT copiare con un singolo comando un prompt precompilato all'inizio della guida del mio framework SO THAT possa guidare immediatamente il mio strumento di generazione codice con le regole corrette di BeechCMS.
* AS A Utente della documentazione I WANT selezionare le aree principali tramite menu dedicati nella barra superiore e visualizzare nella barra laterale unicamente i contenuti pertinenti alla sezione corrente SO THAT possa orientarmi rapidamente senza distrazioni esterne al contesto.
* AS A Sviluppatore che consulta esempi di comandi I WANT scegliere una sola volta il gestore di pacchetti preferito e vederlo applicato a tutti i blocchi codice del sito SO THAT non debba cambiare manualmente impostazione a ogni passaggio.
* AS A Sviluppatore backend I WANT consultare le specifiche delle interfacce applicative suddivise in pagine dedicate per ciascuna fetta funzionale SO THAT possa comprendere ed eseguire chiamate su uno specifico modulo senza scorrere un documento monolitico.
* AS A Sviluppatore che adotta i pacchetti ufficiali I WANT visualizzare schede tecniche dedicate a ciascuna libreria client separate dalle guide di avvio rapido SO THAT possa verificare puntualmente firme, interfacce ed eccezioni.
* AS A Sviluppatore che configura l'infrastruttura I WANT disporre di istruzioni chiare e isolate relative ai comandi della riga di comando, all'architettura a fette verticali e alla pubblicazione su rete distribuita SO THAT possa orchestrare il ciclo di rilascio senza ambiguità operative.
* AS A Visitatore della documentazione I WANT eseguire ricerche testuali istantanee richiamabili tramite scorciatoia da tastiera con risultati indicizzati localmente SO THAT possa rintracciare argomenti e metodi senza ritardi o dipendenze di rete.

# 4. Secondary Requirements and Logical Constraints

* Risoluzione della Barra Laterale Contestuale: Il motore di navigazione deve associare ciascun percorso di pagina al prefisso di rotta più specifico delle sei macro-aree. Qualora una pagina orfana non trovi corrispondenza esatta, la barra laterale deve ricadere sul contesto della sezione radice senza generare anomalie di rendering.
* Adattabilità su Dispositivi Mobili: Le pagine con impaginazione a colonne affiancate devono trasformarsi fluidamente su schermi di dimensioni ridotte in una successione verticale continua, anteponendo sempre la spiegazione teorica al relativo blocco illustrativo.
* Resilienza dello Stato delle Preferenze: In caso di navigazione con restrizioni di memorizzazione locale o permessi disabilitati, il selettore del gestore di pacchetti deve operare regolarmente per la sessione corrente in memoria volatile, adottando il gestore predefinito senza produrre errori a video.
* Immutabilità dei Riferimenti nei Prompt di Istruzione: Ciascun blocco di istruzioni per modelli linguistici deve incorporare collegamenti permanenti ed espliciti verso le pagine online pertinenti, garantendo la validità del riferimento documentale nel tempo.
* Conservazione dei Percorsi e Assenza di Collegamenti Interrotti: La riorganizzazione del monolite delle specifiche applicative e la redistribuzione delle guide preesistenti devono preservare la raggiungibilità delle risorse storiche mediante adeguate regole di corrispondenza o reindirizzamenti controllati.
* Contrasto e Accessibilità Visiva: Tutti i blocchi con sfumature, le etichette informative, i selettori a schede e le porzioni evidenziate di testo devono soddisfare i requisiti formali di contrasto cromatico in entrambe le modalità di visualizzazione a tema chiaro e a tema scuro.

# 5. Out of Scope (Discarded during sparring)

* Pagina di Stato Operativo dei Servizi: Scartata tassativamente per rispetto del principio di prevenzione della complessità superflua; BeechCMS opera come soluzione decentralizzata distribuita sull'infrastruttura dell'utilizzatore finale e non dispone di una centrale operativa unica di cui simulare lo stato.
* Ambienti di Esecuzione o Editor Modificabili all'Interno delle Pagine: Esclusa qualsiasi forma di console interattiva o editor di testo scrivibile a runtime per non appesantire il processo di generazione statica e preservare la velocità di consultazione.
* Meccanismi Complessi di Generazione Dinamica Automatica delle Specifiche: Rimandata la generazione automatizzata complessa da schemi a runtime; la documentazione delle interfacce applicative viene organizzata manualmente mediante una struttura a fette verticali di file statici manutenibili.
* Pagina Manuale di Registro delle Modifiche: Esclusa la duplicazione artigianale dei rilasci; il tracciamento ufficiale delle novità di versione è demandato direttamente alle note di rilascio del repository del codice sorgente.
* Guide di Integrazione per Tecnologie Secondarie Non Validate: Esclusa la stesura di guide preliminari per ambienti privi di verifica e test operativi sul campo, concentrando le risorse esclusivamente sui framework primari per ambienti distribuiti.
