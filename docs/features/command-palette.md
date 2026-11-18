---
title: Command Palette (Cmd+K)
description: Keyboard-first spotlight navigation, global collection search, and quick actions in the BeechCMS dashboard.
---

# Command Palette (Cmd+K)

The **Command Palette** is a global, keyboard-driven navigation spotlight built directly into the BeechCMS dashboard. Inspired by modern developer tools, it enables instant jumping between collections, deep record searching, and rapid execution of common actions without ever taking your hands off the keyboard.

<p align="center">
  <img src="/images/command-palette-workflow.svg" alt="BeechCMS Command Palette (Cmd+K) Spotlight Workflow" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Key Capabilities

- **Global Hotkey (`Cmd+K` / `Ctrl+K`)**: Opens from anywhere within the dashboard instantly.
- **Recent**: opening the palette lists, under *Recent*, the last five screens, seeds, settings and commands you used on this browser (separate per user, never sent to the server). A row you can no longer use is shown disabled, and one that no longer exists is left out. Typing hides the section.
- **Fuzzy Collection Filtering**: Start typing any Seed name to immediately filter the navigation list.
- **Deep Record Search**: Drill down into specific Seeds to search records by title or primary identifier.
- **Hierarchical Breadcrumbs**: Navigate into sub-views (e.g. `Root > Articles > Search`) with breadcrumb chips and press `Backspace` or `Escape` to pop back up.
- **Settings**: A *Settings…* page lists every settings tab you may open, grouped as in the settings sidebar. Typing a name ("roles", "storage", "password", "invites") finds the tab, or the exact section inside it, straight from the root page.
- **Quick notes (`#`)**: type `#` and a note to save it on this browser only (separate per user, up to 50 notes of 280 characters). `#` alone lists your notes: Enter copies one, ⌘/Ctrl+Enter deletes it (with Undo). A colour such as `#f00` is still converted. Write `# f00` to save it as a note.
- **Page actions**: while an entry is open, the palette lists its actions first, under the entry's title: save (or save draft), publish draft, discard draft, delete, copy ID. They run exactly like the editor's buttons. Publishing asks for confirmation; delete keeps its Undo toast. Actions you lack the permission for are shown disabled with the missing permission.
- **Content types** (for people who may manage them): *New content type…* and *Edit content type…* open the Studio builder on the right dialog, also while typing a content type's name.
- **System commands (`>`)**: type `>` to list your preferences and system commands: switch the dashboard language, turn each notification on or off, change theme, open the keyboard shortcuts. People who may read infrastructure stats also see the system status (storage and database quota use); Enter copies it. Typing a settings tab name after `>` opens that tab.
- **Keyboard shortcuts**: a normal row (also idle) that lists the global keys, the palette keys and the four prefixes.

---

## Keyboard Shortcuts

| Keybinding | Action |
| :--- | :--- |
| <kbd>⌘</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd> | Toggle Command Palette open/closed |
| <kbd>Alt</kbd> + <kbd>N</kbd> | Open the palette on *Create content* |
| <kbd>⌘</kbd> + <kbd>B</kbd> / <kbd>Ctrl</kbd> + <kbd>B</kbd> | Show or hide the sidebar |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate between listed items |
| <kbd>Enter</kbd> | Execute selected action or navigate to destination |
| <kbd>⌘</kbd> / <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Run the selected row's first secondary action (for example Copy ID on a search result) |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | Open the actions of the selected row |
| <kbd>Escape</kbd> | Close palette or return to parent view |
| <kbd>Backspace</kbd> (when input is empty) | Return to previous command level |
| <kbd>&gt;</kbd> | Prefix: system commands and preferences |
| <kbd>=</kbd> | Prefix: calculator |
| <kbd>#</kbd> | Prefix: quick notes |
| <kbd>/</kbd> | Prefix: search content only |

---

## Extensibility

The Command Palette integrates directly with the Botanical Seed Registry (`SEED_REGISTRY`). When new Seeds are defined in code or added dynamically through the Schema Builder, they are registered immediately into the Command Palette without requiring manual configuration.
