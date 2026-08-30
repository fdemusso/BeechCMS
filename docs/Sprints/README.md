# BeechCMS Sprint Archive & Historical Catalog

Benvenuto nell'archivio storico degli Sprint di **BeechCMS**. Questo documento funge da indice centrale e catalogo strutturato di tutti gli sprint di sviluppo, refactoring architetturale, evoluzioni e hardening eseguiti nel repository.

---

## 🏛️ Struttura dell'Archivio

L'archivio degli sprint è suddiviso in due sezioni principali:

1. **Sprint della Pipeline AI (`Pipeline Sprints`)**: Sprint eseguiti secondo il workflow autonomo a 4 stadi (`00_ideation` → `01_sprint_planning` → `02_execution` → `03_review`). Ogni cartella è autosufficiente e contiene:
   - `[NomeSprint].md`: Il piano di sprint dettagliato con VSA, God Nodes, D1 SQL, contratti TypeScript e Acceptance Criteria.
   - `execution_log.md`: Il registro delle modifiche implementate e dei test eseguiti.
   - `review_report.md`: Il report indipendente di verifica con verdetto (`PASS`), evidenze di test e invarianti.
   - `feature_brief.md` / `ROADMAP.md` (opzionali per feature multi-sprint).
2. **Serie Tematiche & Cataloghi di Dominio (`Topic Series`)**: Raccolte modulari e numerate di specifiche di sprint raggruppate per modulo funzionale (Core, UI, DB, DX, Automations, ecc.).

---

## 🤖 Sprint della Pipeline AI (Archivio Autonomo)

