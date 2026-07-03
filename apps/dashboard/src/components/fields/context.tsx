// SPDX-License-Identifier: BUSL-1.1
import * as React from "react"
import type { Seed } from "@beechcms/core"
import type { UseQueryResult } from "@tanstack/react-query"

/** Record generico di un content entry restituito dall'API list/detail. */
export type FieldRelationRecord = Record<string, unknown> & { id: string }

export interface FieldsContextType {
  /** Hook schema/seed condiviso (proxy di useSchema). Nessun argomento. */
  useSchema: () => UseQueryResult<Seed[]>
  /** Fetch di una singola entry per la risoluzione display della relazione. */
  fetchById: (slug: string, id: string) => Promise<FieldRelationRecord>
  /** Ricerca lista per il selettore di relazioni (search server-side). */
  searchRelations: (
    slug: string,
    params: { search?: string; limit?: number },
  ) => Promise<FieldRelationRecord[]>
  /** Factory delle query-key TanStack, iniettata per coerenza di cache. */
  queryKeys: {
    detail: (slug: string, id: string) => readonly unknown[]
    lists: () => readonly unknown[]
  }
  /** Component-slot iniettati da slice di business (evita import diretto). */
  components: {
    EntryEditorDialog: React.ComponentType<any>
    RichtextEditor: React.ComponentType<any>
  }
}

export const FieldsContext = React.createContext<FieldsContextType | null>(null)

export function FieldsProvider({
  value,
  children,
}: {
  value: FieldsContextType
  children: React.ReactNode
}) {
  return <FieldsContext.Provider value={value}>{children}</FieldsContext.Provider>
}

export function useFieldsConfig(): FieldsContextType {
  const ctx = React.useContext(FieldsContext)
  if (!ctx) {
    throw new Error("useFieldsConfig must be used within a FieldsProvider")
  }
  return ctx
}
