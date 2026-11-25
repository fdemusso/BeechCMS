# BeechCMS Sprint Archive & Historical Catalog

Benvenuto nell'archivio storico degli Sprint di **BeechCMS**. Questo documento è l'indice centrale di tutti i piani, le roadmap e gli sprint di sviluppo eseguiti nel repository.

> **Struttura a 2 livelli (`<area-tematica>/<piano>/<sprint>`):**
> 1. **Aree Tematiche** (`7` macro-aree al primo livello): raggruppano i piani per dominio funzionale.
> 2. **Piani / Roadmap** (al secondo livello): ogni piano ha una propria cartella dedicata con nome specifico. I piani multi-sprint contengono `ROADMAP.md` / `feature_brief.md` (quando presenti) alla radice del piano e le singole cartelle degli sprint numerate (`01-`, `02-`, ...) al loro interno.
>
> *Nota:* i riferimenti interni a vecchi path (es. `docs/Sprints/SchemaManifestDsl/`) presenti nei documenti storici riflettono il path al momento della scrittura.

---

## 🗂️ Aree Tematiche

| Area | Descrizione | Piani |
| :--- | :--- | :--- |
| [`core-and-schema/`](./core-and-schema/) | Botanical Engine, schema, D1, relazioni, query builder e tag | `abstraction`, `d1-schema-authority`, `relations`, `richtext-validation`, `runtime-seeds`, `schema-sync-gitops-migrations`, `tag-choice`, `typed-fluent-query-builder` |
| [`content-and-media/`](./content-and-media/) | Ciclo di vita contenuti, localizzazione, bulk transfer, search, media e SEO | `bugfix`, `bulk-transfer`, `draft-publish-conflict-guard`, `field-localization`, `media`, `media-preset-transforms`, `semantic-hybrid-search`, `seo`, `soft-delete`, `universal-soft-delete` |
| [`dashboard-and-views/`](./dashboard-and-views/) | Dashboard UI, Saved Views, Kanban, BeechPal e Composer | `beech-pal`, `dashboard-composer`, `frontend`, `icon-migration`, `json-field-editor`, `kanban`, `saved-views`, `ui` |
| [`security-and-access/`](./security-and-access/) | RBAC, OAuth, API Keys, Data Privacy e Rate Limiting | `data-privacy-security`, `oauth`, `publishable-secret-keys`, `rbac`, `rbac-dashboard`, `token-bucket-rate-limiting` |
| [`automation-and-analytics/`](./automation-and-analytics/) | Motore di automazioni e modulo analytics GA4 | `analytics`, `automation` |
| [`mcp-and-ai/`](./mcp-and-ai/) | Server MCP 1.x e Agent Control Plane 2.0 | `mcp-agent-control-plane`, `mcp-server` |
| [`sdk-cli-and-dx/`](./sdk-cli-and-dx/) | Client SDK, CLI, testing harness, docs e DX | `client-sdk-modularization`, `dev-cli`, `docs-redesign`, `dx-improvement`, `testing-harness` |

---

## 🧱 `core-and-schema/`

### [`typed-fluent-query-builder/`](./core-and-schema/typed-fluent-query-builder/) — Typed Fluent Query Builder (#381 → #385)
[`ROADMAP.md`](./core-and-schema/typed-fluent-query-builder/ROADMAP.md)
- [`01-SchemaManifestDsl/`](./core-and-schema/typed-fluent-query-builder/01-SchemaManifestDsl/) — DSL `beech.schema.ts` in `@beechcms/core/schema`
- [`02-SchemaIntrospectionFingerprint/`](./core-and-schema/typed-fluent-query-builder/02-SchemaIntrospectionFingerprint/) — Introspezione D1 via PRAGMA + fingerprint
- [`03a-CliSchemaExportTypes/`](./core-and-schema/typed-fluent-query-builder/03a-CliSchemaExportTypes/) — `beech schema export|diff` + `beech types generate`
- [`03b-CliSchemaPlanApply/`](./core-and-schema/typed-fluent-query-builder/03b-CliSchemaPlanApply/) — `beech schema plan|apply` via MCP control plane
- [`04-PublicApiRelationExpansion/`](./core-and-schema/typed-fluent-query-builder/04-PublicApiRelationExpansion/) — `include=` su `/api/v1/public/*` + `X-Schema-Revision`
- [`05-FluentClientQueryBuilder/`](./core-and-schema/typed-fluent-query-builder/05-FluentClientQueryBuilder/) — Fluent chain `.where().include().select()`
- [`06-ClientRelationSubqueries/`](./core-and-schema/typed-fluent-query-builder/06-ClientRelationSubqueries/) — Filtri `IN` su relazioni via `include=`

