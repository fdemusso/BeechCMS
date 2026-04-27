/**
 * Your seeds go here.
 *
 * A Seed defines a content type: its slug (used in API URLs), its display labels,
 * and its branches (fields).
 *
 * Each Branch has:
 *   id     — immutable database key (e.g. 'abc_01'). Never change this after
 *             the first migration or stored data will break.
 *   alias  — the name used in API payloads (e.g. 'title'). Safe to rename.
 *   label  — human-readable label shown in the dashboard.
 *   type   — 'text' | 'number' | 'boolean' | 'date' | 'richtext' | 'file' | 'json'
 *
 * Seed-level flags:
 *   allowPublicRead  — expose entries via the unauthenticated Public API (GET).
 *   allowPublicPost  — accept submissions via the Public API (POST). Useful for forms.
 *   allowDrafts      — enable a pending-draft workflow for this content type.
 *   displayNameAlias — which branch alias is used as the entry title in the dashboard.
 *
 * Branch policies (all optional):
 *   policies.visibility  — 'full' (default) | 'masked' | 'hidden'
 *   policies.public      — false to exclude the field from Public API responses
 *   policies.search      — false to exclude the field from full-text search
 *
 * Example — uncomment and adapt to define your first content type:
 *
 * export const PROJECT_SEED: Seed = {
 *   slug: 'projects',
 *   label: 'Project',
 *   labelPlural: 'Projects',
 *   displayNameAlias: 'title',
 *   allowPublicRead: true,
 *   branches: [
 *     { id: 'prj_01', alias: 'title',       label: 'Title',       type: 'text', requiredOnCreate: true },
 *     { id: 'prj_02', alias: 'description', label: 'Description', type: 'text' },
 *     { id: 'prj_03', alias: 'coverImage',  label: 'Cover image', type: 'file' },
 *     { id: 'prj_04', alias: 'tags',        label: 'Tags',        type: 'json' },
 *     { id: 'prj_05', alias: 'published',   label: 'Published',   type: 'boolean' },
 *   ],
 * }
 */
