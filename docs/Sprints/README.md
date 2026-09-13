# BeechCMS Sprint Archive & Historical Catalog

Benvenuto nell'archivio storico degli Sprint di **BeechCMS**. Questo documento è l'indice centrale e catalogo strutturato di tutti gli sprint di sviluppo, refactoring architetturale, evoluzioni e hardening eseguiti nel repository.

> **Nota sul riordino:** le cartelle sotto sono state raggruppate per **feature epic** quando più sprint della pipeline autonoma appartenevano alla stessa catena (stesso `ROADMAP.md`, stessa issue, o dipendenze esplicite sprint→sprint dichiarate nei piani). Ogni epic ha un prefisso numerico (`01-`, `02-`, ...) che riflette l'ordine reale di esecuzione. Riferimenti interni ai vecchi path (es. `docs/Sprints/SchemaManifestDsl/`) presenti nei documenti storici riflettono il path *al momento della scrittura*, non quello attuale.

---

## 🏛️ Struttura dell'Archivio

1. **🤖 Feature Epics (Pipeline Sprints raggruppati)**: catene di sprint della pipeline autonoma a 4 stadi (`00_ideation` → `01_sprint_planning` → `02_execution` → `03_review`) che realizzano insieme una singola feature, ordinate numericamente. Ogni sprint-figlio contiene `[Nome].md` (piano), `execution_log.md`, `review_report.md`, `feature_brief.md`/`ROADMAP.md` dove presenti.
2. **📚 Serie Tematiche & Cataloghi di Dominio**: raccolte modulari e numerate di specifiche di sprint raggruppate per modulo funzionale (Core, UI, DB, DX, Automations, ecc.) — non necessariamente eseguite dalla pipeline autonoma.
3. **📎 Sprint Singoli**: interventi puntuali che non fanno parte di una catena più ampia.

---

## 🤖 Feature Epics

### 🔎 [`typed-fluent-query-builder/`](./typed-fluent-query-builder/) — Typed Fluent Query Builder chain (#381 → #385)
Query builder tipizzato per `@beechcms/client`: DSL di schema, fingerprint di introspezione, CLI export/plan/apply, espansione relazioni nell'API pubblica, fluent chain client-side e subquery su relazioni. [`ROADMAP.md`](./typed-fluent-query-builder/ROADMAP.md)
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`SchemaManifestDsl`](./typed-fluent-query-builder/01-SchemaManifestDsl/) | DSL di authoring `beech.schema.ts` in `@beechcms/core/schema` |
| 02 | [`SchemaIntrospectionFingerprint`](./typed-fluent-query-builder/02-SchemaIntrospectionFingerprint/) | Introspezione D1 via PRAGMA + fingerprint deterministico dello schema |
| 03a | [`CliSchemaExportTypes`](./typed-fluent-query-builder/03a-CliSchemaExportTypes/) | `beech schema export\|diff` + `beech types generate` (sola lettura) |
| 03b | [`CliSchemaPlanApply`](./typed-fluent-query-builder/03b-CliSchemaPlanApply/) | `beech schema plan\|apply` via MCP control plane (scrittura autenticata OAuth PKCE) |
| 04 | [`PublicApiRelationExpansion`](./typed-fluent-query-builder/04-PublicApiRelationExpansion/) | `include=` su `/api/v1/public/*` + header `X-Schema-Revision` |
| 05 | [`FluentClientQueryBuilder`](./typed-fluent-query-builder/05-FluentClientQueryBuilder/) | Fluent chain `.where().include().select()` generica su `SeedRegistryTypes` |
| 06 | [`ClientRelationSubqueries`](./typed-fluent-query-builder/06-ClientRelationSubqueries/) | Filtri `IN` su relazioni dichiarate via `include=` |

