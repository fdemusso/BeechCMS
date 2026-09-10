# Idea: Sistema Multi-Account, Ruoli, Scope e Permessi in Beech CMS

## Visione e Obiettivo
Trasformare la dashboard di Beech CMS non solo in uno strumento editoriale interno, ma anche in una piattaforma collaborativa e un **portale B2B sicuro multi-stakeholder** (es. proprietario del sito, partner, fornitori esterni che caricano e gestiscono i propri contenuti in modo isolato).

---

## I Pilastri Concettuali

### 1. Identità e Account
* **Sistema Chiuso a Invito:** Gli account non si registrano liberamente; vengono creati o invitati esclusivamente da un amministratore.
* **Autenticazione & Identità:** Ogni richiesta trasporta l'identità dell'utente autenticato (es. tramite token/JWT).
* **Zero-Trust di default:** Un nuovo account creato senza ruoli o scope associati non ha visibilità né poteri su alcun dato.

### 2. Ruoli Dinamici (Capacità Astratte)
* **Componibilità a Runtime:** I ruoli non sono hardcoded nel codice, ma possono essere definiti e personalizzati a runtime dall'amministratore per adattarsi alla natura headless e mutevole di Beech CMS.
* **Permessi Atomici:** I ruoli sono collezioni nominative di permessi elementari:
  * Operazioni sui contenuti (`read`, `create`, `update`, `delete`).
  * Funzionalità e schermate di sistema (`manage_users`, `manage_roles`, `manage_seeds`).

### 3. Scope (Perimetro di Applicazione)
* **Associazione Tripla (Utente ↔ Ruolo ↔ Scope):** Il ruolo è astratto (es. "Editor"); lo scope determina *dove* ha valore quel ruolo per un dato utente (es. *"L'utente Marco ha il ruolo Editor sul Seed `prodotti_acme`"*).
* **Isolamento a Livello di Seed:** L'isolamento dei dati tra soggetti diversi avviene a livello di Seed (ogni venditore/partner ha il proprio Seed dedicato), evitando la complessità di filtri row-level sulla medesima tabella. Le aggregazioni avvengono tramite relazioni e automazioni.
* **Scope Globale (`*`):** Riservato a figure di coordinamento o amministrazione per operare trasversalmente su tutti i seed.

### 4. Regola di Risoluzione dei Permessi
* **Modello Puramente Additivo:** Nessun sistema di permessi negativi o conflitti gerarchici complessi. I permessi associati all'utente (anche attraverso ruoli multipli) si sommano in modo prevedibile e trasparente.

---

## Guardrail Logici Fondamentali
* **Protezione SuperAdmin:** Deve essere impossibile auto-revocare o eliminare l'ultimo SuperAdmin attivo del sistema.
* **Ciclo di vita delle risorse:** Se un Seed viene eliminato o disattivato, gli scope associati a quel Seed per i vari account decadono coerentemente.