### [`tag-choice/`](./core-and-schema/tag-choice/) — Tag con opzioni come unico modello di scelta
[`ROADMAP.md`](./core-and-schema/tag-choice/ROADMAP.md) · [`feature_brief.md`](./core-and-schema/tag-choice/feature_brief.md)
- [`01-TagOptionsContract/`](./core-and-schema/tag-choice/01-TagOptionsContract/) — `Branch.options` come `TagOption[]` su `tags`
- [`02-SchemaPlanDefinitionDiff/`](./core-and-schema/tag-choice/02-SchemaPlanDefinitionDiff/) — Diff e apply di soli cambi definizione schema
- [`03-TagChoiceEditing/`](./core-and-schema/tag-choice/03-TagChoiceEditing/) — Editor dropdown, chip colorati e Seed Builder
- [`04-TagChoiceViews/`](./core-and-schema/tag-choice/04-TagChoiceViews/) — Kanban, ordinamento, raggruppamento e filtri su tag singoli

### [`d1-schema-authority/`](./core-and-schema/d1-schema-authority/) — Canonical D1 Schema Authority
- [`01-sprint_decouple_seeds_ts_canonical_d1/`](./core-and-schema/d1-schema-authority/01-sprint_decouple_seeds_ts_canonical_d1/) — D1 come autorità canonica dello schema
- [`02-sprint_d1_typescript_type_generator/`](./core-and-schema/d1-schema-authority/02-sprint_d1_typescript_type_generator/) — `beech gen types typescript` introspettivo su D1

### [`richtext-validation/`](./core-and-schema/richtext-validation/) — RichText Validator Hardening & Split
- [`01-RichTextValidationRenderHardening/`](./core-and-schema/richtext-validation/01-RichTextValidationRenderHardening/) — Hardening P0 sicurezza/correttezza rendering
- [`02-RichTextValidationModuleSplit/`](./core-and-schema/richtext-validation/02-RichTextValidationModuleSplit/) — Split modulare regole/schema core

### [`schema-sync-gitops-migrations/`](./core-and-schema/schema-sync-gitops-migrations/) — Schema Sync & GitOps D1 Migrations
- Piano singolo CLI schema sync & GitOps migrations (`@beechcms/cli`)

### Serie di dominio
- [`abstraction/`](./core-and-schema/abstraction/) — Astrazioni Architetturali Core (01–06)
- [`relations/`](./core-and-schema/relations/) — Relazioni & Chiavi Esterne (01–08)
- [`runtime-seeds/`](./core-and-schema/runtime-seeds/) — Runtime Schema & DDL Planner (00–11)

---

## 📄 `content-and-media/`

### [`field-localization/`](./content-and-media/field-localization/) — Field-Level Localization
[`ROADMAP.md`](./content-and-media/field-localization/ROADMAP.md) · [`feature_brief.md`](./content-and-media/field-localization/feature_brief.md)
- [`01-LocalizationCoreContracts/`](./content-and-media/field-localization/01-LocalizationCoreContracts/) — Contratti `Branch.localized` e codec core
- [`02-LocalizedWritePath/`](./content-and-media/field-localization/02-LocalizedWritePath/) — Settings lingue e merge dizionari in scrittura
- [`03-LocalizedReadNegotiation/`](./content-and-media/field-localization/03-LocalizedReadNegotiation/) — Negoziazione `?lang` / `Accept-Language` e SDK `.lang()`
- [`04-LocalizedDashboardRead/`](./content-and-media/field-localization/04-LocalizedDashboardRead/) — Settings UI e risoluzione valori in lista/card/kanban
- [`05-LocalizedEntryEditor/`](./content-and-media/field-localization/05-LocalizedEntryEditor/) — Toggle Seed Builder e selettore lingua nell'Entry Editor

