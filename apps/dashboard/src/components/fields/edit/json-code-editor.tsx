// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import { basicSetup, EditorView } from "codemirror"
// eslint-disable-next-line react-doctor/prefer-dynamic-import
import { EditorState, Compartment } from "@codemirror/state"
import { json, jsonParseLinter } from "@codemirror/lang-json"
import { linter, lintGutter } from "@codemirror/lint"
import { syntaxHighlighting } from "@codemirror/language"
import { oneDarkHighlightStyle } from "@codemirror/theme-one-dark"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export interface JsonCodeEditorProps {
  readonly id?: string
  readonly value: unknown
  readonly onChange: (value: string) => void
  readonly readOnly?: boolean
  readonly className?: string
}

function formatInitialValue(value: unknown): string {
  if (typeof value === "string") return value
  if (value == null) return ""
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Tema base BeechCMS: layout, tipografia e colori sincronizzati
 * con i CSS tokens globali (OKLCH). Le variabili dinamiche (--accent,
 * --border, --muted, --foreground) si adattano automaticamente a light/dark mode.
 */
const beechBaseTheme = EditorView.theme({
  "&": {
    fontSize: "0.875rem",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    height: "100%",
    minHeight: "160px",
    maxHeight: "420px",
    color: "var(--foreground)",
  },
  ".cm-scroller": {
    overflow: "auto",
    lineHeight: "1.5",
    fontFamily: "inherit",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--border) transparent",
  },
  ".cm-content": {
    padding: "8px 0",
    caretColor: "var(--foreground)",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-gutters": {
    borderRight: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    paddingRight: "6px",
    paddingLeft: "2px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent) 25%, transparent)",
  },
  ".cm-foldGutter": {
    paddingRight: "4px",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--muted)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    borderRadius: "0.2em",
    margin: "0 1px",
    padding: "0 3px",
    cursor: "pointer",
  },
})

/** Tema Dark: abilita il flag dark di CodeMirror e imposta il colore del cursore */
const beechDarkTheme = EditorView.theme({
  ".cm-content": {
    caretColor: "var(--primary, #528bff)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--primary, #528bff)",
  },
}, { dark: true })

export function JsonCodeEditor({
  id,
  value,
  onChange,
  readOnly = false,
  className,
}: JsonCodeEditorProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const viewRef = React.useRef<EditorView | null>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const [themeCompartment] = React.useState(() => new Compartment())
  const [readOnlyCompartment] = React.useState(() => new Compartment())
  const [initialDoc] = React.useState(() => formatInitialValue(value))

  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const isDarkRef = React.useRef(isDark)
  React.useEffect(() => {
    isDarkRef.current = isDark
  }, [isDark])

  const readOnlyRef = React.useRef(readOnly)
  React.useEffect(() => {
    readOnlyRef.current = readOnly
  }, [readOnly])

  // Inizializzazione di CodeMirror
  React.useEffect(() => {
    if (!containerRef.current) return

    const extensions = [
      basicSetup,
      json(),
      lintGutter(),
      linter(jsonParseLinter()),
      EditorView.lineWrapping,
      beechBaseTheme,
      themeCompartment.of(
        isDarkRef.current ? [beechDarkTheme, syntaxHighlighting(oneDarkHighlightStyle)] : []
      ),
      readOnlyCompartment.of([
        EditorView.editable.of(!readOnlyRef.current),
        EditorState.readOnly.of(readOnlyRef.current),
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
        }
      }),
    ]

    const startState = EditorState.create({
      doc: initialDoc,
      extensions,
    })

    const view = new EditorView({
      state: startState,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [themeCompartment, readOnlyCompartment, initialDoc])

  // Sincronizzazione dinamica del tema
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: themeCompartment.reconfigure(
        isDark ? [beechDarkTheme, syntaxHighlighting(oneDarkHighlightStyle)] : []
      ),
    })
  }, [isDark, themeCompartment])

  // Sincronizzazione dinamica di readOnly
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorView.editable.of(!readOnly),
        EditorState.readOnly.of(readOnly),
      ]),
    })
  }, [readOnly, readOnlyCompartment])

  // Sincronizzazione controllata del valore da sorgente esterna
  React.useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const currentDoc = view.state.doc.toString()
    const nextString = typeof value === "string" ? value : formatInitialValue(value)

    if (nextString !== currentDoc) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: nextString,
        },
      })
    }
  }, [value])

  return (
    <div
      id={id}
      data-testid="json-code-editor"
      ref={containerRef}
      className={cn(
        "relative w-full rounded-lg border border-input bg-transparent text-foreground shadow-xs transition-colors",
        "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 focus-within:outline-hidden",
        readOnly && "cursor-not-allowed opacity-75 bg-muted/30",
        className
      )}
    />
  )
}
