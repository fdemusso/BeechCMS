// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { parseArgs } from 'node:util'
import type { EvalVariant } from './types.ts'

export interface EvalArgs {
  variants: EvalVariant[]      // default ['v1', 'v2']
  taskIds: string[]            // default: every EVAL_SUITE id, suite order
  model: string                // default 'sonnet'
  timeoutMs: number            // default 600_000
  budgetUsd: number            // default 2
  keepWorkspaces: boolean      // default false
}

const ALL_VARIANTS: readonly EvalVariant[] = ['v1', 'v2']

function positiveNumber(flag: string, raw: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} must be a positive number, got '${raw}'`)
  return value
}

/**
 * Parses the eval CLI flags.
 *
 * @param argv - Arguments after the script name.
 * @param knownTaskIds - Suite task ids in suite order; selected tasks always come back in this order.
 * @throws Error naming the offending flag and its allowed values.
 */
export function parseEvalArgs(argv: readonly string[], knownTaskIds: readonly string[]): EvalArgs {
  let parsed
  try {
    parsed = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        variant: { type: 'string', multiple: true },
        task: { type: 'string', multiple: true },
        model: { type: 'string' },
        'timeout-min': { type: 'string' },
        'budget-usd': { type: 'string' },
        'keep-workspaces': { type: 'boolean' },
      },
    })
  } catch (error) {
    throw new Error(`${error instanceof Error ? error.message : String(error)}. Flags: --variant v1|v2, --task <id>, --model <alias>, --timeout-min <n>, --budget-usd <n>, --keep-workspaces`)
  }
  const { values } = parsed

  const requestedVariants = values.variant ?? []
  for (const variant of requestedVariants) {
    if (!(ALL_VARIANTS as readonly string[]).includes(variant)) throw new Error(`--variant must be one of ${ALL_VARIANTS.join(', ')}, got '${variant}'`)
  }
  const requestedTasks = values.task ?? []
  for (const taskId of requestedTasks) {
    if (!knownTaskIds.includes(taskId)) throw new Error(`--task must be one of ${knownTaskIds.join(', ')}, got '${taskId}'`)
  }

  return {
    variants: requestedVariants.length > 0 ? ALL_VARIANTS.filter(variant => requestedVariants.includes(variant)) : [...ALL_VARIANTS],
    taskIds: requestedTasks.length > 0 ? knownTaskIds.filter(taskId => requestedTasks.includes(taskId)) : [...knownTaskIds],
    model: values.model ?? 'sonnet',
    timeoutMs: values['timeout-min'] === undefined ? 600_000 : positiveNumber('--timeout-min', values['timeout-min']) * 60_000,
    budgetUsd: values['budget-usd'] === undefined ? 2 : positiveNumber('--budget-usd', values['budget-usd']),
    keepWorkspaces: values['keep-workspaces'] ?? false,
  }
}
