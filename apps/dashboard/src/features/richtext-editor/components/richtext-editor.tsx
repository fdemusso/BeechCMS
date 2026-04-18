import * as React from "react"
import { createPortal } from "react-dom"
import { useEditor, EditorContent } from "@tiptap/react"
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus"
import {
  Undo2,
  Redo2,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  TextQuote,
  SquareCode,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Sigma,
  Underline as UnderlineIcon,
  Highlighter,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link2,
  ImagePlus,
  ChevronDown,
  Loader2,
  RotateCcw,
  TriangleAlert,
  Table,
  Braces,
} from "lucide-react"
import { RICHTEXT_SCHEMA_VERSION } from "@beech/core"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { api } from "@/lib/api"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { FieldEditProps } from "@/components/fields/types"
import { t } from "../consts/messages.it"
import { normalizeRichtextValue } from "../utils/normalize-richtext-value"
import { createSlashCommandExtension } from "../extensions/slash-command-extension"
import { createSlashCommandItems, isEmptyParagraphSelection } from "../extensions/slash-command-items"
import {
  buildRichtextEditorExtensions,
  type MathNodeClickPayload,
} from "../extensions/build-editor-extensions"

type MathDialogState =
  | { open: false }
  | {
      open: true
      kind: "edit-inline" | "edit-block"
      latex: string
      editPos: number
    }

interface ToolbarIconButtonProps {
  label: string
  isActive?: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
}

function ToolbarIconButton({
  label,
  isActive = false,
  onClick,
  children,
  disabled = false,
}: Readonly<ToolbarIconButtonProps>) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-muted hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
        isActive && "bg-muted text-foreground"
      )}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 items-center justify-center px-[1px] text-foreground/45"
    >
      <svg
        width="4"
        height="20"
        viewBox="0 0 4 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="block"
      >
        <line x1="2" y1="2" x2="2" y2="18" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </span>
  )
}

function resolveActiveHeading(editor: NonNullable<ReturnType<typeof useEditor>>): "h1" | "h2" | "h3" | "h4" | null {
  if (editor.isActive("heading", { level: 1 })) return "h1"
  if (editor.isActive("heading", { level: 2 })) return "h2"
  if (editor.isActive("heading", { level: 3 })) return "h3"
  if (editor.isActive("heading", { level: 4 })) return "h4"
  return null
}

function createUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

interface PendingUpload {
  id: string
  file: File
  status: "loading" | "error"
  error?: string
}

