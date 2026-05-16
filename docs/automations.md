# Automations Guide

Automations in BeechCMS allow you to trigger actions—such as sending an email, firing a webhook, updating a field, or creating a new entry—based on content lifecycle events (`create`, `update`, `delete`) or a recurring schedule (`cron`).

## How Automations Work

An Automation consists of:
- **Trigger**: The event that causes the automation to run.
- **Conditions**: Optional logical checks that must pass for the automation to proceed.
- **Actions**: A sequential list of operations to execute.

Actions are executed in order. You can use the state from earlier actions in the subsequent ones by using the template grammar. The current entry that triggered the automation is always accessible using the `this` prefix (e.g. `{{this.title}}` or `{{this:title}}`).

---

## Setting Variables (`set_variable`)

Variables allow you to fetch external data from your database to use in subsequent actions. **Variables must be declared before they are used.** 

You can declare a variable using the `set_variable` action. A variable can load a single record (by providing a `fixed_id`) or an entire collection of records (by omitting `fixed_id`).

### Single-Record Mode
If you provide a `fixed_id` (which can be a literal string or an interpolated value like `{{this.author_id}}`), the variable holds a single object.
- `{{cliente}}` → the entire object (or `null` if not found)
- `{{cliente.nome}}` → a specific column value

### Collection Mode
If `fixed_id` is omitted, the variable loads the entire collection (up to 1,000 records). You can apply filters and ordering when defining the `set_variable` action. 
The collection mode returns a rich object that exposes navigation properties and aggregates over the fetched records. For example, given a variable named `test`:

#### Navigation
- `{{test.firstone.title}}`: The title of the first record in the collection.
- `{{test.lastone.id}}`: The ID of the last record.

#### Aggregates
- `{{test.count}}`: The total number of rows.
- `{{test.sum.budget}}`: The sum of the `budget` numeric branch.
- `{{test.avg.budget}}`: The average of the `budget` numeric branch.
- `{{test.min.publishedAt}}`: The minimum value.
- `{{test.max.publishedAt}}`: The maximum value.
- `{{test.pluck.title}}`: A comma-separated list of up to 100 titles.

#### Inline Conditions
You can filter collections inline within the template by appending `.(column=value)` before aggregates or navigation steps. Supported operators: `=`, `!=`, `<`, `>`, `<=`, `>=`.
- `{{test.count.(status=published)}}`: Count only the published rows.
- `{{test.(publishedAt>1740000000).count}}`: Count only recent records.
- `{{test.firstone.(status=published).title}}`: The title of the first published record.

#### Array Selectors
You can select a specific subset of items by their primary keys using `array[id1,id2]`.
- `{{test.array[art-0001,art-0002].count}}`: The count of the selected subset.
- `{{test.array[art-0001].firstone.title}}`: The title of the specific record `art-0001`.

---

## Example Webhook Payload

Here is a comprehensive webhook payload example demonstrating the rich template grammar available in BeechCMS. This payload uses the triggering entry (`this`) and a previously declared variable named `test` (a collection of articles or similar seed).

```json
{
  "trigger": {
    "title": "{{this:title}}",
    "slug": "{{this:slug}}",
    "status": "{{this:status}}",
    "publishedAt": "{{this:publishedAt}}"
  },

  "collection": {
    "count_totale": "{{test.count}}",
    "count_published": "{{test.(status=published).count}}",
    "count_recenti": "{{test.(publishedAt>1740000000).count}}",

    "sum_publishedAt": "{{test.sum.publishedAt}}",
    "avg_publishedAt": "{{test.avg.publishedAt}}",
    "min_publishedAt": "{{test.min.publishedAt}}",
    "max_publishedAt": "{{test.max.publishedAt}}",

    "tutti_i_titoli": "{{test.pluck.title}}",
    "tutte_le_metaTitle": "{{test.pluck.metaTitle}}",
    "tutte_le_descrizioni": "{{test.pluck.metaDescription}}"
  },

  "firstone": {
    "id": "{{test.firstone.id}}",
    "slug": "{{test.firstone.slug}}",
    "status": "{{test.firstone.status}}",
    "title": "{{test.firstone.title}}",
    "publishedAt": "{{test.firstone.publishedAt}}",
    "coverImage": "{{test.firstone.coverImage}}",
    "tags": "{{test.firstone.tags}}",
    "metaTitle": "{{test.firstone.metaTitle}}",
    "metaDescription": "{{test.firstone.metaDescription}}",
    "body": "{{test.firstone.body}}"
  },

  "lastone": {
    "id": "{{test.lastone.id}}",
    "slug": "{{test.lastone.slug}}",
    "status": "{{test.lastone.status}}",
    "title": "{{test.lastone.title}}",
    "publishedAt": "{{test.lastone.publishedAt}}",
    "coverImage": "{{test.lastone.coverImage}}",
    "tags": "{{test.lastone.tags}}",
    "metaTitle": "{{test.lastone.metaTitle}}",
    "metaDescription": "{{test.lastone.metaDescription}}"
  },

  "nav_con_guardia": {
    "firstone_se_published": "{{test.firstone.(status=published).title}}",
    "lastone_se_published": "{{test.lastone.(status=published).title}}",
    "firstone_se_recente": "{{test.firstone.(publishedAt>1740000000).title}}"
  },

  "array_selector": {
    "count_selezione": "{{test.array[art-0001,art-0002].count}}",
    "titolo_art0001": "{{test.array[art-0001].firstone.title}}",
    "titolo_art0002": "{{test.array[art-0002].firstone.title}}",
    "titolo_art0003": "{{test.array[art-0003].firstone.title}}"
  }
}
```
