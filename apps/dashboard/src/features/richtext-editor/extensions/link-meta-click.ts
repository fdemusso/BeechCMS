import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"

/**
 * Con editor modificabile e `Link.openOnClick: false`, apre l'URL in nuova scheda
 * solo con Cmd+click (macOS) o Ctrl+click (Windows/Linux).
 */
export const LinkMetaClick = Extension.create({
  name: "linkMetaClick",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("beechLinkMetaClick"),
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              if (event.button !== 0) return false
              if (!(event.metaKey || event.ctrlKey)) return false
              const target = event.target as HTMLElement | null
              if (!target) return false
              const link = target.closest<HTMLAnchorElement>("a[href]")
              if (!link || !view.dom.contains(link)) return false
              const href = link.getAttribute("href")
              if (!href || href.startsWith("javascript:")) return false
              event.preventDefault()
              event.stopPropagation()
              window.open(link.href, "_blank", "noopener,noreferrer")
              return true
            },
          },
        },
      }),
    ]
  },
})
