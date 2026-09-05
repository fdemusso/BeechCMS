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
- **Fuzzy Collection Filtering**: Start typing any Seed name to immediately filter the navigation list.
- **Deep Record Search**: Drill down into specific Seeds to search records by title or primary identifier.
- **Hierarchical Breadcrumbs**: Navigate into sub-views (e.g. `Root > Articles > Search`) with breadcrumb chips and press `Backspace` or `Escape` to pop back up.
- **Quick Administration**: Jump to Settings, View System Analytics, Manage Automations, or Toggle Interface Themes.

---

## Keyboard Shortcuts

| Keybinding | Action |
| :--- | :--- |
| <kbd>⌘</kbd> + <kbd>K</kbd> / <kbd>Ctrl</kbd> + <kbd>K</kbd> | Toggle Command Palette open/closed |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate between listed items |
| <kbd>Enter</kbd> | Execute selected action or navigate to destination |
| <kbd>Escape</kbd> | Close palette or return to parent view |
| <kbd>Backspace</kbd> (when input is empty) | Return to previous command level |

---

## Extensibility

The Command Palette integrates directly with the Botanical Seed Registry (`SEED_REGISTRY`). When new Seeds are defined in code or added dynamically through the Schema Builder, they are registered immediately into the Command Palette without requiring manual configuration.