### 🔐 [`rbac/`](./rbac/) — Multi-Stakeholder RBAC / Multi-Tenant Portal
Vocabolario dei permessi ABAC, enforcement fail-closed su ogni richiesta, amministrazione ruoli/utenti, inviti, proiezioni scope-aware e superfici dashboard permission-aware. [`ROADMAP.md`](./rbac/ROADMAP.md)
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`RbacCorePrimitives`](./rbac/01-RbacCorePrimitives/) | Evaluator ABAC puro + tabelle D1, zero enforcement |
| 02 | [`RbacRequestEnforcement`](./rbac/02-RbacRequestEnforcement/) | Gate di autorizzazione unico su ogni richiesta protetta |
| 03 | [`RbacUserRoleAdminApi`](./rbac/03-RbacUserRoleAdminApi/) | API amministrazione account/ruoli/assegnazioni con anti-escalation |
| 04 | [`RbacInvitations`](./rbac/04-RbacInvitations/) | Onboarding invite-only con token single-use |
| 05 | [`RbacScopedProjections`](./rbac/05-RbacScopedProjections/) | Proiezioni scope-aware su ogni endpoint di listing |
| 06 | [`RbacDashboardSurfaces`](./rbac/06-RbacDashboardSurfaces/) | Dashboard riflette i permessi effettivi del chiamante |
| 07 | [`RbacContentActionGating`](./rbac/07-RbacContentActionGating/) | Disabilitazione (mai hide) delle azioni di contenuto non autorizzate |

### 🔑 [`oauth/`](./oauth/) — OAuth 2.1 Authorization Server per MCP
Server di autorizzazione OAuth 2.1 nativo per proteggere gli strumenti MCP e futuri consumer esterni, dalla persistenza fino al client PKCE del CLI MCP. [`ROADMAP.md`](./oauth/ROADMAP.md)
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`oauth-core-foundation`](./oauth/01-oauth-core-foundation/) | Persistenza + contratti OAuth zero-dipendenze in `@beechcms/core` |
| 02 | [`oauth-authorization-server`](./oauth/02-oauth-authorization-server/) | `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` con PKCE S256 |
| 03 | [`oauth-resource-server-scopes`](./oauth/03-oauth-resource-server-scopes/) | Accettazione token OAuth scope-aware sulle route MCP-backing |
| 04 | [`oauth-dashboard-consent-ui`](./oauth/04-oauth-dashboard-consent-ui/) | Schermata di consenso + gestione "Connected apps" |
| 05 | [`mcp-pkce-client`](./oauth/05-mcp-pkce-client/) | Flusso PKCE browser-based in `packages/mcp`, sostituisce credenziali statiche |

### 🧪 [`testing-harness/`](./testing-harness/) — Test Harness & Test Suite Redesign (issue #108)
Nuovo package `@beechcms/testing`, riallocazione slice-based dei test, tiering CI, tier e2e Playwright, tier scale/perf, più authoring/riparazione della coverage a valle. [`ROADMAP.md`](./testing-harness/ROADMAP.md)
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`S1_Harness_Foundation`](./testing-harness/01-S1_Harness_Foundation/) | Package `@beechcms/testing` + seam `BeechConfig` |
| 02 | [`S2_Slice_Test_Layout`](./testing-harness/02-S2_Slice_Test_Layout/) | Rilocazione test per Vertical Slice |
| 03 | [`S3_CI_Test_Tiering`](./testing-harness/03-S3_CI_Test_Tiering/) | Selezione dei test per tier in CI |
| 04 | [`S4_E2E_Playwright`](./testing-harness/04-S4_E2E_Playwright/) | Tier e2e Playwright isolato dalla CI standard |
| 05 | [`S5_Scale_Perf_Tier`](./testing-harness/05-S5_Scale_Perf_Tier/) | Tier di test scale/performance |
| 06 | [`NewcodeTestAuthoring`](./testing-harness/06-NewcodeTestAuthoring/) | Copertura new-code per il gate SonarQube (kanban logic) |
| 07 | [`CoverageExclusionRepair`](./testing-harness/07-CoverageExclusionRepair/) | Ripristino esclusioni coverage dopo refactor domain-driven |

