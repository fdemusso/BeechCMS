// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { ComponentType } from 'react'
import type { BranchType } from '@beechcms/core'
import type { FieldDisplayProps, FieldEditProps } from './types'
import { FieldRegistryImpl, type IFieldRegistry } from './field-registry'

import { DefaultDisplay, DefaultEdit } from './default'
import { TextDisplay } from './display/text'
import { NumberDisplay } from './display/number'
import { BooleanDisplay } from './display/boolean'
import { DateDisplay } from './display/date'
import { JsonDisplay } from './display/json'
import { RichtextDisplay } from './display/richtext'
import { MediaDisplay } from './display/media'
import { RelationDisplay } from './display/relation'
import { RepeaterDisplay } from './display/repeater'
import { TextEdit } from './edit/text'
import { NumberEdit } from './edit/number'
import { BooleanEdit } from './edit/boolean'
import { DateEdit } from './edit/date'
import { JsonEdit } from './edit/json'
import { RichtextEdit } from './edit/richtext'
import { MediaEdit } from './edit/media'
import { RelationEdit } from './edit/relation'
import { FieldEditRepeater } from './edit/repeater/repeater'
import { SelectEdit } from './edit/select'

const fieldRegistry: IFieldRegistry = new FieldRegistryImpl()

fieldRegistry.registerDisplay('text', TextDisplay)
fieldRegistry.registerDisplay('number', NumberDisplay)
fieldRegistry.registerDisplay('boolean', BooleanDisplay)
fieldRegistry.registerDisplay('date', DateDisplay)
fieldRegistry.registerDisplay('json', JsonDisplay)
fieldRegistry.registerDisplay('tags', JsonDisplay)
fieldRegistry.registerDisplay('richtext', RichtextDisplay)
fieldRegistry.registerDisplay('file', MediaDisplay)
fieldRegistry.registerDisplay('relation', RelationDisplay)
fieldRegistry.registerDisplay('repeater', RepeaterDisplay)

fieldRegistry.registerEdit('text', TextEdit)
fieldRegistry.registerEdit('number', NumberEdit)
fieldRegistry.registerEdit('boolean', BooleanEdit)
fieldRegistry.registerEdit('date', DateEdit)
fieldRegistry.registerEdit('json', JsonEdit)
fieldRegistry.registerEdit('tags', JsonEdit)
fieldRegistry.registerEdit('richtext', RichtextEdit)
fieldRegistry.registerEdit('file', MediaEdit)
fieldRegistry.registerEdit('relation', RelationEdit)

fieldRegistry.registerEdit('repeater', FieldEditRepeater)

// 'select' is likewise dashboard-only — a minimal single-select over `branch.options`,
// used by the meta-seed layout (sprint 09) for `displayNameAlias` and `dashIcon`.
fieldRegistry.registerEdit('select' as BranchType, SelectEdit)

export function getDisplayComponent(type: BranchType): ComponentType<FieldDisplayProps> {
  return fieldRegistry.getDisplay(type) ?? DefaultDisplay
}

export function getEditComponent(type: BranchType): ComponentType<FieldEditProps> {
  return fieldRegistry.getEdit(type) ?? DefaultEdit
}

export { fieldRegistry }
