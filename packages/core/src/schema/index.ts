// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema
 * Authoring surface for `beech.schema.ts`. Imported by authoring tools and the CLI — NEVER by the
 * Worker, which is why this module is a separate subpath and is absent from `src/index.ts`.
 */

export * from './manifest.types.js'
export * from './define.js'
export * from './canonical.js'
export * from './manifest-seeds.js'
export * from './manifest-validation.js'
export * from './emit.js'
