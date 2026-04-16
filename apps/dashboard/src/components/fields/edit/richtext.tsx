import * as React from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import type { Editor } from "@tiptap/react"
import { Extension, type JSONContent, type Range } from "@tiptap/core"
import { PluginKey } from "@tiptap/pm/state"
import Suggestion from "@tiptap/suggestion"
import type { SuggestionKeyDownProps } from "@tiptap/suggestion"
import Placeholder from "@tiptap/extension-placeholder"
import Highlight from "@tiptap/extension-highlight"
import TextAlign from "@tiptap/extension-text-align"
import Superscript from "@tiptap/extension-superscript"
import Subscript from "@tiptap/extension-subscript"
import Image from "@tiptap/extension-image"
import Link from "@tiptap/extension-link"
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
} from "lucide-react"
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
import type { FieldEditProps } from "../types"

const SLASH_MENU_PLUGIN_KEY = new PluginKey("beech-richtext-slash-menu")

const editorMessages = {
  placeholder: "Scrivi qualcosa o digita / per i comandi...",
  undo: "Indietro",
  redo: "Avanti",
  headingMenu: "Heading menu",
  list: "List",
  orderedList: "List ordered",
  blockquote: "Blockquote",
  codeBlock: "Block code",
  bold: "Grassetto",
  italic: "Corsivo",
  strike: "Barrato",
  inlineCode: "Codice",
  inlineEquation: "Equazione inline",
  underline: "Sottolineato",
  highlight: "Highlight",
  insertLink: "Inserisci link",
  apply: "Applica",
  remove: "Rimuovi",
  superscript: "Superscript",
  subscript: "Subscript",
  alignLeft: "Allinea a sinistra",
  alignCenter: "Allinea al centro",
  alignRight: "Allinea a destra",
  justify: "Giustifica",
  addImage: "Aggiungi immagine",
  addImageWithUrl: "Add image con URL",
  imageUrlHint: "Inserisci URL immagine pubblico (https://...).",
  addImageFromFile: "Carica file",
  imageInputPlaceholder: "https://example.com/image.jpg",
  quickBold: "Grassetto rapido",
  quickItalic: "Corsivo rapido",
  quickCode: "Codice rapido",
  quickHeading2: "Titolo 2 rapido",
  quickLinkRemoval: "Rimuovi link rapido",
  floatingMenuLabel: "Menu contestuale su riga vuota",
  quickInsert: "Quick insert",
  slashMenuEmpty: "Nessun comando disponibile",
  uploadSection: "Upload immagini in corso",
  uploading: "Caricamento in corso...",
  uploadRetry: "Riprova",
  uploadDismiss: "Rimuovi errore",
  uploadFailed: "Upload fallito",
  invalidImageType: "Seleziona un file immagine valido",
  uploadError: "Errore durante il caricamento dell'immagine",
  slashParagraph: "Testo",
  slashParagraphDescription: "Converti in paragrafo semplice",
  slashHeading1: "Titolo 1",
  slashHeading1Description: "Heading principale",
  slashHeading2: "Titolo 2",
  slashHeading2Description: "Heading secondario",
  slashHeading3: "Titolo 3",
  slashHeading3Description: "Heading terziario",
  slashBulletList: "Lista puntata",
  slashBulletListDescription: "Inizia una lista puntata",
  slashOrderedList: "Lista numerata",
  slashOrderedListDescription: "Inizia una lista numerata",
  slashQuote: "Citazione",
  slashQuoteDescription: "Inserisci un blocco quote",
  slashCodeBlock: "Blocco codice",
  slashCodeBlockDescription: "Inserisci un blocco di codice",
  slashImage: "Immagine",
  slashImageDescription: "Carica un'immagine via Media Engine",
} as const

type EditorMessageKey = keyof typeof editorMessages

function t(key: EditorMessageKey): string {
  return editorMessages[key]
}

function createEmptyDoc(): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph" }],
  }
}

function normalizeRichtextValue(value: unknown): JSONContent | string {
  if (value && typeof value === "object") {
    return value as JSONContent
  }
  if (typeof value === "string" && value.trim().length > 0) {
    // Legacy compatibility: existing entries may still contain HTML strings.
    return value
  }
  return createEmptyDoc()
}

function createUploadId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isEmptyParagraphSelection(editor: Editor): boolean {
  const { selection } = editor.state
  if (!selection.empty) return false
  const parent = selection.$from.parent
  if (parent.type.name !== "paragraph") return false
  return parent.textContent.trim().length === 0
}

