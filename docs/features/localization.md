---
title: Field-Level Localization
description: Translate individual text, richtext and json fields per content language, negotiate the response language on the Public API, and edit translations in the dashboard.
---

# Field-Level Localization

BeechCMS localizes content **per field**, not per entry. You mark the branches that need translating with `localized: true`; every other branch (numbers, dates, relations, media, slugs, status) stays shared across languages. One entry therefore has one `id`, one `slug` and one set of relations, and holds a translation of each localized field for every content language the project registers.

---

## Key Capabilities

- **Per-field opt-in**: `localized: true` on a `text`, `richtext` or `json` branch. No DDL, no migration, no data rewrite.
- **One entry, many languages**: ids, relations, metrics and backrefs are shared; only the marked fields vary.
- **Project-wide language list**: a default locale plus up to 50 enabled locales, configured once in Settings.
- **Language negotiation on the Public API**: `?lang=<code>`, then `Accept-Language`, then the default locale — or every translation with `?lang=all`.
- **Predictable fallback**: a missing translation falls back to the default locale, then to any stored translation, never to an empty field.
- **Merge-on-write**: saving one language never drops the others, and concurrent translation saves are guarded against lost updates.
- **Dashboard locale switcher**: editors switch the content language in the Entry Editor and see per-language completion at a glance.

---

## Configuring Content Languages

Content languages are a project setting, managed in the dashboard under **Settings → Site → Content languages**:

- **Add** a language by its code (`en`, `fr`, `pt-BR`, `es-419`).
- **Make default** marks the language readers see whenever a translation is missing. The default is always one of the enabled languages.
- **Remove** a language to stop offering it. Removing a language **never deletes its translations**: they stay stored in every entry and come back if you add the language again.

The same configuration is exposed by the internal settings endpoint:

```http
PUT /api/settings
Content-Type: application/json

{
  "locales": ["it", "en", "pt-BR"],
  "defaultLocale": "it"
}
```

`GET /api/settings` returns the resolved `locales` and `defaultLocale`. The endpoint refuses invalid input with `400`:

| Problem `type` | Cause |
| :--- | :--- |
| `settings-invalid-locales` | `locales` is empty, has more than 50 entries, contains duplicates or a malformed code |
| `settings-invalid-default-locale` | `defaultLocale` is not a valid locale code |
| `settings-default-locale-not-in-locales` | `defaultLocale` is not one of `locales` |

### Locale codes

A locale code is an ISO 639 language (2–3 lowercase letters), optionally followed by an ISO 3166 region (2 uppercase letters) or a UN M.49 area (3 digits): `it`, `en`, `ast`, `pt-BR`, `es-419`. Script subtags such as `zh-Hant` are not supported yet.

### Before languages are configured

Until you save a language list, the project behaves as mono-lingual: its only content locale is the dashboard's **Default Language** (`defaultLanguage`, falling back to `en`). Once you save `locales`, content languages no longer follow the dashboard UI language.

---

## Marking a Field as Localized

Set `localized: true` on a branch in your seed definition, or tick **Localized** on the field in the Seed Builder:

```typescript
import { defineSeed } from '@beechcms/core'

export const ProductSeed = defineSeed({
  slug: 'products',
  label: 'Product',
  labelPlural: 'Products',
  displayNameAlias: 'name',
  branches: [
    { alias: 'name', type: 'text', requiredOnCreate: true, localized: true }, // [!code highlight]
    { alias: 'description', type: 'richtext', localized: true }, // [!code highlight]
    { alias: 'price', type: 'number' },
    { alias: 'category', type: 'relation', targetSeed: 'categories' },
  ],
})
```

**Rules** (enforced by seed validation — an invalid seed is refused as a whole):

- Only `text`, `richtext` and `json` branches can be localized.
- Only **top-level** branches: repeater sub-fields are never localized.
- Only `plain` storage: `confidential` and `restricted` fields are stored encrypted or hashed, so they cannot hold a readable dictionary. See [Confidential Data](/features/confidential-data).

**Toggling is metadata-only.** Turning `localized` on or off never emits DDL and never rewrites rows:

- **Turning it on**: values written before the toggle are read as the **default-locale** value. You add the other translations over time.
- **Turning it off**: stored translations stay in the column, but the field is no longer read as a dictionary, so the raw stored dictionary shows through. Turn localization back on to read them as translations again.

> [!WARNING]
> A localized branch cannot be retyped. `PATCH /api/seeds/:slug/branches/:branchId/retype` returns `422 retype-localized-not-supported`. Disable localization first, then retype.

---

## How Translations Are Stored

A localized branch keeps its own column and stores a **locale dictionary** in it — locale code → value:

```json
{ "it": "Scarpa da trail", "en": "Trail shoe" }
```

For `richtext`, each value is a TipTap document; for `json`, each value is any JSON value. Every translation is validated and sanitized with the branch's normal rules, exactly as a non-localized value would be.

- A field with **no** translation left is stored as SQL `NULL`, never as `{}`.
- A **legacy plain value** (written before the field was localized) is treated as the default-locale translation, on both reads and writes.
- Translations for a locale that was later **removed** from Settings are kept as-is and are never dropped by a write.

