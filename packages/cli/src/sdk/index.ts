// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk
 * Public surface of `@beechcms/cli/sdk`: types, guards and `defineScript`. `createBeechSdk`, the transport and the
 * method map stay internal; `beech run` imports them by source path.
 */

export type * from './types.js'
export type { BeechSdkHandle } from './create-sdk.js'
export { BeechSdkError, SDK_ERROR_CODES } from './errors.js'
export { isPending, isExecuted } from './invoke.js'
export { defineScript } from './define-script.js'
export type { ScriptContext, BeechScript } from './define-script.js'
export type { RunReport, RunError } from './run-report.js'
export { RUN_REPORT_VERSION, RUN_ERROR_CODES } from './run-report.js'
