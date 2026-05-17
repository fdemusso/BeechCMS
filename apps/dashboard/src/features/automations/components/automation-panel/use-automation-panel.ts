import { useState } from 'react'
import type { Automation } from '@beechcms/core'

export function useAutomationPanel() {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState<Automation | undefined>(undefined)

  function openNew() {
    setEditingAutomation(undefined)
    setEditorOpen(true)
  }

  function openEdit(automation: Automation) {
    setEditingAutomation(automation)
    setEditorOpen(true)
  }

  function closeEditor() {
    setEditorOpen(false)
    setEditingAutomation(undefined)
  }

  return { editorOpen, editingAutomation, openNew, openEdit, closeEditor }
}
