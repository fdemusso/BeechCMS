// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import * as React from "react"
import type { Seed } from "@beechcms/core"
import type { UseQueryResult } from "@tanstack/react-query"

/**
 * Structured record representing a resolved content entry used for field relation resolution.
 * Matches the core shape of a CMS content entry.
 */
export interface FieldRelationRecord {
  /** The unique identifier of the content entry. */
  id: string
  /** The key-value dictionary containing the content entry's custom fields. */
  data: Record<string, unknown>
  /** The URL-friendly slug of the entry, if defined. */
  slug?: string | null
}

/**
 * Configuration and dependency slots injected into the field rendering system
 * to avoid circular imports and keep fields module-agnostic.
 */
export interface FieldsContextType {
  /**
   * Shared hook to query schema seed definitions.
   * Typically proxies the application-wide `useSchema` query.
   *
   * @returns A react-query query result containing the array of schema seeds.
   */
  useSchema: () => UseQueryResult<Seed[]>

  /**
   * Fetches a single entry by its schema slug and ID.
   * Primarily used for resolving the display label of a relation.
   *
   * @param slug - The slug of the target schema (e.g., "posts", "users").
   * @param id - The unique ID of the entry to fetch.
   * @returns A promise resolving to the content record.
   */
  fetchById: (slug: string, id: string) => Promise<FieldRelationRecord>

  /**
   * Searches/filters entries in a given schema for the relation autocomplete dropdown.
   *
   * @param slug - The slug of the target schema.
   * @param params - Search parameters.
   * @param params.search - Optional search string or query.
   * @param params.limit - Optional pagination limit.
   * @returns A promise resolving to an array of matching content records.
   */
  searchRelations: (
    slug: string,
    params: { search?: string; limit?: number },
  ) => Promise<FieldRelationRecord[]>

  /**
   * Query keys mapping to ensure that caching is unified with the rest of the application.
   */
  queryKeys: {
    /**
     * Resolves the query key for a single entry detail view.
     *
     * @param slug - The slug of the schema.
     * @param id - The ID of the entry.
     * @returns A read-only query key tuple/array.
     */
    detail: (slug: string, id: string) => readonly unknown[]

    /**
     * Resolves the root query key for entry lists.
     *
     * @returns A read-only query key array.
     */
    lists: () => readonly unknown[]
  }

  /**
   * Component slots injected into the fields component tree to render complex UI parts
   * without direct dependency imports.
   */
  components: {
    /** Dialog component used to view/edit entry details. */
    EntryEditorDialog: React.ComponentType<any>
    /** Rich text editor input component. */
    RichtextEditor: React.ComponentType<any>
  }
}

/**
 * React Context containing the fields configuration.
 */
export const FieldsContext = React.createContext<FieldsContextType | null>(null)

/**
 * Properties for the {@link FieldsProvider} component.
 */
export interface FieldsProviderProps {
  /** The fields configuration context value. */
  value: FieldsContextType
  /** The children nodes. */
  children: React.ReactNode
}

/**
 * Context Provider wrapping fields components to supply their runtime dependencies.
 *
 * @param props - Component properties.
 * @returns React context provider element.
 */
export function FieldsProvider({ value, children }: FieldsProviderProps) {
  return <FieldsContext.Provider value={value}>{children}</FieldsContext.Provider>
}

/**
 * Hook to retrieve the active fields configuration from context.
 *
 * @throws {Error} If called outside of a {@link FieldsProvider}.
 * @returns The active {@link FieldsContextType} configuration.
 */
export function useFieldsConfig(): FieldsContextType {
  const fieldsContext = React.useContext(FieldsContext)
  if (!fieldsContext) {
    throw new Error("useFieldsConfig must be used within a FieldsProvider")
  }
  return fieldsContext
}

