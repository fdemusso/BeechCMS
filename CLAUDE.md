# CLAUDE.md (Workspace Identity & Routing)

Sei nel workspace di **BeechCMS**, un headless CMS schema-driven basato su un monorepo Turborepo. Il componente centrale è il Botanical Engine (`packages/core`).

## Struttura del Workspace e Materiale di Riferimento (Layer 3)

Le istruzioni dettagliate, le regole architetturali, i comandi e le guide NON sono in questo file. Devi caricare i seguenti file come materiale di riferimento (Layer 3) **solo** quando i contratti di stage (`CONTEXT.md`) ti istruiscono a farlo tra i loro `Inputs`:

- `_config/commands.md`: Contiene tutti i comandi di sviluppo (Turborepo, Cloudflare, Docker).
- `_config/architecture.md`: Regole del Botanical Engine, Vertical Slice Architecture e invariant policies.
- `_config/database_workflow.md`: Regole di migrazione D1 e struttura delle tabelle (`content_{slug}`).
- `_config/tooling_graphify.md`: Regole per interrogare e aggiornare il knowledge graph AST.
- `_config/tooling_react_doctor.md`: Workflow di triage per React Doctor.
- `docs/SYSTEM_MAP.md`: Mappa dettagliata del sistema e dei vincoli architetturali.

Non tentare mai di indovinare le regole di migrazione o i comandi di build; leggi sempre i file in `_config/` specificati nel contratto del tuo stage corrente.
