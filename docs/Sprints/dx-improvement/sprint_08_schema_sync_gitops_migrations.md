## ── Sprint 8: Schema Sync & GitOps Migrations ──

### Problema
Beech supporta la modifica dinamica dei Seed e dello schema sul database locale tramite la dashboard (Phase 5). Tuttavia, in produzione gli schemi dei database devono essere controllati, versionati e propagati tramite pipeline di CI/CD per evitare errori di sincronizzazione o conflitti di codice.

### Soluzione proposta: Schema Diffing & Versioning
Fornire strumenti all'interno di `@beechcms/cli` per creare automaticamente migrazioni SQL basate sui Seed di produzione e integrare le pipeline di deploy automatico.

#### Workflow di Sviluppo (GitOps):
1. Lo sviluppatore modifica o aggiunge un Seed localmente.
2. Esegue `beech schema:diff` che confronta le definizioni dei Seed locali con lo schema attivo nel database D1 e genera un file di migrazione SQL incrementale in `migrations/`.
3. Committa il file di migrazione in Git.
4. Quando viene fatto il push su GitHub, la pipeline esegue `wrangler d1 migrations apply --remote` applicando i cambiamenti sul database di produzione prima del deploy del Worker.

### Checklist di Implementazione (Sprint 8)
- [ ] Implementare il comando `schema:diff` in `@beechcms/cli` che utilizza `planSeedDdl` e `D1SchemaMutator` in modalità dry-run per rilevare differenze di colonne e indici.
- [ ] Creare un generatore di file SQL di migrazione con nomenclatura standard e incrementale (es. `migrations/0031_updated_seed_price.sql`).
- [ ] Fornire template per pipeline di CI/CD (GitHub Actions) nella documentazione per automatizzare l'applicazione delle migrazioni in produzione.