### [`bulk-transfer/`](./content-and-media/bulk-transfer/) — Bulk Data Transfer (Export / Import)
[`ROADMAP.md`](./content-and-media/bulk-transfer/ROADMAP.md) · [`feature_brief.md`](./content-and-media/bulk-transfer/feature_brief.md)
- [`01-BulkTransferCorePrimitives/`](./content-and-media/bulk-transfer/01-BulkTransferCorePrimitives/) — Codec CSV/NDJSON, predicati flat-seed e `JobContext.queue`
- [`02-ContentExportStream/`](./content-and-media/bulk-transfer/02-ContentExportStream/) — Export streaming HTTP con cursore keyset
- [`03-ContentImportJobs/`](./content-and-media/bulk-transfer/03-ContentImportJobs/) — Import asincrono a chunk via R2 e `import_jobs`
- [`04-BulkTransferDashboard/`](./content-and-media/bulk-transfer/04-BulkTransferDashboard/) — Toolbar export e wizard import in dashboard

### [`soft-delete/`](./content-and-media/soft-delete/) — Soft Delete & Trash Bin Lifecycle
- [`01-SoftDeleteBackend/`](./content-and-media/soft-delete/01-SoftDeleteBackend/) — Engine, repository e contratti HTTP trash/purge
- [`02-SoftDeleteDashboardTrash/`](./content-and-media/soft-delete/02-SoftDeleteDashboardTrash/) — UI Trash in dashboard

### [`universal-soft-delete/`](./content-and-media/universal-soft-delete/) — Universal Soft Delete & Trash Retention
[`ROADMAP.md`](./content-and-media/universal-soft-delete/ROADMAP.md) · [`feature_brief.md`](./content-and-media/universal-soft-delete/feature_brief.md)
- [`01-UniversalSoftDelete/`](./content-and-media/universal-soft-delete/01-UniversalSoftDelete/) — Soft delete unico per tutti i seed
- [`02-TrashRetentionSweep/`](./content-and-media/universal-soft-delete/02-TrashRetentionSweep/) — Retention globale/per-seed e cron sweep
- [`03-InstantDeleteUndo/`](./content-and-media/universal-soft-delete/03-InstantDeleteUndo/) — Eliminazione istantanea con Undo toast e countdown

### [`semantic-hybrid-search/`](./content-and-media/semantic-hybrid-search/) — Zero-Cost Serverless Edge Vector Search
[`ROADMAP.md`](./content-and-media/semantic-hybrid-search/ROADMAP.md)
- [`01-core-and-storage/`](./content-and-media/semantic-hybrid-search/01-core-and-storage/) — `IVectorRepository` e tabelle `vector_${slug}`
- [`02-semantic-search-api-pipeline/`](./content-and-media/semantic-hybrid-search/02-semantic-search-api-pipeline/) — Pipeline API di ricerca semantica
- [`03-hybrid-search-client-sdk/`](./content-and-media/semantic-hybrid-search/03-hybrid-search-client-sdk/) — SDK client per ricerca ibrida

### Piani singoli & serie
- [`draft-publish-conflict-guard/`](./content-and-media/draft-publish-conflict-guard/) — Optimistic concurrency control su `publishDraft` (409)
- [`media-preset-transforms/`](./content-and-media/media-preset-transforms/) — Trasformazioni immagini edge-native via preset
- [`media/`](./content-and-media/media/) — Storage & Gestione Media (01–03)
- [`seo/`](./content-and-media/seo/) — Evoluzione meta tag e motori SEO dinamici
- [`bugfix/`](./content-and-media/bugfix/) — Fix bozze in sospeso (`pending-drafts.md`)

---

## 🖥️ `dashboard-and-views/`

