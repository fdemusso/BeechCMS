# Segnalazione Criticità Documentazione e Database (Seeds)

Durante la progettazione dell'integrazione del nuovo sito `testsite` con il CMS, ho analizzato la documentazione presente in `docs/` (in particolare `public-api.md`, `botanical-engine.md` e `content-engine.md`) e le definizioni dei Seed in `@beech/core`.

Di seguito i problemi e le criticità riscontrate:

## 2. Inconsistenza Formato Campi JSON e Asset Multimediali
Nel seed `prodotti`, le immagini erano salvate come campo `json` (`prd_06`, alias `images`), lasciando al frontend l'onere di dedurre la struttura. Per risolvere in coerenza con l'architettura schema-driven:

- il campo e stato allineato a `type: 'file'` con `multiple: true` e `format: 'asset-list'`
- il payload canonico e `string[]` (URL media), mantenendo compatibilita in lettura con legacy JSON
- validazione core e renderer dashboard gestiscono in modo esplicito la semantica `asset-list`

## 3. Mancata Sicurezza sul Public POST
Il DB in fase di POST `add` dalla Public API pare accettare tutti i campi esposti dal payload, appoggiandosi solo alla sanificazione dello schema.
Manca una restrizione documentata su quali seed possono accettare POST pubblici. In teoria, tramite endpoint API e Public API-Key, un banale form esterno potrebbe *creare Pagine o Articoli* invece di poter postare solo "Messaggi" da moderare, non risultando esserci un RBAC esplicito a livello di Seed. (Consigliata introduzione di una property `allowPublicPost: boolean` nel SeedType).

### Stato: RISOLTO

- introdotte capability per-seed (`allowPublicRead`, `allowPublicPost`, `allowPublicEdit`) nel core
- enforcement `403` nei handler Public API (`read`, `add`, `edit`) con default deny
- split chiavi `PUBLIC_READ_API_KEY`/`PUBLIC_WRITE_API_KEY`
- rate limit dedicato sulle route pubbliche e supporto `Idempotency-Key` su `POST /add`

## 4. Validazione Rigida vs Evolutiva
La documentazione ammette "Alias non riconosciuti vengono ignorati (safe policy)" ma annuncia anche sprint su Zod (in `botanical-engine.md` si citano roadmap future). Al momento, spedire JSON leggermente malformati o non aderenti al tipo non produce chiari errori strutturali su tutti i tipi branch, il che potrebbe portare un contact form front-end a salvare "null" silenziosamente se l'alias del `name` del mittente non coincide col DB.

## 5. Live Reload Incompleto per i Pacchetti Condivisi (Core)
È emerso un problema lato Developer Experience non documentato. L'aggiunta di un nuovo seed in `packages/core/src/seeds.ts` **non** si riflette automaticamente nella Dashboard (che genera il menu dinamicamente iterando proprio il `SEED_REGISTRY`, come visibile in `apps/dashboard/src/config/dashboard-menu.ts`). Il codice della dashboard non ha seed hardcoded: legge correttamente dal registro. Tuttavia, siccome il monorepo usa dipendenze al pacchetto compilato (`dist`), quando si avvia `npm run dev`, `turbo` non dispone di un file-watcher (come `tsc -w`) sul pacchetto `@beech/core` per ricompilarlo al salvataggio. Il seed non apparirà mai nella Sidebar fino a che non viene forzata una re-compilazione manuale del core (es. `npm run build -w @beech/core`).
Manca un avviso su questo limite architetturale del tooling di sviluppo nella voce dedicata (es. in `monorepo.md`). Manca quindi un comando dev che faccia hot-reloading dei TypeScript condivisi per l'ambiente locale.
