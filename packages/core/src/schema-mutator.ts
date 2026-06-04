// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** Executes additive schema DDL against the live database and introspects columns.
 *  Implemented by D1SchemaMutator in apps/api/src/shared/schema-mutator.d1.ts.
 *  This is the ONLY sanctioned channel for runtime DDL — handlers never touch env.DB. */
export interface ISchemaMutator {
  /** Column names currently on a table, or null if the table does not exist. */
  getColumns(table: string): Promise<Set<string> | null>
  /** Runs the given DDL statements in order as a single D1 batch.
   *  All statements must be additive (CREATE … IF NOT EXISTS / ALTER … ADD COLUMN /
   *  CREATE INDEX IF NOT EXISTS). Throws on the first failing statement. */
  execDdl(statements: string[]): Promise<void>
}
