## ── Sprint 8: Schema Sync & GitOps Migrations ──

### Problema
Beech supporta la modifica dinamica dei Seed e dello schema sul database locale tramite la dashboard (Phase 5). Tuttavia, in produzione gli schemi dei database devono essere controllati, versionati e propagati tramite pipeline di CI/CD per evitare errori di sincronizzazione o conflitti di codice.

### Soluzione: Schema Diffing & GitOps Migrations

`beech schema:diff` compara il `SEED_REGISTRY` locale con lo schema live del database D1 e genera un file di migrazione SQL incrementale in `apps/api/migrations/`. Solo cambiamenti additivi vengono emessi automaticamente; le modifiche distruttive vengono segnalate come commenti e richiedono revisione manuale.

---

### Developer Workflow (GitOps)

1. **Modifica il Seed** — aggiungi o modifica un branch in `seeds.ts`.

2. **Preview del diff** — confronta il registro locale con D1 locale:
   ```sh
   beech schema:diff --local
   ```
   Output: report per seed (✓ clean / ⚠ drift) + preview SQL della migrazione proposta.

3. **Genera la migrazione** — scrivi il file SQL nella directory migrazioni:
   ```sh
   beech schema:diff --local --write --name add_price_field
   # → apps/api/migrations/0034_add_price_field.sql
   ```
   Il prefisso (`0034`) è calcolato automaticamente scansionando la directory.

4. **Revisiona il file SQL** — apri `apps/api/migrations/0034_add_price_field.sql` e verifica le istruzioni `ALTER TABLE … ADD COLUMN` / `CREATE INDEX IF NOT EXISTS` emesse dai generatori core.

5. **Committa e pusha** — il file di migrazione entra in Git come artifact versionato.

6. **CI applica la migrazione prima del deploy**:
   ```sh
   wrangler d1 migrations apply beech-db --remote
   wrangler deploy
   ```
   Vedi il template in `docs/ci/github-actions-migrations.yml`.

7. **Verifica** — dopo il deploy, `beech schema:diff --remote` deve riportare "Schema matches seeds".

---

### Cambiamenti distruttivi (drop, rename, type rebuild)

`schema:diff` **non emette mai** SQL distruttivo (`DROP COLUMN`, `ALTER TYPE`, `RENAME`). Le colonne `extra`, `type_mismatch` e `fk_mismatch` vengono segnalate come commenti `-- ⚠` nel file SQL generato e **non sono eseguibili**.

Per applicare una modifica distruttiva:
1. Crea a mano un file `NNNN_<name>.sql` in `apps/api/migrations/`.
2. Scrivi le istruzioni necessarie (ricrea la tabella, copia i dati, droppa la vecchia).
3. Committa e segui lo stesso workflow GitOps.

---

### Botanial Invariant

Nessuna stringa SQL (`ALTER TABLE`, `CREATE TABLE`) è composta direttamente nel CLI. Tutto il DDL è prodotto dai generatori di `@beechcms/core`:
- `planCreateSeed(seed)` — schema completo per tabelle nuove
- `generateAddColumn(seed, branch)` — `ALTER TABLE … ADD COLUMN`
- `generateIndexes(seed)` — `CREATE INDEX IF NOT EXISTS …`

Il CLI assembla, non autora SQL.

---

### Opzioni del comando

```
beech schema:diff [options]

  --write         Scrive il file di migrazione (default: preview only)
  --name <name>   Nome usato nel filename (es. "add_price_field")
  --remote        Diff vs D1 remoto (default: locale)
  --db <name>     Override del nome database D1
```

---

### Riferimenti

- Generatori DDL: `packages/core/src/engine.ts`, `packages/core/src/seed-ddl.ts`
- Diff engine: `packages/cli/src/lib/schema-diff.ts`
- Migration writer: `packages/cli/src/lib/migration-writer.ts`
- Comando: `packages/cli/src/commands/schema-diff.ts`
- CI template: `docs/ci/github-actions-migrations.yml`
- Directory migrazioni: `apps/api/migrations/` (prossimo indice: `0034`)
