// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { createInterface } from 'node:readline/promises'
import { dbReset } from './db-reset.js'
import { devReset } from './dev-reset.js'

export interface ResetOptions {
  db?: boolean
  docker?: boolean
  all?: boolean
  yes?: boolean
}

export async function reset(args: ResetOptions): Promise<void> {
  console.log(pc.cyan('\n  beech reset — cleanup environments\n'))

  let resetDb = args.db || args.all
  let resetDocker = args.docker || args.all

  if (!args.db && !args.docker && !args.all) {
    if (args.yes) {
      resetDb = true
      resetDocker = true
    } else if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        const answer = (await rl.question(
          pc.cyan('  → No options provided. Would you like to reset everything (DB & Docker)? (y/N): ')
        )).trim().toLowerCase()
        if (answer === 'y' || answer === 'yes') {
          resetDb = true
          resetDocker = true
        } else {
          console.log(pc.dim('\n  Reset cancelled. Use --db, --docker, or --all.\n'))
          return
        }
      } finally {
        rl.close()
      }
    } else {
      console.log(pc.red('\n  ✗ Error: Please specify what to reset using --db, --docker, or --all.\n'))
      process.exit(1)
    }
  }

  if (resetDocker) {
    await devReset()
  }

  if (resetDb) {
    await dbReset({})
  }
}
