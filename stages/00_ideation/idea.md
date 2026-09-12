# Idea: Typed Fluent Query Builder per Public Content (Issue 384)

## Visione e Obiettivo
Aggiungere a `@beechcms/client` un fluent query builder tipizzato, leggero (no dipendenze pesanti), che compili verso il contratto REST Public API esistente. Deve eliminare l'encoding manuale di JSON nei consumer senza introdurre un secondo linguaggio di query e senza cambiare la semantica del backend.

```ts
const post = await client
  .collection<'posts'>('posts')
  .where('slug', 'eq', slug)
  .include('author')
  .select(['id', 'title', 'slug', 'body', 'author'])
  .first()
```

---

## Stato Attuale (verificato nel repo)
- `packages/client/src/query-builder.ts` esiste già ma in stile oggetto (`content(seed).list({filter:{...}})`), non fluent chain. Manca `.first()`/`.one()`, manca `.include()`.
- `types.ts` usa registry generico non schema-derived (`Record<string, unknown>`).
- Nessun `beech.schema.ts` / `defineSchema` / `defineSeed` in `packages/core` → issue #381 (manifest DSL) non fatta.
- Nessun comando `beech schema export/diff/plan/apply` / `types generate` in `packages/cli` → issue #382 (codegen tipi) non fatta.
- Nessun parametro `include=` nelle route `apps/api/src/public/*` → issue #383 (relation expansion) non fatta.
- #328 (MCP control plane) CLOSED, disponibile come base.
- #104 (GitOps sprint) OPEN, si sovrappone parzialmente a #382 (`schema-diff.ts` parziale) — da chiarire se assorbito o mantenuto separato.

## Catena di Dipendenze (blocking, non solo documentata)
```
#381 (manifest DSL) → #382 (schema export/type-gen) → #384 (fluent client typed)
#383 (include API)  ─────────────────────────────────→ #384 (.include())
#384 → #385 (subquery/join extension)
```
#384 non può chiudersi typed-completo senza #382 (niente `SeedRegistryTypes`) e senza #383 (niente `.include()` reale). Oggi può partire solo in forma untyped/escape-hatch, refactorando `query-builder.ts` esistente in wrapper fluent.

## Conflitto da Risolvere: #385
#385 propone `JOIN`/subquery/`EXISTS` con AST SQL lato client. Contraddice lo scope esplicito di #384/#383 ("no arbitrary graph traversal", "no SQL parser lato client", planning/resolution solo server-side). Va ridimensionato (solo subquery IN su relation già dichiarate via #383) o riaperto come RFC architetturale separata prima di implementare.

## Perché NON adottare l'approccio Sanity/GROQ
Valutata l'alternativa "linguaggio di query dinamico non tipizzato + typegen per analisi statica" (come Sanity/GROQ). Scartata perché:
- Viola esplicitamente lo scope di #384 ("no second query language", "no embedded GROQ-like parser").
- Richiederebbe un interprete/compilatore GROQ→SQL lato backend, superficie di attacco più grande rispetto al filter-object attuale che compila diretto a SQL parametrizzato.
- Non risolve comunque il problema di runtime drift (vedi sotto) — sposta solo dove il tipo viene generato (da usage-analysis invece che da chain-generics), stesso rischio di staleness.

Si mantiene l'approccio filter-object/fluent-chain con generics (`SeedRegistryTypes`), scartando GROQ.

## Problema di Runtime Drift (critico, emerso in sparring)
I tipi generati da `beech types generate` sono validi solo al momento della generazione (compile-time). Se lo schema D1 cambia dopo che un client è stato buildato/deployato, il client continua a fidarsi di tipi stale → mismatch di shape silenzioso a runtime (TypeScript non può ri-verificare a runtime, è già compilato). `types check` in CI copre solo i consumer nello stesso monorepo/pipeline — un consumer esterno che installa `@beechcms/client` da npm non ha questa rete di sicurezza.

### Soluzione: Schema Fingerprint a Runtime
Da inserire come requisito esplicito in #382/#383/#384:

1. **Fingerprint nella risposta** — ogni risposta Public API porta un header/campo `X-Schema-Revision` (fingerprint deterministico dello schema, generato dallo stesso export canonico usato da `beech types generate`).
2. **Fingerprint nei tipi generati** — `beech.generated.ts` include il fingerprint con cui è stato generato (già previsto in #382 come "generated-file header con revision/fingerprint").
3. **Verifica a runtime nel client** — il fluent client confronta il fingerprint di risposta con quello embeddato nei tipi al build time. Mismatch → non fidarsi silenziosamente del payload, restituire un errore azionabile (stile `BeechProblem`: "client types stale, rigenera con `beech types generate`") invece di lasciare passare dati di shape sbagliata.
4. **Versioning come contratto reale** — `/api/v1/public/*` resta additive-only entro la stessa major version; una modifica breaking al seed deve forzare bump di versione API, non solo rigenerazione tipi. Questo è la garanzia di fondo per i consumer esterni che non hanno CI condivisa.
5. **Validazione runtime opt-in** — non forzare validazione runtime (zod-derived) su ogni chiamata di default (contraddice "dependency-light" di #384). Esporre come strict mode opzionale (`.list({ validate: true })`) per chi preferisce fail-fast a drift silenzioso.

Il fingerprint runtime non sostituisce la codegen — la completa: la codegen risolve l'ergonomia di authoring, il fingerprint risolve la sicurezza a runtime contro schema drift.

---

## Ordine di Esecuzione Consigliato
1. **#381** — DSL `defineSchema/defineSeed/defineField`, round-trip JSON, no callback/codice eseguibile persistito.
2. **#382** — CLI schema export/diff/plan/apply + `types generate`, con fingerprint/revision nel header del file generato.
3. **#383** (parallelizzabile con #382) — `include=` su Public API, depth=1, policy-aware, batched, fingerprint nella risposta.
4. **#384** — refactor `query-builder.ts` in fluent builder, generic su registry da #382, verifica fingerprint runtime, `.include()` tipato solo dopo #383 stabile.
5. **#385** — solo dopo #384, forma ridotta (subquery IN, no JOIN arbitrario) o RFC separata.

## Out of Scope (scartato durante sparring)
- Linguaggio query dinamico stile GROQ (Sanity) — violerebbe scope #384, aumenta superficie d'attacco backend.
- JOIN arbitrario / graph traversal lato client (#385 nella forma attuale).
- Validazione runtime forzata di default su ogni chiamata (solo opt-in).
- Sync implicito di `beech.schema.ts` all'avvio del Worker (resta manifest desired-state, mai autorità runtime).
