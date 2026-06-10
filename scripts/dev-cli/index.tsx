import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { render } from 'ink'
import { DevApp } from './components/DevApp'
import { Orchestrator } from './orchestrator'

const ALT_SCREEN_ENTER = '\x1b[?1049h'
const ALT_SCREEN_EXIT = '\x1b[?1049l'

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

async function main(): Promise<void> {
  const orchestrator = new Orchestrator()
  const version = readVersion()

  process.stdout.write(ALT_SCREEN_ENTER)

  let exiting = false
  const shutdownAndExit = async () => {
    if (exiting) return
    exiting = true
    await orchestrator.shutdown()
    instance.unmount()
    process.stdout.write(ALT_SCREEN_EXIT)
    process.exit(0)
  }

  const instance = render(<DevApp orchestrator={orchestrator} version={version} onQuit={() => void shutdownAndExit()} />, {
    exitOnCtrlC: false,
    patchConsole: false,
  })

  process.on('SIGINT', () => void shutdownAndExit())
  process.on('SIGTERM', () => void shutdownAndExit())

  void orchestrator.start()

  await instance.waitUntilExit()
}

main().catch((err) => {
  process.stdout.write(ALT_SCREEN_EXIT)
  console.error(err)
  process.exit(1)
})