### Read-side fallback chain

When a reader asks for one language, each localized field resolves to the first non-empty value of:

1. the requested locale;
2. the default locale;
3. the first stored translation (in stored order);
4. `null`.

Step 3 keeps the site readable if the default locale changes before every entry has a translation in it.

---

## How Writes Merge Translations

A write to a localized field is **merged** into the stored dictionary; it never replaces it. This holds for the dashboard, the internal content API, drafts, NDJSON import and the Public API.

| Value sent for the field | Effect |
| :--- | :--- |
| A plain value (`"Trail shoe"`, a TipTap doc, a non-dictionary JSON value) | Sets the **default-locale** translation only |
| A dictionary `{ "en": "Trail shoe" }` | Sets each named locale; locales not named are kept |
| A dictionary entry set to `null` or `""` (`{ "fr": null }`) | Clears **that locale only** |
| `null` for the whole field | Clears **every** translation |
| Field omitted | Leaves every translation untouched |

A dictionary must name at least one **registered** locale to be read as translations; unregistered keys in a write are dropped. This is what lets a localized `json` field still accept an ordinary object such as `{ "url": "…", "alt": "…" }` as a default-locale value.

**Required fields.** `requiredOnCreate` checks the **default-locale** translation: other languages are always optional. On update, a write that does not name the default locale leaves it as stored, so saving a single translation never trips `requiredOnUpdate`.

### Concurrent writes (optimistic concurrency)

Merging is a read-modify-write, so two editors saving different languages at the same moment could otherwise lose one translation. Every write that merges a localized field is therefore version-guarded:

- If the client sends its own version (`If-Match`, as the dashboard does), that version is used.
- Otherwise the server guards with the version it merged against.

A write that loses the race fails with `409 Conflict` instead of silently overwriting — `content-update-conflict` on the internal API, `entry-update-conflict` on the Public API. Re-read the entry and retry. Draft saves follow the same rule. See [Drafts & Versioning](/features/drafts).

---

## Reading Localized Content

### Public API

The [Public API](/reference/public-api#localization) negotiates one response language per request:

```http
GET /api/v1/public/products?slug=trail-shoe&lang=en
```

```json
{
  "data": { "id": "…", "slug": "trail-shoe", "name": "Trail shoe", "price": 129 },
  "meta": { "seed": "products" }
}
```

Localized fields come back as **plain values** in the resolved language, so a frontend reads `data.name` exactly as it would a non-localized field. `?lang=all` returns every translation as a dictionary instead. The full negotiation rules, headers and cache behaviour are in the [Public API reference](/reference/public-api#localization); the [Client SDK](/reference/client-sdk#localization-lang) exposes them as `.lang()`.

### Sorting, filtering and search

- **Filters and sort** compare the **resolved** value, the same one the reader sees. On the Public API that is the requested language (the default locale under `?lang=all`); in the dashboard content list it is the default locale.
- **Keyword and semantic search** index **every** translation, so a query matches whatever language it is typed in. Search result titles show the default locale.

### Relation labels and display names

Wherever the dashboard shows an entry by its display name — relation pickers and chips, backrefs, the drafts inbox, search results — a localized display-name field is shown in the **default locale**. On the Public API, `?include=` expands related entries in the same language as the parent response.

### Privacy policies

Field policies apply to each translation. Under `?lang=all` a masked field masks every translation in its dictionary. See [Field Policies & Encryption](/build/field-policies).

---

## Editing in the Dashboard

When an entry has at least one localized field, the Entry Editor header shows a **Content language** switcher (the globe icon):

1. **Pick a language** from the dropdown. Localized fields switch to that language; shared fields (numbers, relations, media…) stay the same for every language.
2. **Read the completion status.** Each language is colored by how many localized fields it fills: normal when complete, amber when partial, red when nothing is translated yet. The default language carries a *default* badge.
3. **Spot missing translations.** A field that is empty in the active language but filled in another shows *"No {locale} value yet: readers in {locale} see a fallback language."*
4. **Copy from default.** On a missing field, **Copy from default** pre-fills it with the default-language value as a starting point.
5. **Save.** Only the languages you changed are sent, so saving the English translation cannot overwrite a colleague's French edit. If the entry changed meanwhile, the save reports a conflict and asks you to reload.

---

## Limitations

Some operations cannot merge per language yet and refuse localized fields instead of risking translation loss:

| Operation | Behaviour with a localized field |
| :--- | :--- |
| **Bulk edit** (content list) | The field is not offered; a request naming it returns `400` (*"Field '…' is localized and cannot be bulk-edited"*). |
| **Automations** `edit_field` action | Refused: setting the field raw would replace every translation. |
| **Kanban views** | A localized field cannot be the grouping column. See [Editorial Views](/features/editorial-views). |
| **CSV export / import** | A seed with a localized field is not flat, so CSV is refused with `csv_requires_flat_seed`. Use **NDJSON**, which carries each field's full dictionary. |
| **Retyping** | Refused with `422 retype-localized-not-supported`; disable localization first. |

Generated client types (`beech types generate`) type a localized field by its base type (e.g. `string` for `text`), which matches single-language reads. Under `?lang=all` the value is a dictionary, so cast accordingly.
