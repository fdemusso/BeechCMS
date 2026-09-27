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

  // --- destructive (sprint 06 — Danger Zone) -------------------------------
  // These methods emit IRREVERSIBLE, data-destroying SQL. They are deliberately
  // separate from execDdl so destructive statements can never be smuggled
  // through the additive path, and so reviewers can grep for the call sites.
  // Each validates table/column identifiers (`^[A-Za-z0-9_]+$`) before
  // interpolation — these names cannot be parameterized in DDL.

  /** `DROP TABLE IF EXISTS {table}`. */
  dropTable(table: string): Promise<void>
  /** `ALTER TABLE {table} DROP COLUMN {column}`. */
  dropColumn(table: string, column: string): Promise<void>
  /** `ALTER TABLE {table} RENAME COLUMN {from} TO {to}`. */
  renameColumn(table: string, from: string, to: string): Promise<void>
  /** Runs a multi-statement destructive batch atomically (FTS rebuild,
   *  type-change column rebuild, full type drop). The caller assembles the
   *  statements; the impl validates identifiers and runs them as one D1 batch. */
  execDestructive(statements: string[]): Promise<void>

  /** Reads all rows from a table for the specified columns only.
   *  Used before DROP TABLE to collect R2 keys for media cleanup.
   *  All identifiers are validated against `^[A-Za-z0-9_]+$`. */
  fetchRows(table: string, columns: string[]): Promise<Record<string, unknown>[]>
}
