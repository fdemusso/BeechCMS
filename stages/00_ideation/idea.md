# Plan: hardening di `packages/core/src/engine/validation.ts`

Questo documento definisce la strategia per il rafforzamento (hardening) del motore di convalida, distinguendo i debiti reali (sicurezza ed efficienza strutturale) dai tentativi di over-engineering (YAGNI).

---

## 1. Sicurezza e Stabilità (Priorità Assoluta)

Questi sono i reali gap di sicurezza e robustezza che vanno risolti:

1. **Gestione Errori in `relationSchema`**: Convertire il `throw Error` (quando `idGenerator` è assente) in un `ValidationDetail` strutturato invece di far saltare la chiamata API.
2. **Hardening dei Protocolli XSS**: Estendere `DANGEROUS_PROTOCOL_REGEX` per bloccare non solo `javascript:`, ma anche `data:` e `vbscript:`.
3. **Protezione da Stack Overflow (DoS)**: Introdurre un limite di profondità di ricorsione (es. max 50 livelli) in `walkRichtextNode` e `gatherRichtextText` per proteggere l'isolate da payload RichText ricorsivi malevoli.

---

## 2. Efficienza Reale (Ottimizzazione del Registro)

L'unica ottimizzazione di efficienza strutturale con un beneficio misurabile:

* **Registry Version Token Skip**: In `seed-registry-cache.ts`, se il `version` token ottenuto da D1 è identico a `cache.version`, evitare di ricaricare i seed con `listActive()` e di ricostruire la `SeedRegistry` ogni 5 secondi, limitandosi ad aggiornare `cache.builtAt = now`. 
  * *Perché*: Questo elimina alla radice la rotazione ciclica dei riferimenti in memoria degli oggetti `Seed`, rendendo i riferimenti stabili per l'intera vita del Worker isolate ed evitando query D1 ridondanti.

---

## 3. Cimitero delle Idee (Scartate / YAGNI)

Queste idee sono state analizzate e scartate perché introducono complessità ingiustificata senza un ritorno misurabile:

* **Cache a Due Livelli (WeakMap + Map)**: **Scartata**. Con l'ottimizzazione del registro (punto 2), i riferimenti degli oggetti `Seed` rimangono stabili. Scrivere codice di cache L1 con `WeakMap` solo per evitare il costo di `JSON.stringify` su un oggetto di poche decine di campi è un classico caso di ottimizzazione prematura non misurata.
* **Split in 5 Sotto-Moduli**: **Scartato**. Dividere `validation.ts` in 5 piccoli file aumenta il carico di navigazione ed esportazione (barrel file) senza un reale beneficio. Il monolito da 1100 righe è ben diviso da commenti strutturati e si mantiene leggibile.
* **Supporto Notazione Scientifica per Step Check**: **Scartato**. Edge case teorico (`1e-7`) per il quale non esistono use-case reali nel CMS.
* **Test di Completezza Automatico per Fingerprint**: **Scartato**. Troppo complesso da implementare (richiede introspezione a runtime dei tipi TypeScript di `Branch`) a fronte di modifiche molto infrequenti alla struttura del branch.
* **Typing di `flattenZodIssues`**: **Scartato**. Il cast `(issue as any).errors` funziona correttamente e la riscrittura per soddisfare i tipi interni di Zod non porta stabilità aggiuntiva.
