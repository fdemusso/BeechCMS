import type { ComponentType } from 'react'
import type { BranchType } from '@beechcms/core'
import type { FieldDisplayProps, FieldEditProps } from './types'

export interface IFieldRegistry {
  /**
   * Registers a display renderer for a branch type.
   * Called at startup by the static registry and can be called at runtime
   * by external plugins to add support for custom branch types.
   * Later registrations overwrite earlier ones for the same type.
   */
  registerDisplay(type: BranchType, component: ComponentType<FieldDisplayProps>): void

  /**
   * Registers an edit renderer for a branch type.
   * Same semantics as registerDisplay.
   */
  registerEdit(type: BranchType, component: ComponentType<FieldEditProps>): void

  /**
   * Returns the display component for the given branch type,
   * or undefined if no renderer has been registered.
   * Callers are responsible for rendering a fallback when undefined.
   */
  getDisplay(type: BranchType): ComponentType<FieldDisplayProps> | undefined

  /**
   * Returns the edit component for the given branch type,
   * or undefined if no renderer has been registered.
   */
  getEdit(type: BranchType): ComponentType<FieldEditProps> | undefined
}

export class FieldRegistryImpl implements IFieldRegistry {
  private readonly displayMap = new Map<BranchType, ComponentType<FieldDisplayProps>>()
  private readonly editMap = new Map<BranchType, ComponentType<FieldEditProps>>()

  registerDisplay(type: BranchType, component: ComponentType<FieldDisplayProps>): void {
    this.displayMap.set(type, component)
  }

  registerEdit(type: BranchType, component: ComponentType<FieldEditProps>): void {
    this.editMap.set(type, component)
  }

  getDisplay(type: BranchType): ComponentType<FieldDisplayProps> | undefined {
    return this.displayMap.get(type)
  }

  getEdit(type: BranchType): ComponentType<FieldEditProps> | undefined {
    return this.editMap.get(type)
  }
}
