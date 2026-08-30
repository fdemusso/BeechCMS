# 1. Feature Definition and Core Value

Il sistema attuale di rate limiting soffre di starvation su burst leciti di traffico nelle API pubbliche (dovuto a finestre temporali fisse e rigide) e di vulnerabilità ad attacchi brute force / credential stuffing distribuiti su endpoint di autenticazione critici (poiché limitati unicamente per IP client).

Questa feature modernizza l'infrastruttura di protezione di BeechCMS introducendo:
1. Un algoritmo di rate limiting a Token Bucket con riempimento fluido e continuo per assorbire burst leciti su route pubbliche senza incorrere in falsi positivi o boundary spikes.
2. Un meccanismo Dual-Key (IP + Account normalizzato) sugli endpoint di autenticazione sensibili per mitigare attacchi distribuiti tramite proxy rotanti e tentativi di password guessing mirati.
3. Un'architettura deterministica e unificata tra ambienti di sviluppo, test di integrazione e produzione, eliminando divergenze comportamentali.

# 2. Domain Boundaries and Business Rules

### Entità Logiche e Responsabilità
* **Rate Limiter Engine**: Motore in-memory responsabile del calcolo dei token rimanenti, del rate di ricarica continuo su base temporale e della determinazione del tempo di attesa per le richieste respinte.
* **Dual-Key Coordinator / Middleware**: Componente di coordinamento preposto all'estrazione, normalizzazione delle chiavi (IP client ed identificativo account) e alla valutazione atomica dei limiti applicabili.
* **Clock Abstraction**: Fornitore di riferimento temporale per consentire avanzamento virtuale del tempo nei test e tempo reale in runtime.
* **Public Problem Details Formatter**: Formattatore delle risposte di errore standardizzate conformi a RFC 7807 con arricchimento degli header di controllo del traffico.

### Regole di Business
* **Isolamento dello Stato Utente**: Il rate limiting non deve in alcun caso alterare lo stato persistente o lo schema dell'entità Utente nel database (nessuna colonna di blocco o flag di lockout).
* **Priorità di Blocco nel Dual-Key**: Se una richiesta viola anche solo uno dei due limiti associati (chiave IP o chiave Account), l'accesso deve essere immediatamente respinto con stato HTTP 429.
* **Normalizzazione Rigorosa dell'Account**: Qualsiasi indirizzo email utilizzato come chiave di rate limit deve essere normalizzato (rimozione di spazi perimetrali e conversione in minuscolo) prima della verifica del bucket.
* **Protezione Pre-Database su Refresh**: L'endpoint di rinnovo token deve essere protetto esclusivamente a livello di IP client a monte, senza effettuare lookup o decodifiche su database prima della validazione del rate limit.
* **Politica di Riservatezza degli Header**: Gli header informativi sulla quota residua non devono essere esposti sugli endpoint di autenticazione per prevenire attività di ricognizione da parte di attaccanti.

# 3. Primary Requirements (User Stories)

* AS A sviluppatore frontend / consumatore API I WANT poter effettuare richieste concorrenti e burst iniziali sulle route pubbliche SO THAT l'applicazione possa caricare i dati necessari senza subire blocchi prematuri dovuti a finestre fisse.
* AS A utente del sistema I WANT che il mio account sia protetto da attacchi di credential stuffing distribuiti su molteplici IP SO THAT malintenzionati non possano violare le mie credenziali tramite tentativi massivi automatizzati.
* AS A amministratore di sistema I WANT che gli endpoint di login e recupero password blocchino tempestivamente sia attacchi volumetrici da singolo IP sia attacchi distribuiti verso una specifica email SO THAT l'infrastruttura e le identità digitali rimangano protette.
* AS A client API I WANT ricevere l'header HTTP standard di attesa quando supero il limite consentito SO THAT possa implementare strategie corrette di backoff e riprovare la richiesta solo quando consentito.
* AS A sviluppatore del team I WANT eseguire la suite di test di integrazione in locale con lo stesso comportamento del rate limiting di produzione SO THAT i test siano stabili, veloci e privi di falsi fallimenti dovuti a simulatori esterni.

# 4. Secondary Requirements and Logical Constraints

### Gestione degli Header HTTP
* Sulle route pubbliche consentite (2xx) e respinte (429), includere gli header indicanti la capacità massima consentita e i token rimanenti nel bucket.
* In caso di risposta HTTP 429 su qualsiasi endpoint (pubblico o di autenticazione), includere obbligatoriamente l'header con il numero intero di secondi da attendere prima del successivo tentativo utile.
* Sugli endpoint di autenticazione non devono mai essere inclusi header di quota residua o limite massimo nelle risposte con stato 2xx o 401.

### Gestione Errori e Casi Limite
* **Payload Malformato o Mancante**: Se una richiesta verso un endpoint protetto da Dual-Key presenta un body non valido o privo di email, la richiesta deve essere valutata sul rate limiter dell'IP e successivamente respinta con HTTP 400 Bad Request, senza allocare o consumare token per chiavi account fittizie.
* **Calcolo del Tempo di Attesa Frazionario**: Il calcolo del tempo di attesa deve arrotondare per eccesso al secondo intero successivo per garantire che, alla scadenza del tempo indicato, sia effettivamente disponibile almeno un token intero.
* **Decadimento Naturale della Memoria**: La struttura in-memory deve consentire il naturale rilascio dei bucket non più attivi senza causare memory leak nel lungo periodo.
* **Comportamento su Refresh Token**: La verifica del limite per la richiesta di refresh token deve avvenire tassativamente prima di qualsiasi operazione di hashing crittografico o interrogazione alle tabelle delle sessioni.

# 5. Out of Scope (Discarded during sparring)

* **Persistenza Distribuita / Cross-Edge del Token Bucket**: Esclusa l'adozione di layer di sincronizzazione distribuita (Durable Objects, KV, storage centralizzato) per le route pubbliche, a favore della gestione in-memory locale per nodo/isolate, evitando overhead di latenza e complessità architetturale.
* **Device Fingerprinting e Blacklist/Whitelist Dispositivi**: Esclusa la creazione di sottosistemi di tracciamento browser/dispositivo, regole di whitelist o gestione manuale di IP bloccati, demandando la difesa ai meccanismi standard di rate limiting HTTP.
* **Account Lockout Persistente a Database**: Escluso qualsiasi blocco temporale dell'account memorizzato su database (es. disabilitazione utente per 30 minuti), per eliminare il rischio critico di Denial-of-Service mirato e asimmetrico ai danni di utenti legittimi.
* **Rate Limiting Basato su Risultato Post-Auth**: Esclusa la differenziazione complessa tra credenziali valide ed errate a fini di addebito quota, mantenendo la barriera protettiva a livello di middleware/handler prima della logica di business.
