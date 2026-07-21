// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { execa } from "execa"

console.log("Running BeechCMS tests via Turbo...")

try {
  // Avvia turbo test catturando l'output ma lasciandolo stampare a schermo
  const child = execa("pnpm", ["turbo", "run", "test", "--log-order=grouped"], {
    all: true,
    env: { FORCE_COLOR: "1" }
  })

  // Stream output to terminal live
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)

  const { all: output } = await child

  printConsolidatedSummary(output)
} catch (err) {
  if (err.all) {
    printConsolidatedSummary(err.all)
  }
  process.exit(err.exitCode || 1)
}

function printConsolidatedSummary(output) {
  const lines = output.split("\n")
  const summaries = {}

  for (const line of lines) {
    // Rimuove caratteri ANSI di escape per fare il match regex pulito
    const cleanLine = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "")
    
    // Rileva righe come "@beechcms/dashboard:test:  Test Files  96 passed (96)"
    const match = cleanLine.match(/^(\S+):test:\s+(Test Files|Tests|Duration|Start at)\s+(.+)$/i)
    if (match) {
      const [_, pkg, type, value] = match
      const cleanPkg = pkg.replace(/:test$/, "")
      if (!summaries[cleanPkg]) {
        summaries[cleanPkg] = {}
      }
      summaries[cleanPkg][type.trim()] = value.trim()
    }
  }

  const pkgs = Object.keys(summaries)
  if (pkgs.length === 0) return

  console.log("\n\x1b[36m==================================================\x1b[0m")
  console.log("\x1b[36m             CONSOLIDATED TEST SUMMARY            \x1b[0m")
  console.log("\x1b[36m==================================================\x1b[0m")

  for (const pkg of pkgs) {
    const data = summaries[pkg]
    console.log(`\n\x1b[1m\x1b[32m● ${pkg}\x1b[0m`)
    if (data["Start at"]) console.log(`  Start at:  ${data["Start at"]}`)
    if (data["Test Files"]) console.log(`  Test Files: ${data["Test Files"]}`)
    if (data["Tests"]) console.log(`  Tests:      ${data["Tests"]}`)
    if (data["Duration"]) console.log(`  Duration:   ${data["Duration"]}`)
  }
  console.log("\x1b[36m==================================================\x1b[0m\n")
}