### [`beech-pal/`](./dashboard-and-views/beech-pal/) — BeechPal Command Palette
[`ROADMAP.md`](./dashboard-and-views/beech-pal/ROADMAP.md) · [`feature_brief.md`](./dashboard-and-views/beech-pal/feature_brief.md)
- [`01-BeechPalProviderEngine/`](./dashboard-and-views/beech-pal/01-BeechPalProviderEngine/) — Aggregatore provider + proiezione RBAC
- [`02-BeechPalLocalTools/`](./dashboard-and-views/beech-pal/02-BeechPalLocalTools/) — Calcolatrice e conversioni in-row
- [`03-SearchResultMetadataApi/`](./dashboard-and-views/beech-pal/03-SearchResultMetadataApi/) — Metadati `updated_at` e `author_name` su `/api/search`
- [`04-BeechPalContentSearch/`](./dashboard-and-views/beech-pal/04-BeechPalContentSearch/) — Ricerca contenuti asincrona nella root list
- [`04b-BeechPalRowActions/`](./dashboard-and-views/beech-pal/04b-BeechPalRowActions/) — Azioni secondarie e sottomenu per riga
- [`05-BeechPalQuickNotes/`](./dashboard-and-views/beech-pal/05-BeechPalQuickNotes/) — Note rapide browser-only con prefisso `#`
- [`06-BeechPalContextActions/`](./dashboard-and-views/beech-pal/06-BeechPalContextActions/) — Azioni contestuali dichiarate dalle pagine host
- [`07-BeechPalSystemCommands/`](./dashboard-and-views/beech-pal/07-BeechPalSystemCommands/) — Preferenze, stato sistema e scorciatoie (`>`)
- [`07b-BeechPalRecentItems/`](./dashboard-and-views/beech-pal/07b-BeechPalRecentItems/) — Elementi recenti browser-only
- [`08-UiPreferencesApi/`](./dashboard-and-views/beech-pal/08-UiPreferencesApi/) — Container API `ui-preferences` per utente
- [`09-BeechPalPins/`](./dashboard-and-views/beech-pal/09-BeechPalPins/) — Pin persistenti cross-device in cima alla palette

### [`saved-views/`](./dashboard-and-views/saved-views/) — Saved Views (View Types → View Instances + Harness)
[`ROADMAP.md`](./dashboard-and-views/saved-views/ROADMAP.md) · [`feature_brief.md`](./dashboard-and-views/saved-views/feature_brief.md)
- [`01-ContentViewsPersistence/`](./dashboard-and-views/saved-views/01-ContentViewsPersistence/) — Modello `ContentView` e API `/views`
- [`02-ViewInstancesDashboard/`](./dashboard-and-views/saved-views/02-ViewInstancesDashboard/) — Dashboard guidata da istanze di vista
- [`03-ViewSwitcherRedesign/`](./dashboard-and-views/saved-views/03-ViewSwitcherRedesign/) — Tab switcher ordinabile e picker viste
- [`04-ViewHarnessContract/`](./dashboard-and-views/saved-views/04-ViewHarnessContract/) — Contratto `ViewDefinition` e viewport condiviso
- [`05-UniversalElementFormatting/`](./dashboard-and-views/saved-views/05-UniversalElementFormatting/) — Formattazione condizionale universale `element|field`
- [`06-GalleryEntryEditorUnification/`](./dashboard-and-views/saved-views/06-GalleryEntryEditorUnification/) — Unificazione Gallery ↔ Entry Editor

### [`json-field-editor/`](./dashboard-and-views/json-field-editor/) — JSON Field Layout & Editor
- [`01-json-layout-core-and-form-contract/`](./dashboard-and-views/json-field-editor/01-json-layout-core-and-form-contract/) — Tipo `json` full-width e contratti layout/form
- [`02-codemirror-json-editor/`](./dashboard-and-views/json-field-editor/02-codemirror-json-editor/) — Editor CodeMirror dedicato

### Piani singoli & serie
- [`icon-migration/`](./dashboard-and-views/icon-migration/) — Standardizzazione icone Lucide nella dashboard
- [`dashboard-composer/`](./dashboard-and-views/dashboard-composer/) — Dashboard Personalizzabile (00–07)
- [`kanban/`](./dashboard-and-views/kanban/) — Vista Kanban & Card Customization (01–06)
- [`ui/`](./dashboard-and-views/ui/) — Dashboard UI, Entry Editor & Views
- [`frontend/`](./dashboard-and-views/frontend/) — Refactoring Architetturale Dashboard (01–02)

---

## 🔐 `security-and-access/`

