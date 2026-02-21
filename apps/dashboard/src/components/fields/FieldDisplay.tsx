import { getDisplayComponent } from "./registry"
import type { FieldDisplayProps } from "./types"

/**
 * Entry point di sola lettura per i campi.
 * Effettua il lookup nel registro in base a branch.type e renderizza
 * il sottomodulo corrispondente, oppure il componente default se il tipo non è registrato.
 */
export function FieldDisplay(props: FieldDisplayProps) {
  const { branch } = props
  const Component = getDisplayComponent(branch.type)
  return <Component {...props} />
}
