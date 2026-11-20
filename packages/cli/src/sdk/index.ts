// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk
 * Public surface of `@beechcms/cli/sdk`: types and guards only. `createBeechSdk`, the transport and the
 * method map stay internal; `beech run` imports them by source path.
 */

export type * from './types.js'
export type { BeechSdkHandle } from './create-sdk.js'
export { BeechSdkError, SDK_ERROR_CODES } from './errors.js'
export { isPending, isExecuted } from './invoke.js'