export function RichtextEdit({ branch, value, onChange }: FieldEditProps) {
  const initial = React.useMemo(() => normalizeRichtextValue(value), [value])
  const [linkUrl, setLinkUrl] = React.useState("")
  const [imageUrl, setImageUrl] = React.useState("")
  const [pendingUploads, setPendingUploads] = React.useState<PendingUpload[]>([])
  const [mathDialog, setMathDialog] = React.useState<MathDialogState>({ open: false })
  const mathLatexInputRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const openFilePicker = React.useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const mathNodeEditRef = React.useRef<(payload: MathNodeClickPayload) => void>(() => {})
  mathNodeEditRef.current = (payload: MathNodeClickPayload) => {
    setMathDialog({
      open: true,
      kind: payload.kind === "inline" ? "edit-inline" : "edit-block",
      latex: payload.latex,
      editPos: payload.pos,
    })
  }

  const mathDialogOpenerRef = React.useRef<(mode: "inline" | "block") => void>(() => {})
  const mathPanelRef = React.useRef<HTMLDivElement>(null)
  const [mathPanelStyle, setMathPanelStyle] = React.useState({ top: 0, left: 0 })

  const slashCommands = React.useMemo(
    () => createSlashCommandItems(openFilePicker, (mode) => mathDialogOpenerRef.current(mode)),
    [openFilePicker]
  )
  const slashExtension = React.useMemo(
    () => createSlashCommandExtension(slashCommands, { slashMenuEmpty: t("slashMenuEmpty") }),
    [slashCommands]
  )

  const editor = useEditor({
    extensions: buildRichtextEditorExtensions({
      placeholder: t("placeholder"),
      slashExtension,
      mathNodeEditRef,
    }),
    content: initial,
    onUpdate: ({ editor }) => {
      onChange({
        schemaVersion: RICHTEXT_SCHEMA_VERSION,
        doc: editor.getJSON(),
      })
    },
  })

  React.useEffect(() => {
    if (!editor) return
    mathDialogOpenerRef.current = (mode: "inline" | "block") => {
      if (mode === "inline") {
        const from = editor.state.selection.from
        editor.chain().focus().insertContentAt(from, { type: "inlineMath", attrs: { latex: "" } }).run()
        const n = editor.state.doc.nodeAt(from)
        if (n?.type.name === "inlineMath") {
          setMathDialog({ open: true, kind: "edit-inline", latex: "", editPos: from })
          return
        }
        const $from = editor.state.selection.$from
        const nb = $from.nodeBefore
        if (nb?.type.name === "inlineMath") {
          const pos = $from.pos - nb.nodeSize
          setMathDialog({ open: true, kind: "edit-inline", latex: "", editPos: pos })
          return
        }
        let found = -1
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === "inlineMath") found = pos
        })
        if (found >= 0) {
          setMathDialog({ open: true, kind: "edit-inline", latex: "", editPos: found })
        }
        return
      }
      editor.chain().focus().insertBlockMath({ latex: " " }).run()
      const $from = editor.state.selection.$from
      for (let d = $from.depth; d > 0; d--) {
        const node = $from.node(d)
        if (node.type.name === "blockMath") {
          const pos = $from.before(d)
          setMathDialog({ open: true, kind: "edit-block", latex: "", editPos: pos })
          return
        }
      }
      let found = -1
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "blockMath") found = pos
      })
      if (found >= 0) {
        setMathDialog({ open: true, kind: "edit-block", latex: "", editPos: found })
      }
    }
  }, [editor])

  const mathLiveLatex = mathDialog.open ? mathDialog.latex : ""
  const mathLiveKind = mathDialog.open ? mathDialog.kind : "edit-inline"
  const mathLiveEditPos = mathDialog.open ? mathDialog.editPos : -1

  React.useEffect(() => {
    if (!editor) return
    if (!mathDialog.open) return
    if (mathLiveKind === "edit-inline") {
      editor.chain().updateInlineMath({ latex: mathLiveLatex, pos: mathLiveEditPos }).run()
    } else {
      const effective = mathLiveLatex.trim() === "" ? " " : mathLiveLatex
      editor.chain().updateBlockMath({ latex: effective, pos: mathLiveEditPos }).run()
    }
  }, [editor, mathDialog.open, mathLiveLatex, mathLiveKind, mathLiveEditPos])

  const mathDialogRef = React.useRef(mathDialog)
  mathDialogRef.current = mathDialog

  const updateMathPanelPosition = React.useCallback(() => {
    if (!editor) return
    const md = mathDialogRef.current
    if (!md.open) return
    const coords = editor.view.coordsAtPos(md.editPos)
    const el = mathPanelRef.current
    const pad = 8
    const panelW = el?.offsetWidth ?? 360
    const panelH = el?.offsetHeight ?? 160
    let top = coords.bottom + pad
    let left = coords.left
    if (top + panelH > window.innerHeight - 8) {
      top = Math.max(8, coords.top - panelH - pad)
    }
    left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8))
    setMathPanelStyle({ top, left })
  }, [editor])

  React.useLayoutEffect(() => {
    if (!editor || !mathDialog.open) return
    updateMathPanelPosition()
    const raf = requestAnimationFrame(updateMathPanelPosition)
    return () => cancelAnimationFrame(raf)
  }, [editor, mathDialog.open, mathLiveEditPos, mathLiveLatex, updateMathPanelPosition])

  React.useEffect(() => {
    if (!editor || !mathDialog.open) return
    const onResizeOrScroll = () => updateMathPanelPosition()
    window.addEventListener("resize", onResizeOrScroll)
    window.addEventListener("scroll", onResizeOrScroll, true)
    editor.view.dom.addEventListener("scroll", onResizeOrScroll)
    return () => {
      window.removeEventListener("resize", onResizeOrScroll)
      window.removeEventListener("scroll", onResizeOrScroll, true)
      editor.view.dom.removeEventListener("scroll", onResizeOrScroll)
    }
  }, [editor, mathDialog.open, updateMathPanelPosition])

  React.useEffect(() => {
    if (!mathDialog.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setMathDialog({ open: false })
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mathDialog.open])

  React.useEffect(() => {
    if (!editor) return
    if (!mathDialog.open) return
    const handle = (e: MouseEvent) => {
      const t = e.target as Node
      if (mathPanelRef.current?.contains(t)) return
      if (editor.view.dom.contains(t)) return
      setMathDialog({ open: false })
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [editor, mathDialog.open])

  React.useEffect(() => {
    if (!editor) return
    if (typeof initial === "string") return

    const current = JSON.stringify(editor.getJSON())
    const next = JSON.stringify(initial)
    if (current === next) return

    editor.commands.setContent(initial, { emitUpdate: false })
  }, [editor, initial])

  const adjustMathTextareaHeight = React.useCallback(() => {
    const el = mathLatexInputRef.current
    if (!el) return
    el.style.height = "0px"
    el.style.height = `${Math.max(el.scrollHeight, 36)}px`
  }, [])

  React.useEffect(() => {
    if (!mathDialog.open) return
    const id = requestAnimationFrame(() => {
      mathLatexInputRef.current?.focus()
      mathLatexInputRef.current?.select()
      requestAnimationFrame(() => adjustMathTextareaHeight())
    })
    return () => cancelAnimationFrame(id)
  }, [mathDialog.open, adjustMathTextareaHeight])

  const mathDialogLatex = mathDialog.open ? mathDialog.latex : ""
  React.useEffect(() => {
    if (!mathDialog.open) return
    const id = requestAnimationFrame(() => adjustMathTextareaHeight())
    return () => cancelAnimationFrame(id)
  }, [mathDialog.open, mathDialogLatex, adjustMathTextareaHeight])

  if (!editor) return null

  const closeMathDialog = () => setMathDialog({ open: false })

  const applyMathDialog = () => {
    if (!mathDialog.open) return
    const trimmed = mathDialog.latex.trim()
    if (!trimmed) {
      if (mathDialog.kind === "edit-inline") {
        editor.chain().focus().deleteInlineMath({ pos: mathDialog.editPos }).run()
      } else {
        editor.chain().focus().deleteBlockMath({ pos: mathDialog.editPos }).run()
      }
      closeMathDialog()
      return
    }
    editor.view.focus()
    closeMathDialog()
  }

  const handleToolbarInlineMath = () => {
    const { from, to, empty } = editor.state.selection
    if (!empty) {
      const latex = editor.state.doc.textBetween(from, to, "\n").trim()
      if (latex) {
        editor.chain().focus().deleteRange({ from, to }).insertInlineMath({ latex }).run()
        return
      }
    }
    mathDialogOpenerRef.current("inline")
  }

  const handleToolbarBlockMath = () => {
    const { from, to, empty } = editor.state.selection
    if (!empty) {
      const latex = editor.state.doc.textBetween(from, to, "\n").trim()
      if (latex) {
        editor.chain().focus().deleteRange({ from, to }).insertBlockMath({ latex }).run()
        return
      }
    }
    mathDialogOpenerRef.current("block")
  }

  const mathDialogTitleLabel = (() => {
    if (!mathDialog.open) return ""
    return mathDialog.kind === "edit-inline"
      ? t("mathDialogEditInlineTitle")
      : t("mathDialogEditBlockTitle")
  })()

  const startImageUpload = async (file: File, existingUploadId?: string) => {
    if (!file.type.startsWith("image/")) {
      const id = existingUploadId ?? createUploadId()
      setPendingUploads((previous) => {
        const alreadyExisting = previous.some((upload) => upload.id === id)
        const nextUpload: PendingUpload = {
          id,
          file,
          status: "error",
          error: t("invalidImageType"),
        }
        return alreadyExisting
          ? previous.map((upload) => (upload.id === id ? nextUpload : upload))
          : [...previous, nextUpload]
      })
      return
    }

    const uploadId = existingUploadId ?? createUploadId()
    setPendingUploads((previous) => {
      const alreadyExisting = previous.some((upload) => upload.id === uploadId)
      const nextUpload: PendingUpload = { id: uploadId, file, status: "loading" }
      return alreadyExisting
        ? previous.map((upload) => (upload.id === uploadId ? nextUpload : upload))
        : [...previous, nextUpload]
    })

    try {
      const formData = new FormData()
      formData.append("file", file)
      const { data } = await api.post<{ url: string }>("/upload", formData)
      editor.chain().focus().setImage({ src: data.url, alt: file.name }).run()
      setPendingUploads((previous) => previous.filter((upload) => upload.id !== uploadId))
    } catch (error) {
      const message = error instanceof Error ? error.message : t("uploadError")
      setPendingUploads((previous) =>
        previous.map((upload) =>
          upload.id === uploadId
            ? {
                ...upload,
                status: "error",
                error: message,
              }
            : upload
        )
      )
    }
  }

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      void startImageUpload(file)
    }
    event.target.value = ""
  }

  const retryUpload = (uploadId: string) => {
    const target = pendingUploads.find((upload) => upload.id === uploadId)
    if (!target) return
    void startImageUpload(target.file, uploadId)
  }

  const removeUploadError = (uploadId: string) => {
    setPendingUploads((previous) => previous.filter((upload) => upload.id !== uploadId))
  }

  const applyLink = () => {
    const candidate = linkUrl.trim()
    if (!candidate) return
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: candidate })
      .run()
  }

  const clearLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
  }

  const applyImage = () => {
    const candidate = imageUrl.trim()
    if (!candidate) return
    editor.chain().focus().setImage({ src: candidate }).run()
  }

  const setHeadingLevel = (level: 1 | 2 | 3 | 4) => {
    editor.chain().focus().toggleHeading({ level }).run()
  }

  const activeHeading = resolveActiveHeading(editor)

  return (
    <>
      {mathDialog.open &&
        createPortal(
          <div
            ref={mathPanelRef}
            role="dialog"
            aria-label={mathDialogTitleLabel}
            className="pointer-events-auto z-[100] w-max max-w-[min(100vw-2rem,28rem)] bg-transparent p-0 shadow-none ring-0"
            style={{ position: "fixed", top: mathPanelStyle.top, left: mathPanelStyle.left }}
          >
            <span className="sr-only">{mathDialogTitleLabel}</span>
            <div className="flex min-h-9 items-stretch overflow-hidden rounded-lg border border-border bg-transparent">
              <div className="flex min-h-0 min-w-0 min-w-[16rem] flex-1 items-center bg-white px-2 py-1.5 dark:bg-card">
                <textarea
                  ref={mathLatexInputRef}
                  className={cn(
                    "box-border min-h-9 w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent px-0 py-1.5 text-sm font-mono leading-6 text-foreground shadow-none",
                    "placeholder:text-muted-foreground",
                    "outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0",
                    "focus-visible:outline-none focus-visible:ring-0"
                  )}
                  rows={1}
                  value={mathDialog.latex}
                  onChange={(event) => {
                    setMathDialog({ ...mathDialog, latex: event.target.value })
                  }}
                  placeholder={t("mathDialogPlaceholder")}
                  spellCheck={false}
                  aria-label={t("mathDialogPlaceholder")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      applyMathDialog()
                    }
                  }}
                />
              </div>
              <div className="flex min-h-0 shrink-0 flex-col items-end justify-center self-stretch bg-white px-1.5 py-1 dark:bg-card">
                <Button
                  type="button"
                  variant="default"
                  className={cn(
                    "h-9 shrink-0 rounded-md border-0 px-3 text-sm font-medium shadow-none transition-colors duration-200 ease-out",
                    "focus-visible:border-transparent",
                    "enabled:bg-black enabled:text-white enabled:hover:bg-neutral-800",
                    "dark:enabled:bg-white dark:enabled:text-black dark:enabled:hover:bg-neutral-100"
                  )}
                  onClick={applyMathDialog}
                >
                  {t("mathDialogDone")}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <div
        className={cn(
          "richtext-editor-root rounded-md border border-input bg-background text-sm ring-offset-background",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        )}
      >
      <div className="sticky top-[var(--header-height)] z-10 flex flex-wrap items-center justify-center gap-2 border-b border-input/80 bg-background/95 px-2 py-1.5 backdrop-blur rounded-t-md">
        <div className="flex items-center gap-1">
          <ToolbarIconButton
            label={t("undo")}
            disabled={!editor.can().chain().focus().undo().run()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("redo")}
            disabled={!editor.can().chain().focus().redo().run()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="size-4" />
          </ToolbarIconButton>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("headingMenu")}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground",
                  activeHeading && "bg-muted text-foreground"
                )}
              >
                {activeHeading === "h1" && <Heading1 className="size-4" />}
                {activeHeading === "h2" && <Heading2 className="size-4" />}
                {activeHeading === "h3" && <Heading3 className="size-4" />}
                {activeHeading === "h4" && <Heading4 className="size-4" />}
                {!activeHeading && <Heading2 className="size-4" />}
                <ChevronDown className="size-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem aria-label="Heading 1" onClick={() => setHeadingLevel(1)}>
              <Heading1 className="size-4" />
              </DropdownMenuItem>
            <DropdownMenuItem aria-label="Heading 2" onClick={() => setHeadingLevel(2)}>
              <Heading2 className="size-4" />
              </DropdownMenuItem>
            <DropdownMenuItem aria-label="Heading 3" onClick={() => setHeadingLevel(3)}>
              <Heading3 className="size-4" />
              </DropdownMenuItem>
            <DropdownMenuItem aria-label="Heading 4" onClick={() => setHeadingLevel(4)}>
              <Heading4 className="size-4" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolbarIconButton
            label={t("list")}
            isActive={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("orderedList")}
            isActive={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("blockquote")}
            isActive={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <TextQuote className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("codeBlock")}
            isActive={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <SquareCode className="size-4" />
          </ToolbarIconButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("slashTable")}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground",
                  editor.isActive("table") && "bg-muted text-foreground"
                )}
              >
                <Table className="size-4" />
                <ChevronDown className="size-3.5 opacity-70" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                onClick={() =>
                  editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
                }
                disabled={!editor.can().insertTable()}
              >
                {t("insertTable")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addColumnBefore().run()}
                disabled={!editor.can().addColumnBefore()}
              >
                {t("addColumnBefore")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addColumnAfter().run()}
                disabled={!editor.can().addColumnAfter()}
              >
                {t("addColumnAfter")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteColumn().run()}
                disabled={!editor.can().deleteColumn()}
              >
                {t("deleteColumn")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addRowBefore().run()}
                disabled={!editor.can().addRowBefore()}
              >
                {t("addRowBefore")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().addRowAfter().run()}
                disabled={!editor.can().addRowAfter()}
              >
                {t("addRowAfter")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteRow().run()}
                disabled={!editor.can().deleteRow()}
              >
                {t("deleteRow")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
                disabled={!editor.can().toggleHeaderRow()}
              >
                {t("toggleHeaderRow")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
                disabled={!editor.can().toggleHeaderColumn()}
              >
                {t("toggleHeaderColumn")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => editor.chain().focus().deleteTable().run()}
                disabled={!editor.can().deleteTable()}
              >
                {t("deleteTable")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-1">
          <ToolbarIconButton
            label={t("bold")}
            isActive={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("italic")}
            isActive={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("strike")}
            isActive={editor.isActive("strike")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("inlineCode")}
            isActive={editor.isActive("code")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("inlineEquation")}
            isActive={editor.isActive("inlineMath")}
            onClick={handleToolbarInlineMath}
          >
            <Sigma className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("blockEquation")}
            isActive={editor.isActive("blockMath")}
            onClick={handleToolbarBlockMath}
          >
            <Braces className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("underline")}
            isActive={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("highlight")}
            isActive={editor.isActive("highlight")}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Highlighter className="size-4" />
          </ToolbarIconButton>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("insertLink")}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors",
                  "hover:bg-muted hover:text-foreground",
                  editor.isActive("link") && "bg-muted text-foreground"
                )}
              >
                <Link2 className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <PopoverHeader>
                <PopoverTitle>Inserisci link</PopoverTitle>
                <PopoverDescription>
                  URL completo (https://...) da applicare alla selezione corrente.
                </PopoverDescription>
                <PopoverDescription className="text-xs">{t("linkOpenMetaHint")}</PopoverDescription>
              </PopoverHeader>
              <div className="mt-3 space-y-2">
                <Input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://example.com"
                />
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={applyLink}>
                    {t("apply")}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={clearLink}>
                    {t("remove")}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-1">
          <ToolbarIconButton
            label={t("superscript")}
            isActive={editor.isActive("superscript")}
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
          >
            <SuperscriptIcon className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("subscript")}
            isActive={editor.isActive("subscript")}
            onClick={() => editor.chain().focus().toggleSubscript().run()}
          >
            <SubscriptIcon className="size-4" />
          </ToolbarIconButton>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-1">
          <ToolbarIconButton
            label={t("alignLeft")}
            isActive={editor.isActive({ textAlign: "left" })}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("alignCenter")}
            isActive={editor.isActive({ textAlign: "center" })}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("alignRight")}
            isActive={editor.isActive({ textAlign: "right" })}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight className="size-4" />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t("justify")}
            isActive={editor.isActive({ textAlign: "justify" })}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          >
            <AlignJustify className="size-4" />
          </ToolbarIconButton>
        </div>

        <ToolbarDivider />

        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t("addImage")}
                className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ImagePlus className="size-4" />
                <span className="text-xs font-medium">Add</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <PopoverHeader>
                <PopoverTitle>{t("addImageWithUrl")}</PopoverTitle>
                <PopoverDescription>
                  {t("imageUrlHint")}
                </PopoverDescription>
              </PopoverHeader>
              <div className="mt-3 space-y-2">
                <Input
                  value={imageUrl}
                  onChange={(event) => setImageUrl(event.target.value)}
                  placeholder={t("imageInputPlaceholder")}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={applyImage}
                  className="w-full"
                >
                  {t("addImage")}
                </Button>
                <Button type="button" size="sm" variant="outline" className="w-full" onClick={openFilePicker}>
                  {t("addImageFromFile")}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {pendingUploads.length > 0 ? (
        <div className="border-b border-input/80 bg-muted/30 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("uploadSection")}
          </p>
          <div className="mt-2 space-y-2">
            {pendingUploads.map((upload) => (
              <div
                key={upload.id}
                className="flex items-center justify-between gap-2 rounded-md border border-input bg-background px-2 py-1.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{upload.file.name}</p>
                  {upload.status === "loading" ? (
                    <p className="text-xs text-muted-foreground">{t("uploading")}</p>
                  ) : (
                    <p className="text-xs text-destructive">
                      {upload.error ?? t("uploadFailed")}
                    </p>
                  )}
                </div>
                {upload.status === "loading" ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => retryUpload(upload.id)}
                      aria-label={t("uploadRetry")}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => removeUploadError(upload.id)}
                      aria-label={t("uploadDismiss")}
                    >
                      <TriangleAlert className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <BubbleMenu editor={editor}>
        <div className="flex items-center gap-1 rounded-md border border-input bg-background p-1 shadow-sm">
          <Button
            type="button"
            size="icon-xs"
            variant={editor.isActive("bold") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleBold().run()}
            aria-label={t("quickBold")}
          >
            <Bold className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant={editor.isActive("italic") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            aria-label={t("quickItalic")}
          >
            <Italic className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant={editor.isActive("code") ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleCode().run()}
            aria-label={t("quickCode")}
          >
            <Code className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant={editor.isActive("heading", { level: 2 }) ? "secondary" : "ghost"}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            aria-label={t("quickHeading2")}
          >
            <Heading2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant={editor.isActive("link") ? "secondary" : "ghost"}
            onClick={clearLink}
            aria-label={t("quickLinkRemoval")}
          >
            <Link2 className="size-3.5" />
          </Button>
        </div>
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        shouldShow={({ editor }) => isEmptyParagraphSelection(editor)}
      >
        <div className="flex items-center gap-1 rounded-md border border-input bg-background p-1 shadow-sm">
          <span className="px-1 text-[11px] font-medium text-muted-foreground">
            {t("quickInsert")}
          </span>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("slashHeading2")}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("slashBulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("slashQuote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <TextQuote className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("slashCodeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <SquareCode className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("floatingMenuInlineMath")}
            onClick={handleToolbarInlineMath}
          >
            <Sigma className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("floatingMenuBlockMath")}
            onClick={handleToolbarBlockMath}
          >
            <Braces className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label={t("slashImage")}
            onClick={openFilePicker}
          >
            <ImagePlus className="size-3.5" />
          </Button>
        </div>
      </FloatingMenu>

      <EditorContent
        id={branch.alias}
        editor={editor}
        className="px-3 py-2"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
    </>
  )
}
