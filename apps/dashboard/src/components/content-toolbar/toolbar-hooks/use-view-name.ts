import { useState, useCallback, useEffect } from "react"
import type { UserViewInstance } from "../shared"

interface UseViewNameProps {
  activeView?: UserViewInstance
  onRenameView?: (viewId: string, label: string) => void
}

export function useViewName({ activeView, onRenameView }: UseViewNameProps) {
  const [viewNameDraft, setViewNameDraft] = useState(activeView?.label ?? "")

  useEffect(() => {
    setViewNameDraft(activeView?.label ?? "")
  }, [activeView?.id, activeView?.label])

  const commitViewName = useCallback(() => {
    if (!activeView || !onRenameView) return
    const trimmed = viewNameDraft.trim()
    if (!trimmed || trimmed === activeView.label) return
    onRenameView(activeView.id, trimmed)
  }, [activeView, onRenameView, viewNameDraft])

  return {
    viewNameDraft,
    setViewNameDraft,
    commitViewName,
  }
}
