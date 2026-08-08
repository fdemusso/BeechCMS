import { useNavigate } from "react-router-dom"
import { QuickActions } from "../../components/quick-actions"

export function QuickActionsAdapter() {
  const navigate = useNavigate()
  return (
    <QuickActions
      onAction={(action) => {
        if (action === "new-entry") navigate("/content/create-new")
        else if (action === "settings") navigate("/settings")
      }}
    />
  )
}
