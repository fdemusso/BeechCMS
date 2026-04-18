import type { SuggestionKeyDownProps } from "@tiptap/suggestion"
import { cn } from "@/lib/utils"
import type { SlashCommandItem } from "../extensions/slash-command-extension"

/**
 * Menu slash in portale `fixed` (viewport) così `left`/`top` sono effettivi anche senza `position` nel flusso.
 */
export function createSlashMenuPopup(labels: { slashMenuEmpty: string }) {
  let root: HTMLDivElement | null = null
  let list: HTMLDivElement | null = null
  let selectedIndex = 0
  let currentProps:
    | {
        items: SlashCommandItem[]
        command: (item: SlashCommandItem) => void
        clientRect?: (() => DOMRect | null) | null
      }
    | null = null

  const destroy = () => {
    root?.remove()
    root = null
    list = null
    currentProps = null
    selectedIndex = 0
  }

  const updatePosition = () => {
    if (!root || !currentProps?.clientRect) return
    const rect = currentProps.clientRect()
    if (!rect) return
    root.style.position = "fixed"
    root.style.left = `${rect.left}px`
    root.style.top = `${rect.bottom + 8}px`
  }

  const executeSelection = (index: number) => {
    if (!currentProps) return
    const item = currentProps.items[index]
    if (!item) return
    currentProps.command(item)
  }

  const renderList = () => {
    if (!list || !currentProps) return
    const listElement = list

    listElement.innerHTML = ""
    if (currentProps.items.length === 0) {
      const emptyState = document.createElement("p")
      emptyState.className = "px-3 py-2 text-sm text-muted-foreground"
      emptyState.textContent = labels.slashMenuEmpty
      listElement.appendChild(emptyState)
      return
    }

    currentProps.items.forEach((item, index) => {
      const button = document.createElement("button")
      button.type = "button"
      button.className = cn(
        "w-full rounded-md px-2 py-1.5 text-left",
        "transition-colors hover:bg-muted",
        index === selectedIndex && "bg-muted"
      )
      button.setAttribute("role", "option")
      button.setAttribute("aria-selected", index === selectedIndex ? "true" : "false")
      button.addEventListener("mousedown", (event) => {
        event.preventDefault()
        executeSelection(index)
      })

      const title = document.createElement("p")
      title.className = "text-sm font-medium text-foreground"
      title.textContent = item.title
      button.appendChild(title)

      const description = document.createElement("p")
      description.className = "text-xs text-muted-foreground"
      description.textContent = item.description
      button.appendChild(description)

      listElement.appendChild(button)
    })
  }

  return {
    onStart: (props: {
      items: SlashCommandItem[]
      command: (item: SlashCommandItem) => void
      clientRect?: (() => DOMRect | null) | null
    }) => {
      destroy()
      selectedIndex = 0
      currentProps = props

      root = document.createElement("div")
      root.className = cn(
        "z-[60] w-72 rounded-md border border-input bg-background p-1 shadow-lg",
        "max-h-80 overflow-y-auto"
      )
      root.setAttribute("role", "listbox")
      root.setAttribute("aria-label", "Slash commands")

      list = document.createElement("div")
      root.appendChild(list)
      document.body.appendChild(root)

      renderList()
      updatePosition()
    },
    onUpdate: (props: {
      items: SlashCommandItem[]
      command: (item: SlashCommandItem) => void
      clientRect?: (() => DOMRect | null) | null
    }) => {
      currentProps = props
      if (selectedIndex > props.items.length - 1) {
        selectedIndex = 0
      }
      renderList()
      updatePosition()
    },
    onKeyDown: ({ event }: SuggestionKeyDownProps) => {
      if (!currentProps) return false

      if (event.key === "Escape") {
        destroy()
        return true
      }

      if (currentProps.items.length === 0) {
        return false
      }

      if (event.key === "ArrowDown") {
        event.preventDefault()
        selectedIndex = (selectedIndex + 1) % currentProps.items.length
        renderList()
        return true
      }

      if (event.key === "ArrowUp") {
        event.preventDefault()
        selectedIndex = (selectedIndex - 1 + currentProps.items.length) % currentProps.items.length
        renderList()
        return true
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        executeSelection(selectedIndex)
        return true
      }

      return false
    },
    onExit: destroy,
  }
}