### [`rbac/`](./security-and-access/rbac/) — Multi-Stakeholder RBAC / Multi-Tenant Portal
[`ROADMAP.md`](./security-and-access/rbac/ROADMAP.md)
- [`01-RbacCorePrimitives/`](./security-and-access/rbac/01-RbacCorePrimitives/) — Evaluator ABAC e tabelle D1
- [`02-RbacRequestEnforcement/`](./security-and-access/rbac/02-RbacRequestEnforcement/) — Gate di autorizzazione unico su ogni richiesta
- [`03-RbacUserRoleAdminApi/`](./security-and-access/rbac/03-RbacUserRoleAdminApi/) — API amministrazione utenti/ruoli
- [`04-RbacInvitations/`](./security-and-access/rbac/04-RbacInvitations/) — Onboarding invite-only single-use
- [`05-RbacScopedProjections/`](./security-and-access/rbac/05-RbacScopedProjections/) — Proiezioni scope-aware sui listing
- [`06-RbacDashboardSurfaces/`](./security-and-access/rbac/06-RbacDashboardSurfaces/) — Superfici dashboard permission-aware
- [`07-RbacContentActionGating/`](./security-and-access/rbac/07-RbacContentActionGating/) — Disabilitazione azioni non autorizzate

### [`rbac-dashboard/`](./security-and-access/rbac-dashboard/) — RBAC-Native Dashboard & Legacy Role Removal
[`ROADMAP.md`](./security-and-access/rbac-dashboard/ROADMAP.md) · [`feature_brief.md`](./security-and-access/rbac-dashboard/feature_brief.md)
- [`01-DashboardDataScopeClosure/`](./security-and-access/rbac-dashboard/01-DashboardDataScopeClosure/) — Chiusura scope su `/stats/*`
- [`02-DashboardTabAudienceApi/`](./security-and-access/rbac-dashboard/02-DashboardTabAudienceApi/) — Tab audience per role id lato API
- [`03-DashboardTabAudienceUi/`](./security-and-access/rbac-dashboard/03-DashboardTabAudienceUi/) — Rendering ed editing tab audience in UI
- [`04-WidgetPermissionRequirements/`](./security-and-access/rbac-dashboard/04-WidgetPermissionRequirements/) — Requisiti `requires` sui widget
- [`05-ManageLayoutPermissionApi/`](./security-and-access/rbac-dashboard/05-ManageLayoutPermissionApi/) — Permesso `manage_layout` e widget bloccati lato API
- [`06-ManageLayoutPermissionUi/`](./security-and-access/rbac-dashboard/06-ManageLayoutPermissionUi/) — Builder UI per `manage_layout` vs `manage_roles`
- [`07-ManageSeedsPermission/`](./security-and-access/rbac-dashboard/07-ManageSeedsPermission/) — Permesso `manage_seeds` su `/api/seeds/*`
- [`08-LegacyRoleGateReplacement/`](./security-and-access/rbac-dashboard/08-LegacyRoleGateReplacement/) — Rimozione lettori di `users.role` e JWT `role`
- [`09-LegacyRoleAxisRemoval/`](./security-and-access/rbac-dashboard/09-LegacyRoleAxisRemoval/) — Rimozione colonna `users.role` e claim legacy
- [`10-RbacDashboardDocs/`](./security-and-access/rbac-dashboard/10-RbacDashboardDocs/) — Allineamento documentazione al modello RBAC

### [`oauth/`](./security-and-access/oauth/) — OAuth 2.1 Authorization Server per MCP
[`ROADMAP.md`](./security-and-access/oauth/ROADMAP.md)
- [`01-oauth-core-foundation/`](./security-and-access/oauth/01-oauth-core-foundation/) — Persistenza e contratti OAuth in core
- [`02-oauth-authorization-server/`](./security-and-access/oauth/02-oauth-authorization-server/) — `/oauth/authorize`, `/oauth/token`, `/oauth/revoke` PKCE S256
- [`03-oauth-resource-server-scopes/`](./security-and-access/oauth/03-oauth-resource-server-scopes/) — Enforcement scope OAuth sulle route MCP
- [`04-oauth-dashboard-consent-ui/`](./security-and-access/oauth/04-oauth-dashboard-consent-ui/) — Schermata di consenso e "Connected apps"
- [`05-mcp-pkce-client/`](./security-and-access/oauth/05-mcp-pkce-client/) — Flusso PKCE browser-based in `packages/mcp`