### 📦 [`client-sdk-modularization/`](./client-sdk-modularization/) — `@beechcms/client` Strict-by-Design Submodules
Segregazione browser/server del client SDK seguita dai submodule isomorfi isolati (`./webhooks`, `./richtext`) costruiti sulla stessa architettura a subpath export.
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`StrictClientSdkSegregation`](./client-sdk-modularization/01-StrictClientSdkSegregation/) | Subpath `./browser` (read-only) / `./server` (full CRUD) |
| 02 | [`ClientSdkWebhookSubmodule`](./client-sdk-modularization/02-ClientSdkWebhookSubmodule/) | Submodulo `./webhooks`, verifica firme HMAC |
| 03 | [`TipTapRichTextRendering`](./client-sdk-modularization/03-TipTapRichTextRendering/) | Submodulo `./richtext`, renderer isomorfo TipTap |

### 📝 [`richtext-validation/`](./richtext-validation/) — RichText Validator Hardening & Split
Hardening di sicurezza/correttezza del validatore RichText TipTap lato core (Phase 1), seguito dallo splitting modulare del validatore (Phase 2).
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`RichTextValidationRenderHardening`](./richtext-validation/01-RichTextValidationRenderHardening/) | Hardening P0 sicurezza/correttezza rendering |
| 02 | [`RichTextValidationModuleSplit`](./richtext-validation/02-RichTextValidationModuleSplit/) | Split modulare regole/schema core |

### 🔒 [`data-privacy-security/`](./data-privacy-security/) — Data Privacy, Forms & Security Epic
Tiering di riservatezza, cifratura a riposo, filtraggio API context-aware, sicurezza form pubblici e toolkit SDK sicuro, fino alla classificazione dati confidenziali e alla difesa zero-secret anti-bot.
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`Sprint_1_PrivacyService_Primitives`](./data-privacy-security/01-Sprint_1_PrivacyService_Primitives/) | Primitive crittografiche edge-native, contratto `PrivacyService` |
| 02 | [`Sprint_2_Payload_Diffing_and_Blind_Index_Integration`](./data-privacy-security/02-Sprint_2_Payload_Diffing_and_Blind_Index_Integration/) | Payload diffing anti re-encryption + blind index HMAC |
| 03 | [`Sprint_3_Context_Aware_API_Filtering`](./data-privacy-security/03-Sprint_3_Context_Aware_API_Filtering/) | Scrubbing risposte per field tier (Public/Internal/Confidential/Restricted) |
| 04 | [`Sprint_4_Public_Form_Security_and_Quarantine_Pipeline`](./data-privacy-security/04-Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/) | Anti-bot form pubblici, quarantena antivirus async |
| 05 | [`Sprint_5_Secure_Form_Toolkit_React_SDK`](./data-privacy-security/05-Sprint_5_Secure_Form_Toolkit_React_SDK/) | `@beechcms/forms-react`, `<BeechForm />`, `useBeechForm` |
| 06 | [`ConfidentialDataLifecycle`](./data-privacy-security/06-ConfidentialDataLifecycle/) | Lifecycle cifratura AES-256-GCM, `publicEdit` policy |
| 07 | [`ZeroSecretPublicFormDefense`](./data-privacy-security/07-ZeroSecretPublicFormDefense/) | Time-trap HMAC, honeypot, rate limiting token bucket |

### 🗑️ [`soft-delete/`](./soft-delete/) — Soft Delete & Trash Bin Lifecycle
Motore backend soft-delete/purge GDPR, seguito dalla UI Trash in dashboard.
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`SoftDeleteBackend`](./soft-delete/01-SoftDeleteBackend/) | Engine, repository, contratti HTTP per trash/purge |
| 02 | [`SoftDeleteDashboardTrash`](./soft-delete/02-SoftDeleteDashboardTrash/) | UI Trash dashboard sul backend dello sprint 1 |

