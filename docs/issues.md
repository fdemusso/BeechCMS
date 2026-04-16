# Public API DX Issues & Hardships

Appunti e difficoltà riscontrate durante la creazione e l'integrazione del Testsite React (`apps/testsite`) con la Public API documentata:

## 1. Wrapper `{ data }` obbligatorio sulle chiamate `POST /:seed/add`
Sebbene la documentazione menzionasse un possibile require per il wrapper `data`, non era esplicitato ad alto livello in modo netto. In `publicAddHandler` c'è un check rigido su `body.data`:
```json
{
  "status": "draft",
  "slug": "optional",
  "data": { ... }
}
```
**Difficoltà DX:** I frontend developer potrebbero istintivamente inviare gli alias in un flat-object se non debitamente istruiti, ricevendo un errore 400 (`invalid-data-object`).

## 2. Assenza o scarsa chiarezza sulla gestione CORS
Richiedendo i dati dall'ambiente Vite (es. `localhost:5173`) alla porta API configurata (`localhost:8789`), si va in contro a potenziale blocco CORS a meno che l'API non emetta correttamente `Access-Control-Allow-Origin: *` o listi specifici trusted-origins. **Task suggerita:** Confermare l'aggiunta del middleware `cors()` in API per le chiamate `/public`.

## 3. Gestione e Normalizzazione degli Errori (RFC Problem Details)
L'API esegue rigidamente lo standard RFC Problem Details (`application/problem+json`).  
Quando il frontend riceve un 400/422, deve ispezionare le chiavi `title`, `detail` e opzionalmente l'array `errors` al posto dei classici `message` o `error`. Questo è ottimo per la stabilità, ma la typed SDK (o il fetching) richiede un boilerplate standard. **Aggiunta di un SDK generico in `@beech/core` aiuterebbe molto la DX.**

## 4. Gestione Media e "asset-list"
In `prodotti` (`prd_06`) è definito un campo di tipo `file` con `format: 'asset-list'` e `multiple: true`. Questo restituisce l'array stringificato in `JSON` e va parsato manualmente lato client prima di mostrarlo in galleria, piuttosto che arrivarci nativamente come `Array<string>`.
```tsx
let images = []
try { images = JSON.parse(data.prd_06) } catch {}
```

## 5. Idempotency Key
Implementare un retry automatico richiede obbligatoriamente l'invio e memorizzazione di `Idempotency-Key` nel lato client se si usa POST per non triggerare conflitti (il check è molto utile, ma i DEV devono ricordarsi di abilitarlo sulla chiamata fetch).

---
**Esito integrativo:** Nonostante questi piccoli attriti "by-design", la Public API risponde in modo estremamente rapido, documentabile e restrittivo (il fail-closed sulle whitelist dei campi funziona benissimo). Il test site dimostra la fattibilità usando modern tooling e Shadcn UI in tempi record.

## 6. Discrepanza Chiavi API nella Documentazione
La documentazione (`docs/public-api.md`) indicava `dev-public-key-changeme` nei curl di esempio, ma il backend (`wrangler.jsonc` e policy) richiede chiavi separate per lettura e scrittura: `dev-public-read-key-changeme` e `dev-public-write-key-changeme`.
**Difficoltà DX:** Seguire il tutorial curl / la prima configurazione con la chiave consigliata portava a `401 Unauthorized` (risolta nel testsite usando la read-key appropriata).

## 7. Struttura dei Dati (Flattening e Alias)
Dai test sul campo è emerso che i client frontend tendono istintivamente a leggere i dati grezzi prelevati usando le chiavi di storage fisico (es. `art_01`, `art_02`, o `pag_01`), annidati in un ipotetico oggetto `data` interno, come definito in molte API convenzionali.
Tuttavia la Public API di BeechCMS:
1. **Flattizza la risposta GET**: campi come `id`, `slug`, e tutti i campi contenuto (es. `title`, `coverImage`) non sono raggruppati sotto `data` ma esposti allo stesso livello dell'oggetto `Entry`.
2. **Utilizza gli Alias**: i campi non vengono restituiti o accettati con il loro identificativo raw (es. `art_01`), bensì con l'alias umanamente leggibile e stabilito nel seed (es. `title`, `publishedAt`, `images`). Nel frontend, mappare `data.art_01` genera errori a runtime (`undefined`). In scrittura (`POST /add`) accade lo stesso: bisogna sempre includere il mapping degli alias.
**Difficoltà DX / Task:** Per evitare TypeError a runtime dovuti ad interfacce tipizzate erroneamente e agevolare il frontend, sarebbe utile che la documentazione includa un chiaro esempio di risposta `GET` che mostri i dati de-annidati (flattening) e utilizzi in modo inequivocabile gli alias del seed. Le interfacce TS lato client sul test site sono state fixate di conseguenza.
