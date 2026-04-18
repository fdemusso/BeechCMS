import katex from "katex"
import type { Node as ProsemirrorNode } from "@tiptap/pm/model"
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics"

/**
 * Estende i node view KaTeX così, in caso di errore LaTeX, il messaggio viene
 * mostrato nel documento TipTap (non nel pannello di modifica).
 */
function appendKatexErrorMessage(target: HTMLElement, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  const span = document.createElement("span")
  span.className = "tiptap-math-katex-error"
  span.textContent = message
  target.appendChild(span)
}

export const InlineMathWithDomError = InlineMath.extend({
  addNodeView() {
    return ({ node: initialNode, getPos }) => {
      let node: ProsemirrorNode = initialNode
      const { katexOptions } = this.options

      const wrapper = document.createElement("span")
      wrapper.className = "tiptap-mathematics-render"
      if (this.editor.isEditable) {
        wrapper.classList.add("tiptap-mathematics-render--editable")
      }
      wrapper.dataset.type = "inline-math"
      wrapper.setAttribute("data-latex", String(node.attrs.latex ?? ""))

      const renderMath = () => {
        const latex = String(node.attrs.latex ?? "")
        try {
          wrapper.replaceChildren()
          katex.render(latex, wrapper, {
            ...katexOptions,
            throwOnError: true,
            displayMode: false,
          })
          wrapper.classList.remove("inline-math-error")
        } catch (e) {
          wrapper.replaceChildren()
          appendKatexErrorMessage(wrapper, e)
          wrapper.classList.add("inline-math-error")
        }
      }

      const handleClick = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (pos == null) return
        this.options.onClick?.(node, pos)
      }
      if (this.options.onClick) {
        wrapper.addEventListener("click", handleClick)
      }

      renderMath()

      return {
        dom: wrapper,
        update: (updated: ProsemirrorNode) => {
          if (updated.type.name !== "inlineMath") return false
          node = updated
          wrapper.setAttribute("data-latex", String(node.attrs.latex ?? ""))
          renderMath()
          return true
        },
        destroy() {
          wrapper.removeEventListener("click", handleClick)
        },
      }
    }
  },
})

export const BlockMathWithDomError = BlockMath.extend({
  addNodeView() {
    return ({ node: initialNode, getPos }) => {
      let node: ProsemirrorNode = initialNode
      const { katexOptions } = this.options

      const wrapper = document.createElement("div")
      const innerWrapper = document.createElement("div")
      wrapper.className = "tiptap-mathematics-render"
      if (this.editor.isEditable) {
        wrapper.classList.add("tiptap-mathematics-render--editable")
      }
      innerWrapper.className = "block-math-inner"
      wrapper.dataset.type = "block-math"
      wrapper.setAttribute("data-latex", String(node.attrs.latex ?? ""))
      wrapper.appendChild(innerWrapper)

      const renderMath = () => {
        const latex = String(node.attrs.latex ?? "")
        try {
          innerWrapper.replaceChildren()
          katex.render(latex, innerWrapper, {
            ...katexOptions,
            throwOnError: true,
            displayMode: true,
          })
          wrapper.classList.remove("block-math-error")
        } catch (e) {
          innerWrapper.replaceChildren()
          appendKatexErrorMessage(innerWrapper, e)
          wrapper.classList.add("block-math-error")
        }
      }

      const handleClick = (event: MouseEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const pos = getPos()
        if (pos == null) return
        this.options.onClick?.(node, pos)
      }
      if (this.options.onClick) {
        wrapper.addEventListener("click", handleClick)
      }

      renderMath()

      return {
        dom: wrapper,
        update: (updated: ProsemirrorNode) => {
          if (updated.type.name !== "blockMath") return false
          node = updated
          wrapper.setAttribute("data-latex", String(node.attrs.latex ?? ""))
          renderMath()
          return true
        },
        destroy() {
          wrapper.removeEventListener("click", handleClick)
        },
      }
    }
  },
})