### 🔭 [`semantic-hybrid-search/`](./semantic-hybrid-search/) — Zero-Cost Serverless Edge Vector Search
Storage vettoriale core, pipeline API di ricerca semantica, SDK client per ricerca ibrida. [`ROADMAP.md`](./semantic-hybrid-search/ROADMAP.md)
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`core-and-storage`](./semantic-hybrid-search/01-core-and-storage/) | `IVectorRepository`, tabelle `vector_${slug}`, extractor testo pubblico |
| 02 | [`semantic-search-api-pipeline`](./semantic-hybrid-search/02-semantic-search-api-pipeline/) | Pipeline API di ricerca semantica |
| 03 | [`hybrid-search-client-sdk`](./semantic-hybrid-search/03-hybrid-search-client-sdk/) | SDK client per ricerca ibrida |

### 🛰️ [`mcp-server/`](./mcp-server/) — BeechCMS MCP Agent Skill
Server MCP standalone (`beechcms-mcp`), seguito dal bundle di resources per tool description e agent guidance più ricche.
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`beechcms_mcp_sprint`](./mcp-server/01-beechcms_mcp_sprint/) | Server MCP CLI-invoked, isolato dal resto del monorepo |
| 02 | [`mcp_resources_bundle`](./mcp-server/02-mcp_resources_bundle/) | Resources bundle per tool/agent guidance |

### 🗄️ [`d1-schema-authority/`](./d1-schema-authority/) — Canonical D1 Schema Authority
Disaccoppiamento di `seeds.ts` come fonte statica e formalizzazione di D1 come autorità canonica dello schema, seguito dal generatore di tipi TypeScript zero-drift che introspeziona D1 direttamente.
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`sprint_decouple_seeds_ts_canonical_d1`](./d1-schema-authority/01-sprint_decouple_seeds_ts_canonical_d1/) | D1 come autorità canonica, deprecazione comandi file-based |
| 02 | [`sprint_d1_typescript_type_generator`](./d1-schema-authority/02-sprint_d1_typescript_type_generator/) | `beech gen types typescript` introspettivo su D1 |

### 📖 [`docs-redesign/`](./docs-redesign/) — Documentation UX Rework & Vertical Slicing
Redesign completo della documentazione VitePress: 6 macro-aree, sidebar contestuali, onboarding guidato per framework, splitting del monolite `api-reference.md`. [`ROADMAP.md`](./docs-redesign/ROADMAP.md) · [`feature_brief.md`](./docs-redesign/feature_brief.md)
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`docs-infrastructure-and-theme`](./docs-redesign/01-docs-infrastructure-and-theme/) | Information architecture 6 macro-aree + componenti tema |
| 02 | [`docs-start-and-build-migration`](./docs-redesign/02-docs-start-and-build-migration/) | Migrazione contenuti Start/Build + onboarding framework |
| 03 | [`docs-reference-vertical-slicing`](./docs-redesign/03-docs-reference-vertical-slicing/) | Smontaggio monolite `api-reference.md` in slice verticali |
| 04 | [`docs-features-manage-resources`](./docs-redesign/04-docs-features-manage-resources/) | Popolamento macro-aree Features/Manage/Resources |

### 🧾 [`json-field-editor/`](./json-field-editor/) — JSON Field Layout & Editor
Fondamenta di layout e contratto form per il branch type `json`, seguite dall'editor CodeMirror dedicato.
| # | Sprint | Deliverable |
| :-: | :--- | :--- |
| 01 | [`json-layout-core-and-form-contract`](./json-field-editor/01-json-layout-core-and-form-contract/) | Tipo `json` full-width, contratti layout/form |
| 02 | [`codemirror-json-editor`](./json-field-editor/02-codemirror-json-editor/) | Editor CodeMirror dedicato per il campo `json` |

---

## 📎 Sprint Singoli (Pipeline, non parte di una catena)