| Cartella / Sprint | Descrizione / Deliverable Principali | Artefatti | Stato |
| :--- | :--- | :--- | :---: |
| [`ZeroSecretPublicFormDefense/`](./ZeroSecretPublicFormDefense/) | Zero-Secret public form ingestion, anti-bot time-trap tokens HMAC, honeypot camouflage, rate limiting a bucket token continuo, integrazione `@beechcms/forms-react` | [Piano](./ZeroSecretPublicFormDefense/ZeroSecretPublicFormDefense.md) · [Log](./ZeroSecretPublicFormDefense/execution_log.md) · [Review](./ZeroSecretPublicFormDefense/review_report.md) | `PASS` |
| [`ConfidentialDataLifecycle/`](./ConfidentialDataLifecycle/) | Classificazione dati riservati, lifecycle di cifratura AES-256-GCM su D1, `publicEdit` policy, dispatch unmasked per automation runner | [Piano](./ConfidentialDataLifecycle/ConfidentialDataLifecycle.md) · [Log](./ConfidentialDataLifecycle/execution_log.md) · [Review](./ConfidentialDataLifecycle/review_report.md) | `PASS` |
| [`TipTapRichTextRendering/`](./TipTapRichTextRendering/) | Submodulo `@beechcms/client/richtext`, renderer isomorfo TipTap HTML, estrattore testo puro senza DOM | [Piano](./TipTapRichTextRendering/TipTapRichTextRendering.md) · [Log](./TipTapRichTextRendering/execution_log.md) · [Review](./TipTapRichTextRendering/review_report.md) | `PASS` |
| [`StrictClientSdkSegregation/`](./StrictClientSdkSegregation/) | Segregazione browser/server SDK in `@beechcms/client`, eliminazione leakage Node/crypto su bundle client | [Piano](./StrictClientSdkSegregation/StrictClientSdkSegregation.md) · [Log](./StrictClientSdkSegregation/execution_log.md) · [Review](./StrictClientSdkSegregation/review_report.md) | `PASS` |
| [`ClientSdkWebhookSubmodule/`](./ClientSdkWebhookSubmodule/) | Submodulo `@beechcms/client/webhooks`, verifica firme HMAC SHA-256 e payload typing | [Piano](./ClientSdkWebhookSubmodule/ClientSdkWebhookSubmodule.md) · [Log](./ClientSdkWebhookSubmodule/execution_log.md) · [Review](./ClientSdkWebhookSubmodule/review_report.md) | `PASS` |
| [`Sprint_5_Secure_Form_Toolkit_React_SDK/`](./Sprint_5_Secure_Form_Toolkit_React_SDK/) | Pacchetto `@beechcms/forms-react`, componente `<BeechForm />`, hook `useBeechForm`, recovery draft localStorage | [Piano](./Sprint_5_Secure_Form_Toolkit_React_SDK/Sprint_5_Secure_Form_Toolkit_React_SDK.md) · [Log](./Sprint_5_Secure_Form_Toolkit_React_SDK/execution_log.md) · [Review](./Sprint_5_Secure_Form_Toolkit_React_SDK/review_report.md) | `PASS` |
| [`Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/`](./Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/) | Difese anti-bot per form pubblici, magic bytes file validation, pipeline di quarantena antivirus asincrona | [Piano](./Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/Sprint_4_Public_Form_Security_and_Quarantine_Pipeline.md) · [Log](./Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/execution_log.md) · [Review](./Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/review_report.md) | `PASS` |
| [`Sprint_3_Context_Aware_API_Filtering/`](./Sprint_3_Context_Aware_API_Filtering/) | Filtraggio API context-aware e scrubbing risposte per field tiers (Public, Internal, Confidential, Restricted) | [Piano](./Sprint_3_Context_Aware_API_Filtering/Sprint_3_Context_Aware_API_Filtering.md) · [Log](./Sprint_3_Context_Aware_API_Filtering/execution_log.md) · [Review](./Sprint_3_Context_Aware_API_Filtering/review_report.md) | `PASS` |
| [`Sprint_2_Payload_Diffing_and_Blind_Index_Integration/`](./Sprint_2_Payload_Diffing_and_Blind_Index_Integration/) | Payload diffing su update per prevenire re-encryption e integrazione blind index HMAC SHA-256 su D1 | [Piano](./Sprint_2_Payload_Diffing_and_Blind_Index_Integration/Sprint_2_Payload_Diffing_and_Blind_Index_Integration.md) · [Log](./Sprint_2_Payload_Diffing_and_Blind_Index_Integration/execution_log.md) · [Review](./Sprint_2_Payload_Diffing_and_Blind_Index_Integration/review_report.md) | `PASS` |
| [`Sprint_1_PrivacyService_Primitives/`](./Sprint_1_PrivacyService_Primitives/) | Primitive crittografiche edge-native in `@beechcms/core`, contract `PrivacyService` e wrapper D1 repository | [Piano](./Sprint_1_PrivacyService_Primitives/Sprint_1_PrivacyService_Primitives.md) · [Log](./Sprint_1_PrivacyService_Primitives/execution_log.md) · [Review](./Sprint_1_PrivacyService_Primitives/review_report.md) | `PASS` |
| [`RichTextValidationModuleSplit/`](./RichTextValidationModuleSplit/) | Splitting modulare del validatore RichText TipTap (Phase 2), separazione regole e schema core | [Piano](./RichTextValidationModuleSplit/RichTextValidationModuleSplit.md) · [Log](./RichTextValidationModuleSplit/execution_log.md) · [Review](./RichTextValidationModuleSplit/review_report.md) | `PASS` |
| [`RichTextValidationRenderHardening/`](./RichTextValidationRenderHardening/) | Hardening P0 di sicurezza e correttezza rendering RichText (Phase 1) | [Piano](./RichTextValidationRenderHardening/RichTextValidationRenderHardening.md) · [Log](./RichTextValidationRenderHardening/execution_log.md) · [Review](./RichTextValidationRenderHardening/review_report.md) | `PASS` |
| [`SchemaSyncGitOpsMigrations/`](./SchemaSyncGitOpsMigrations/) | Schema sync CLI & GitOps D1 migrations per sincronizzazione schema-codice (`@beechcms/cli`) | [Piano](./SchemaSyncGitOpsMigrations/SchemaSyncGitOpsMigrations.md) · [Log](./SchemaSyncGitOpsMigrations/execution_log.md) · [Brief](./SchemaSyncGitOpsMigrations/feature_brief.md) | `PASS` |
| [`NewcodeTestAuthoring/`](./NewcodeTestAuthoring/) | Authoring unit test e copertura logiche pure kanban (`kanban-reorder`, `autoscroll-math`) per il New-Code gate SonarQube | [Piano](./NewcodeTestAuthoring/NewcodeTestAuthoring.md) · [Log](./NewcodeTestAuthoring/execution_log.md) · [Roadmap](./NewcodeTestAuthoring/ROADMAP.md) | `PASS` |
| [`CoverageExclusionRepair/`](./CoverageExclusionRepair/) | Ripristino allineamento esclusioni coverage Vitest e SonarQube dopo il refactoring domain-driven di `@beechcms/core` | [Piano](./CoverageExclusionRepair/coverage-exclusion-repair.md) · [Log](./CoverageExclusionRepair/execution_log.md) · [Review](./CoverageExclusionRepair/review_report.md) | `PASS` |
| [`IconMigration/`](./IconMigration/) | Migrazione centralizzata e standardizzazione icone Lucide nell'intera dashboard | [Piano](./IconMigration/IconMigration.md) · [Log](./IconMigration/execution_log.md) · [Review](./IconMigration/review_report.md) | `PASS` |

---

## 📚 Serie Tematiche & Piani per Modulo

### 🔐 Data Privacy, Forms & Security Epic
La serie completa che ha introdotto il tiering di riservatezza, la cifratura a riposo e la sicurezza dei form pubblici:
- [Sprint 1: PrivacyService Primitives](./Sprint_1_PrivacyService_Primitives/Sprint_1_PrivacyService_Primitives.md)
- [Sprint 2: Payload Diffing & Blind Index](./Sprint_2_Payload_Diffing_and_Blind_Index_Integration/Sprint_2_Payload_Diffing_and_Blind_Index_Integration.md)
- [Sprint 3: Context-Aware API Filtering](./Sprint_3_Context_Aware_API_Filtering/Sprint_3_Context_Aware_API_Filtering.md)
- [Sprint 4: Public Form Security & Quarantine Pipeline](./Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/Sprint_4_Public_Form_Security_and_Quarantine_Pipeline.md)
- [Sprint 5: Secure Form Toolkit React SDK (`@beechcms/forms-react`)](./Sprint_5_Secure_Form_Toolkit_React_SDK/Sprint_5_Secure_Form_Toolkit_React_SDK.md)
- [Sprint 6: Confidential Data Classification & Ingestion Lifecycle](./ConfidentialDataLifecycle/ConfidentialDataLifecycle.md)
- [Sprint 7: Zero-Secret Public Form Ingestion & Anti-Bot Defense Layer](./ZeroSecretPublicFormDefense/ZeroSecretPublicFormDefense.md)

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