### [`publishable-secret-keys/`](./security-and-access/publishable-secret-keys/) — Publishable & Secret Keys (#995–#997)
[`ROADMAP.md`](./security-and-access/publishable-secret-keys/ROADMAP.md) · [`feature_brief.md`](./security-and-access/publishable-secret-keys/feature_brief.md)
- [`01-KeyRoleRuntime/`](./security-and-access/publishable-secret-keys/01-KeyRoleRuntime/) — Runtime distinzione publishable vs secret keys
- [`02-ScaffoldSecrets/`](./security-and-access/publishable-secret-keys/02-ScaffoldSecrets/) — Scaffolding chiavi e segreti CLI
- [`03-KeysMigrate/`](./security-and-access/publishable-secret-keys/03-KeysMigrate/) — Migrazione progetti 0.10.x
- [`04-KeyModelDocs/`](./security-and-access/publishable-secret-keys/04-KeyModelDocs/) — Documentazione modello chiavi

### [`data-privacy-security/`](./security-and-access/data-privacy-security/) — Data Privacy, Forms & Security Epic
- [`01-Sprint_1_PrivacyService_Primitives/`](./security-and-access/data-privacy-security/01-Sprint_1_PrivacyService_Primitives/)
- [`02-Sprint_2_Payload_Diffing_and_Blind_Index_Integration/`](./security-and-access/data-privacy-security/02-Sprint_2_Payload_Diffing_and_Blind_Index_Integration/)
- [`03-Sprint_3_Context_Aware_API_Filtering/`](./security-and-access/data-privacy-security/03-Sprint_3_Context_Aware_API_Filtering/)
- [`04-Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/`](./security-and-access/data-privacy-security/04-Sprint_4_Public_Form_Security_and_Quarantine_Pipeline/)
- [`05-Sprint_5_Secure_Form_Toolkit_React_SDK/`](./security-and-access/data-privacy-security/05-Sprint_5_Secure_Form_Toolkit_React_SDK/)
- [`06-ConfidentialDataLifecycle/`](./security-and-access/data-privacy-security/06-ConfidentialDataLifecycle/)
- [`07-ZeroSecretPublicFormDefense/`](./security-and-access/data-privacy-security/07-ZeroSecretPublicFormDefense/)

### Piani singoli
- [`token-bucket-rate-limiting/`](./security-and-access/token-bucket-rate-limiting/) — Rate limiting Token Bucket + Dual-Key (IP + Account)

---

## ⚡ `automation-and-analytics/`

- [`automation/`](./automation-and-analytics/automation/) — Motore di Automazioni (01–08)
- [`analytics/`](./automation-and-analytics/analytics/) — Modulo Analytics & GA4 (01–05)

---

## 🤖 `mcp-and-ai/`

### [`mcp-server/`](./mcp-and-ai/mcp-server/) — BeechCMS MCP Server 1.x
- [`01-beechcms_mcp_sprint/`](./mcp-and-ai/mcp-server/01-beechcms_mcp_sprint/) — Server MCP standalone CLI-invoked
- [`02-mcp_resources_bundle/`](./mcp-and-ai/mcp-server/02-mcp_resources_bundle/) — Resources bundle per tool/agent guidance

### [`mcp-agent-control-plane/`](./mcp-and-ai/mcp-agent-control-plane/) — `@beechcms/mcp` 2.0 Agent Control Plane
*(Prosegue la numerazione 03–08 dopo i due sprint 1.x di `mcp-server/`)*
- [`03-OperationCatalog/`](./mcp-and-ai/mcp-agent-control-plane/03-OperationCatalog/) — Catalogo operazioni e matching contratti
- [`04-OAuthScopesV2/`](./mcp-and-ai/mcp-agent-control-plane/04-OAuthScopesV2/) — Vocabolario scope OAuth v2 e consent templates
- [`05-AgentIntents/`](./mcp-and-ai/mcp-agent-control-plane/05-AgentIntents/) — Intents, policy e replay server-side
- [`05b-AgentIntentsDashboard/`](./mcp-and-ai/mcp-agent-control-plane/05b-AgentIntentsDashboard/) — UI approvazione intents in dashboard
- [`06-ScriptSdk/`](./mcp-and-ai/mcp-agent-control-plane/06-ScriptSdk/) — SDK `beech` per script, journal e dry-run
- [`07-BeechRun/`](./mcp-and-ai/mcp-agent-control-plane/07-BeechRun/) — Comando `beech run`
- [`08-Mcp2/`](./mcp-and-ai/mcp-agent-control-plane/08-Mcp2/) — `@beechcms/mcp` 2.0 server

