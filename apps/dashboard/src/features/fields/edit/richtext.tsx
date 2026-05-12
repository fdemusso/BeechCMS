import { RichtextEditor } from "@/features/richtext-editor"
import type { FieldEditProps } from "../types"

/**
 * Field Renderer: RichText.
 * Thin wrapper that delegates logic to the @/features/richtext-editor slice.
 */
export function RichtextEdit({ branch, value, onChange }: FieldEditProps) {
  return (
    <RichtextEditor
      value={value}
      onChange={(val) => onChange(val)}
      placeholder={`Scrivi ${branch.label.toLowerCase()}...`}
    />
  )
}
