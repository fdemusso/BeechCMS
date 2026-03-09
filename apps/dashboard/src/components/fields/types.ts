import type { Branch } from "@beech/core"

/** Props condivise per i componenti di sola lettura (display) */
export interface FieldDisplayProps {
  branch: Branch
  value: unknown
  /** Opzioni di visualizzazione (es. troncamento in tabella) */
  options?: {
    maxLength?: number
  }
}

/** Props condivise per i componenti di edit */
export interface FieldEditProps {
  branch: Branch
  value: unknown
  onChange: (value: unknown) => void
}
