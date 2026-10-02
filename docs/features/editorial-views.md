---
title: "Editorial Views: Kanban, Gallery & Bulk Actions"
description: Multi-perspective content management, drag-and-drop Kanban pipelines, visual galleries, and bulk batch operations.
---

# Editorial Views: Kanban, Gallery & Bulk Actions

BeechCMS empowers editors with multiple visual perspectives tailored to different content types. Rather than forcing every collection into a rigid spreadsheet grid, editors can switch seamlessly between **Data Table**, **Kanban Board**, and **Media Gallery** views, alongside performing **Bulk Batch Operations**.

---

## 1. Kanban Pipeline View

For content with editorial workflows (e.g. `draft`, `review`, `scheduled`, `published`), the Kanban view transforms records into visual cards organized into status columns.

<p align="center">
  <img src="/images/editorial-views-pipeline.svg" alt="BeechCMS Multi-Perspective Editorial Experience" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

### Features

- **Drag-and-Drop Mutations**: Dragging a card across columns immediately triggers a targeted update mutation on the underlying status field.
- **Configurable Grouping Branch**: Any enum or select branch (e.g. `status`, `stage`, `category`) can be chosen as the Kanban column determinant.
- **Card Badges & Preview Fields**: Cards display display titles, author avatars, relation chips, and thumbnail previews automatically.
- **Quick Actions**: Edit, duplicate, or inspect incoming backrefs without leaving the board.

---

## 2. Visual Gallery View

Collections rich in imagery (such as Portfolio Projects, Products, Team Members, or Media Assets) benefit from the **Gallery View**:

- **Adaptive Responsive Cards**: Displays media previews at optimal aspect ratios.
- **Peek Inspector**: Hover over cards to preview title, creation dates, and metadata chips.
- **Intelligent Thumbnail Resolution**: Automatically identifies the primary image field in the Seed (or falls back to rich text embedded images).

### Category Folders

If the Seed has a `text` branch whose alias contains `categor` (for example `categoria` or `category`), the Gallery groups entries into **folders**, one per distinct value:

- **Folders screen**: each folder shows preview thumbnails and the number of entries. Values are compared ignoring case and surrounding spaces, so `Wedding` and `wedding ` land in the same folder. Folders are sorted alphabetically; entries without a category go into a last folder named "Altre foto".
- **Inside a folder**: the cards of that category, a "Torna alle cartelle" button, and an "Aggiungi foto qui" button that opens the create form with the category already filled in.
- **New folder**: the "Nuova cartella" button asks for a name and opens the create form with that category prefilled. A folder only exists once an entry with that category is saved; typing the name of an existing folder opens it instead of creating a duplicate.
- **URL state**: the open folder is stored in the `?album=` query parameter, so the browser back button returns to the folders and the folder survives a reload or closing the create/edit dialog.

Seeds without such a branch keep the flat card grid.

---

## 3. Data Table & Filter Toolbar

The primary data grid offers fast, dense data manipulation:

- **Full-Text Filter**: Instant client-side and server-side filtering across text fields.
- **Dynamic Sorting**: Multi-column sorting ascending and descending.
- **Column Visibility**: Toggle visible branches to focus on relevant attributes.
- **Pagination & Page Size**: Configurable page boundaries (10, 25, 50, 100 items per page).

---

## 4. Bulk Operations

Managing large catalogs requires batch processing. BeechCMS provides a multi-selection **Bulk Actions Bar**:

```
[✓] 14 items selected   |   [ Publish (14) ]   [ Edit Fields ]   [ Delete (14) ]
```

### Multi-Step Bulk Edit Wizard

1. **Select Records**: Check items in the data table or use "Select All on Page" / "Select Entire Collection".
2. **Choose Target Fields**: Select which branches to modify across all selected records (e.g. update `category` to "Archive" or change `publishedAt` date).
3. **Review & Confirm**: The wizard displays a diff preview summarizing the changes before executing the batch.
4. **Safe Cascade Delete**: Bulk deletions verify referential backrefs across all selected items, displaying warnings if any item is referenced by external records.