| Cartella | Descrizione |
| :--- | :--- |
| [`SchemaSyncGitOpsMigrations/`](./SchemaSyncGitOpsMigrations/) | Schema sync CLI & GitOps D1 migrations (`@beechcms/cli`) |
| [`IconMigration/`](./IconMigration/) | Migrazione centralizzata e standardizzazione icone Lucide nella dashboard |
| [`TokenBucketDualKeyRateLimiting/`](./TokenBucketDualKeyRateLimiting/) | Rate limiting a Token Bucket + Dual-Key (IP + Account) su endpoint sensibili |

---

## 📚 Serie Tematiche & Piani per Modulo

Raccolte numerate di specifiche pianificate manualmente (non necessariamente eseguite dalla pipeline autonoma a 4 stadi).

### 📊 [`analytics/`](./analytics/) — Modulo Analytics & GA4
- [`README.md`](./analytics/README.md): Panoramica architettura analytics
- [`01-analytics-core-contract.md`](./analytics/01-analytics-core-contract.md): Contratti core & provider interfaces
- [`02-ga4-provider.md`](./analytics/02-ga4-provider.md): Implementazione adapter Google Analytics 4
- [`03-analytics-api-slice.md`](./analytics/03-analytics-api-slice.md): Slice API e route proxy
- [`04-analytics-dashboard-ui.md`](./analytics/04-analytics-dashboard-ui.md): Dashboard UI per grafici e metriche
- [`05-analytics-widgets-comparisons.md`](./analytics/05-analytics-widgets-comparisons.md): Widget comparativi periodo su periodo

### ⚡ [`automation/`](./automation/) — Motore di Automazioni
- [`01-automations.md`](./automation/01-automations.md): Core primitives & event triggers
- [`02-automation-runner.md`](./automation/02-automation-runner.md): Runner di esecuzione asincrono
- [`03-cron-scheduler.md`](./automation/03-cron-scheduler.md): Schedulatore cron edge-native
- [`04-automations-crud-api.md`](./automation/04-automations-crud-api.md): Endpoint CRUD per regole di automazione
- [`05-automations-ui.md`](./automation/05-automations-ui.md): Interfaccia grafica builder automazioni
- [`06-fix-variable-actions.md`](./automation/06-fix-variable-actions.md): Transizione al paradigma Variable Action
- [`06-template-context-extensions.md`](./automation/06-template-context-extensions.md): Estensioni del contesto template
- [`07-set-variable-redesign.md`](./automation/07-set-variable-redesign.md): Redesign dell'azione di impostazione variabili
- [`08-webhook-security-hardening.md`](./automation/08-webhook-security-hardening.md): Hardening firme HMAC e timeout chiamate webhook

### 🧩 [`dashboard-composer/`](./dashboard-composer/) — Dashboard Personalizzabile
- [`00-overview.md`](./dashboard-composer/00-overview.md): Indice della serie Dashboard Composer
- [`01-dashboard-layout-core.md`](./dashboard-composer/01-dashboard-layout-core.md): Layout Core in `@beechcms/core`
- [`02-layout-persistence-and-api.md`](./dashboard-composer/02-layout-persistence-and-api.md): Persistenza D1 e API REST
- [`03-widget-registry-and-renderer.md`](./dashboard-composer/03-widget-registry-and-renderer.md): Registry dei widget & runtime renderer
- [`04-builtin-widgets.md`](./dashboard-composer/04-builtin-widgets.md): Widget integrati (KPI, Grafici, Tabelle, Testo)
- [`05-dashboard-builder-ui.md`](./dashboard-composer/05-dashboard-builder-ui.md): Builder Drag & Drop per amministratori
- [`06-role-based-dashboards.md`](./dashboard-composer/06-role-based-dashboards.md): Dashboard differenziate per ruolo utente
- [`07-custom-widget-sdk.md`](./dashboard-composer/07-custom-widget-sdk.md): SDK per lo sviluppo di custom widgets