function createSlashMenuPopup(labels: { slashMenuEmpty: string }) {
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
    root.style.left = `${rect.left + window.scrollX}px`
    root.style.top = `${rect.bottom + window.scrollY + 8}px`
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

interface SlashCommandItem {
  id: string
  title: string
  description: string
  keywords: string[]
  execute: (params: { editor: Editor; range: Range }) => void
}

function createSlashCommandExtension(
  items: SlashCommandItem[],
  labels: { slashMenuEmpty: string }
) {
  return Extension.create({
    name: "slashCommands",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommandItem>({
          pluginKey: SLASH_MENU_PLUGIN_KEY,
          editor: this.editor,
          char: "/",
          startOfLine: false,
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from)
            const parent = $from.parent
            if (parent.type.name !== "paragraph") return false
            return /^\/[^ ]*$/.test(parent.textContent)
          },
          items: ({ query }) => {
            const normalized = query.trim().toLowerCase()
            if (!normalized) return items
            return items.filter((item) => {
              const haystack = [item.title, item.description, ...item.keywords]
                .join(" ")
                .toLowerCase()
              return haystack.includes(normalized)
            })
          },
          command: ({ editor, range, props }) => {
            props.execute({ editor, range })
          },
          render: () => createSlashMenuPopup(labels),
        }),
      ]
    },
  })
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
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const openFilePicker = React.useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const slashCommands = React.useMemo<SlashCommandItem[]>(
    () => [
      {
        id: "paragraph",
        title: t("slashParagraph"),
        description: t("slashParagraphDescription"),
        keywords: ["testo", "paragraph", "p"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).setParagraph().run()
        },
      },
      {
        id: "heading-1",
        title: t("slashHeading1"),
        description: t("slashHeading1Description"),
        keywords: ["heading", "h1", "titolo"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
        },
      },
      {
        id: "heading-2",
        title: t("slashHeading2"),
        description: t("slashHeading2Description"),
        keywords: ["heading", "h2", "titolo"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
        },
      },
      {
        id: "heading-3",
        title: t("slashHeading3"),
        description: t("slashHeading3Description"),
        keywords: ["heading", "h3", "titolo"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run()
        },
      },
      {
        id: "bullet-list",
        title: t("slashBulletList"),
        description: t("slashBulletListDescription"),
        keywords: ["list", "lista", "bullet"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleBulletList().run()
        },
      },
      {
        id: "ordered-list",
        title: t("slashOrderedList"),
        description: t("slashOrderedListDescription"),
        keywords: ["list", "lista", "ordered"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleOrderedList().run()
        },
      },
      {
        id: "blockquote",
        title: t("slashQuote"),
        description: t("slashQuoteDescription"),
        keywords: ["quote", "citazione"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleBlockquote().run()
        },
      },
      {
        id: "code-block",
        title: t("slashCodeBlock"),
        description: t("slashCodeBlockDescription"),
        keywords: ["code", "snippet"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
        },
      },
      {
        id: "image",
        title: t("slashImage"),
        description: t("slashImageDescription"),
        keywords: ["image", "media", "upload"],
        execute: ({ editor, range }) => {
          editor.chain().focus().deleteRange(range).run()
          openFilePicker()
        },
      },
    ],
    [openFilePicker]
  )
  const slashExtension = React.useMemo(
    () => createSlashCommandExtension(slashCommands, { slashMenuEmpty: t("slashMenuEmpty") }),
    [slashCommands]
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Placeholder.configure({
        placeholder: t("placeholder"),
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      Highlight,
      Superscript,
      Subscript,
      Image.configure({
        allowBase64: false,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      slashExtension,
    ],
    content: initial,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON())
    },
  })

  React.useEffect(() => {
    if (!editor) return
    if (typeof initial === "string") return

    const current = JSON.stringify(editor.getJSON())
    const next = JSON.stringify(initial)
    if (current === next) return

    editor.commands.setContent(initial, { emitUpdate: false })
  }, [editor, initial])

  if (!editor) return null

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

  const insertInlineEquation = () => {
    editor.chain().focus().insertContent("$x^2$").run()
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background text-sm ring-offset-background",
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
            onClick={insertInlineEquation}
          >
            <Sigma className="size-4" />
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
  )
}
