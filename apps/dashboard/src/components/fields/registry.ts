import type { ComponentType } from "react"
import type { BranchType } from "@beechcms/core"
import type { FieldDisplayProps, FieldEditProps } from "./types"

import { DefaultDisplay, DefaultEdit } from "./default"
import { TextDisplay } from "./display/text"
import { NumberDisplay } from "./display/number"
import { BooleanDisplay } from "./display/boolean"
import { DateDisplay } from "./display/date"
import { JsonDisplay } from "./display/json"
import { RichtextDisplay } from "./display/richtext"
import { MediaDisplay } from "./display/media"
import { TextEdit } from "./edit/text"
import { NumberEdit } from "./edit/number"
import { BooleanEdit } from "./edit/boolean"
import { DateEdit } from "./edit/date"
import { JsonEdit } from "./edit/json"
import { RichtextEdit } from "./edit/richtext"
import { MediaEdit } from "./edit/media"

/** Mappa BranchType → componente di sola lettura */
export const displayRegistry: Partial<
  Record<BranchType, ComponentType<FieldDisplayProps>>
> = {
  text: TextDisplay,
  number: NumberDisplay,
  boolean: BooleanDisplay,
  date: DateDisplay,
  json: JsonDisplay,
  richtext: RichtextDisplay,
  file: MediaDisplay,
}

/** Mappa BranchType → componente di edit */
export const editRegistry: Partial<
  Record<BranchType, ComponentType<FieldEditProps>>
> = {
  text: TextEdit,
  number: NumberEdit,
  boolean: BooleanEdit,
  date: DateEdit,
  json: JsonEdit,
  richtext: RichtextEdit,
  file: MediaEdit,
}

/** Restituisce il componente display per un tipo, o il fallback */
export function getDisplayComponent(
  type: BranchType
): ComponentType<FieldDisplayProps> {
  return displayRegistry[type] ?? DefaultDisplay
}

/** Restituisce il componente edit per un tipo, o il fallback */
export function getEditComponent(type: BranchType): ComponentType<FieldEditProps> {
  return editRegistry[type] ?? DefaultEdit
}