### 🛠️ [`dev-cli/`](./dev-cli/) — Developer Experience & CLI Tooling
- [`01-cli_upgrade.md`](./dev-cli/01-cli_upgrade.md): Pannello TUI interattivo Ink per `pnpm beech dev`
- [`02-unified-beech-cli.md`](./dev-cli/02-unified-beech-cli.md): Piano unificato CLI `pnpm beech` (scaffold, migrazioni, runner)

### 🚀 [`dx-improvement/`](./dx-improvement/) — Serie Miglioramenti DX & Feature Slices (1-16)
- [`sprint_01_programmatic_lifecycle_hooks.md`](./dx-improvement/sprint_01_programmatic_lifecycle_hooks.md): Hooks di ciclo di vita programmatici (`beforeCreate`, `afterUpdate`, ecc.)
- [`sprint_02_route_integration_injected_router_pattern.md`](./dx-improvement/sprint_02_route_integration_injected_router_pattern.md): Pattern injected router per estensione API
- [`sprint_03_codegen_cli.md`](./dx-improvement/sprint_03_codegen_cli.md): CLI TypeScript Codegen (`beech generate:types`)
- [`sprint_04_scaffolding_cli_dx_logging.md`](./dx-improvement/sprint_04_scaffolding_cli_dx_logging.md): Scaffolding enrichment e surfacing log TUI
- [`sprint_05_type_safe_client_sdk_webhook_verifier.md`](./dx-improvement/sprint_05_type_safe_client_sdk_webhook_verifier.md): Specifiche Type-Safe Client SDK e Webhook Verifier
- [`sprint_06_oauth_social_login.md`](./dx-improvement/sprint_06_oauth_social_login.md): Supporto OAuth e Social Login
- [`sprint_07_background_queues_job_handlers.md`](./dx-improvement/sprint_07_background_queues_job_handlers.md): Code di background edge (`IQueueService`)
- [`sprint_08_schema_sync_gitops_migrations.md`](./dx-improvement/sprint_08_schema_sync_gitops_migrations.md): Specifiche Schema Sync & GitOps
- [`sprint_09_openapi_swagger_ui.md`](./dx-improvement/sprint_09_openapi_swagger_ui.md): Generazione spec OpenAPI e interfaccia Swagger UI
- [`sprint_10_realtime_updates_via_server_sent_events_sse.md`](./dx-improvement/sprint_10_realtime_updates_via_server_sent_events_sse.md): Aggiornamenti real-time via Server-Sent Events (SSE)
- [`sprint_11_bulk_export_import_csv_json.md`](./dx-improvement/sprint_11_bulk_export_import_csv_json.md): Import ed Export massivo in formato CSV/JSON
- [`sprint_12_developer_testing_harness_mocking.md`](./dx-improvement/sprint_12_developer_testing_harness_mocking.md): Testing harness con mocking per developer
- [`sprint_13_multi_language_field_localization_i18n.md`](./dx-improvement/sprint_13_multi_language_field_localization_i18n.md): Localizzazione campi e multilingua (i18n)
- [`sprint_14_multi_field_fts5_indexing.md`](./dx-improvement/sprint_14_multi_field_fts5_indexing.md): Indicizzazione Full-Text Search FTS5 multicampo su D1
- [`sprint_15_soft_deletes_trash_bin_lifecycle.md`](./dx-improvement/sprint_15_soft_deletes_trash_bin_lifecycle.md): Soft deletes e gestione ciclo di vita cestino (Trash Bin)
- [`sprint_16_dynamic_image_resizing_webp_cdn.md`](./dx-improvement/sprint_16_dynamic_image_resizing_webp_cdn.md): Ridimensionamento immagini dinamico e WebP CDN

> Nota: `sprint_08_schema_sync_gitops_migrations.md` e `sprint_15_soft_deletes_trash_bin_lifecycle.md` sono le **specifiche pianificate** dietro rispettivamente [`SchemaSyncGitOpsMigrations/`](./SchemaSyncGitOpsMigrations/) e [`soft-delete/`](./soft-delete/) — questa serie resta il piano originale, le cartelle linkate sono l'esecuzione.

