import { getEditComponent } from "./registry"
import type { FieldEditProps } from "./types"

/**
 * Entry point per l'edit dei campi.
 * Effettua il lookup nel registro in base a branch.type e renderizza
 * il sottomodulo corrispondente, oppure il componente default se il tipo non è registrato.
 */
export function FieldEdit(props: FieldEditProps) {
  const { branch } = props
  const Component = getEditComponent(branch.type)
  return <Component {...props} />
}