---

## 🛠️ `sdk-cli-and-dx/`

### [`client-sdk-modularization/`](./sdk-cli-and-dx/client-sdk-modularization/) — `@beechcms/client` Strict-by-Design Submodules
- [`01-StrictClientSdkSegregation/`](./sdk-cli-and-dx/client-sdk-modularization/01-StrictClientSdkSegregation/) — Subpath `./browser` e `./server`
- [`02-ClientSdkWebhookSubmodule/`](./sdk-cli-and-dx/client-sdk-modularization/02-ClientSdkWebhookSubmodule/) — Submodulo `./webhooks` HMAC
- [`03-TipTapRichTextRendering/`](./sdk-cli-and-dx/client-sdk-modularization/03-TipTapRichTextRendering/) — Submodulo `./richtext` renderer isomorfo

### [`testing-harness/`](./sdk-cli-and-dx/testing-harness/) — Test Harness & Test Suite Redesign (#108)
[`ROADMAP.md`](./sdk-cli-and-dx/testing-harness/ROADMAP.md)
- [`01-S1_Harness_Foundation/`](./sdk-cli-and-dx/testing-harness/01-S1_Harness_Foundation/) — Package `@beechcms/testing` + seam `BeechConfig`
- [`02-S2_Slice_Test_Layout/`](./sdk-cli-and-dx/testing-harness/02-S2_Slice_Test_Layout/) — Rilocazione test per Vertical Slice
- [`03-S3_CI_Test_Tiering/`](./sdk-cli-and-dx/testing-harness/03-S3_CI_Test_Tiering/) — Selezione test per tier in CI
- [`04-S4_E2E_Playwright/`](./sdk-cli-and-dx/testing-harness/04-S4_E2E_Playwright/) — Tier e2e Playwright isolato
- [`05-S5_Scale_Perf_Tier/`](./sdk-cli-and-dx/testing-harness/05-S5_Scale_Perf_Tier/) — Tier di test scale/performance
- [`06-NewcodeTestAuthoring/`](./sdk-cli-and-dx/testing-harness/06-NewcodeTestAuthoring/) — Copertura new-code SonarQube
- [`07-CoverageExclusionRepair/`](./sdk-cli-and-dx/testing-harness/07-CoverageExclusionRepair/) — Ripristino esclusioni coverage

### [`docs-redesign/`](./sdk-cli-and-dx/docs-redesign/) — Documentation UX Rework & Vertical Slicing
[`ROADMAP.md`](./sdk-cli-and-dx/docs-redesign/ROADMAP.md) · [`feature_brief.md`](./sdk-cli-and-dx/docs-redesign/feature_brief.md)
- [`01-docs-infrastructure-and-theme/`](./sdk-cli-and-dx/docs-redesign/01-docs-infrastructure-and-theme/) — Information architecture 6 macro-aree + tema
- [`02-docs-start-and-build-migration/`](./sdk-cli-and-dx/docs-redesign/02-docs-start-and-build-migration/) — Migrazione contenuti Start/Build
- [`03-docs-reference-vertical-slicing/`](./sdk-cli-and-dx/docs-redesign/03-docs-reference-vertical-slicing/) — Splitting `api-reference.md` in slice verticali
- [`04-docs-features-manage-resources/`](./sdk-cli-and-dx/docs-redesign/04-docs-features-manage-resources/) — Popolamento macro-aree Features/Manage/Resources

### Serie di dominio
- [`dev-cli/`](./sdk-cli-and-dx/dev-cli/) — Developer Experience & CLI Tooling (01–02)
- [`dx-improvement/`](./sdk-cli-and-dx/dx-improvement/) — Serie Miglioramenti DX & Feature Slices (01–16)