### 📋 [`kanban/`](./kanban/) — Vista Kanban & Card Customization
- [`01-kanban-view.md`](./kanban/01-kanban-view.md): Fondamenta e contratti vista Kanban (Sprint 1)
- [`02-kanban-view.md`](./kanban/02-kanban-view.md): Configurazione assi, fetch per-colonna e rendering virtualizzato (Sprint 2)
- [`03-kanban-view.md`](./kanban/03-kanban-view.md): Drag & Drop interattivo e persistenza ottimistica (Sprint 3)
- [`04-kanban-view.md`](./kanban/04-kanban-view.md): Post-save column sync e notifiche colonna piena (Sprint 4)
- [`05-kanban-card-customization.md`](./kanban/05-kanban-card-customization.md): Personalizzazione layout card kanban (Sprint 5)
- [`06-kanban-card-customization-sprint2.md`](./kanban/06-kanban-card-customization-sprint2.md): Hardening e polish personalizzazione card (Sprint 6)

### 🖼️ [`media/`](./media/) — Storage & Gestione Media
- [`01-file-options-specification.md`](./media/01-file-options-specification.md): Specifica `fileOptions` e gestione mime/estensioni
- [`02-presigned-urls-migration.md`](./media/02-presigned-urls-migration.md): Migrazione upload diretto su URL presigned R2/S3
- [`03-docker-local-dev-tools.md`](./media/03-docker-local-dev-tools.md): Suite locale Docker (MinIO, Mailpit, SQLite Web, Cloudflared)

### 🔗 [`relations/`](./relations/) — Relazioni & Chiavi Esterne
- [`README.md`](./relations/README.md): Architettura delle relazioni tra Seed (Foreign Keys)
- [`01-relations-core.md`](./relations/01-relations-core.md): Contratti core & validazione schema
- [`02-relations-api.md`](./relations/02-relations-api.md): Endpoint API per risoluzione entità collegate
- [`03-relations-migration.md`](./relations/03-relations-migration.md): Migrazioni D1 e vincoli relazionali
- [`04-relations-frontend.md`](./relations/04-relations-frontend.md): Picker e selettori relazionali nella dashboard
- [`05-relations-many-to-many.md`](./relations/05-relations-many-to-many.md): Relazioni molti-a-molti (junction tables)
- [`06-relations-backrefs.md`](./relations/06-relations-backrefs.md): Riferimenti inversi (backreferences bidirezionali)
- [`07-relations-inline-create.md`](./relations/07-relations-inline-create.md): Creazione inline di record collegati nei form
- [`08-relations-bulk-reassign.md`](./relations/08-relations-bulk-reassign.md): Riassegnazione massiva di relazioni

### 🌱 [`runtime-seeds/`](./runtime-seeds/) — Runtime Schema & DDL Planner
- [`00-overview.md`](./runtime-seeds/00-overview.md): Panoramica architettura Runtime Seeds
- [`01-core-persistence-and-ddl-planner.md`](./runtime-seeds/01-core-persistence-and-ddl-planner.md): Contratto di persistenza e DDL Planner
- [`02-runtime-registry-hydration.md`](./runtime-seeds/02-runtime-registry-hydration.md): Idratazione dinamica del registry a runtime
- [`03-seed-crud-and-runtime-ddl-api.md`](./runtime-seeds/03-seed-crud-and-runtime-ddl-api.md): API CRUD per Seed ed esecuzione DDL a caldo
- [`04-cli-code-onboarding.md`](./runtime-seeds/04-cli-code-onboarding.md): Onboarding schemi da codice TypeScript a D1
- [`05-dashboard-seed-builder.md`](./runtime-seeds/05-dashboard-seed-builder.md): Visual Seed Builder nell'interfaccia di amministrazione
- [`06-destructive-operations.md`](./runtime-seeds/06-destructive-operations.md): Danger Zone ed eliminazione controllata tabelle D1
- [`07-shared-schema-form-shell.md`](./runtime-seeds/07-shared-schema-form-shell.md): Shell generica `SchemaFormShell` (inversion of control)
- [`08-repeater-field-renderer.md`](./runtime-seeds/08-repeater-field-renderer.md): Renderer campi repeater e nested arrays
- [`09-seed-editor-via-shared-shell.md`](./runtime-seeds/09-seed-editor-via-shared-shell.md): Seed Editor basato su Shared Shell
- [`10-repeater-core-branchtype.md`](./runtime-seeds/10-repeater-core-branchtype.md): Promozione del tipo `repeater` nel core di BeechCMS
- [`11-repeater-cardinality.md`](./runtime-seeds/11-repeater-cardinality.md): Limiti di cardinalità (`minItems` / `maxItems`) per i repeater
- [`seed-creation-modal-analysis.md`](./runtime-seeds/seed-creation-modal-analysis.md): Analisi UX della modale di creazione seed

### 🖥️ [`ui/`](./ui/) — Dashboard UI, Entry Editor & Views
- [`01-live-draft-separation.md`](./ui/01-live-draft-separation.md): Separazione netta tra stato Live e bozze (Drafts)
- [`02-gravatar-support.md`](./ui/02-gravatar-support.md): Integrazione avatar Gravatar per utenti e collaboratori
- [`03-new-onboarding.md`](./ui/03-new-onboarding.md): Flusso di onboarding guidato per nuovi progetti
- [`04-customizable-entry-editor.md`](./ui/04-customizable-entry-editor.md): Indice della serie Entry Editor personalizzabile
- [`04-pre-foundation-fixes.md`](./ui/04-pre-foundation-fixes.md): Fix propedeutici (Branch IDs e unificazione Auth)
- [`04a-customizable-editor-foundation.md`](./ui/04a-customizable-editor-foundation.md): Backend foundation per layout editor dinamici
- [`04b-customizable-editor-renderer.md`](./ui/04b-customizable-editor-renderer.md): Runtime renderer dell'entry editor e modali
- [`04c-customizable-editor-builder.md`](./ui/04c-customizable-editor-builder.md): Drag & drop visual builder per l'editor dei contenuti
- [`dynamic-view-configuration.md`](./ui/dynamic-view-configuration.md): Configurazione dinamica viste per Seed
- [`fields-shared-component-promotion.md`](./ui/fields-shared-component-promotion.md): Promozione modulo `fields` a shared library
- [`column-resizing-and-density.md`](./ui/column-resizing-and-density.md): Ridimensionamento colonne DataTable & densità vista
- [`entry-editor-dialog-animation.md`](./ui/entry-editor-dialog-animation.md): Unificazione animazioni di apertura/chiusura modale editor
- [`list-view-presentation.md`](./ui/list-view-presentation.md): Presentazione lista ispirata a Frappe UI

### 🏗️ [`abstraction/`](./abstraction/) — Astrazioni Architetturali Core (1-6)
- [`01-abstraction.md`](./abstraction/01-abstraction.md) ... [`06-abstraction.md`](./abstraction/06-abstraction.md): Contratti architetturali Botanical Engine, repository pattern e disaccoppiamento edge.

### 🎨 [`frontend/`](./frontend/) — Refactoring Architetturale Dashboard
- [`01-frontend-chore.md`](./frontend/01-frontend-chore.md): Allineamento Vertical Slice Architecture (VSA) in `apps/dashboard`
- [`02-frontend-chore.md`](./frontend/02-frontend-chore.md): Modularizzazione e isolamento slice dashboard

### 🔍 [`seo/`](./seo/) & 🐛 [`bugfix/`](./bugfix/)
- [`seo/seo-evolution.md`](./seo/seo-evolution.md): Evoluzione meta tag e motori SEO dinamici
- [`bugfix/pending-drafts.md`](./bugfix/pending-drafts.md): Risoluzione persistenza bozze in sospeso
