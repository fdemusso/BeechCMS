import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export interface LogsOptions {
  service?: string
}

const SERVICE_MAP: Record<string, string> = {
  mailpit: 'mailpit',
  db: 'sqlite-web',
  sqlite: 'sqlite-web',
  tunnel: 'tunnel',
  storage: 'minio',
  minio: 'minio',
}

export async function logs(args: LogsOptions): Promise<void> {
  const inputService = args.service?.toLowerCase()

  if (!inputService || !SERVICE_MAP[inputService]) {
    console.log(pc.red('\n  ✗ Error: Please specify a valid service name.'))
    console.log(pc.dim('\n  Accepted services:'))
    console.log(`    - ${pc.cyan('mailpit')}`)
    console.log(`    - ${pc.cyan('db')} / ${pc.cyan('sqlite')}`)
    console.log(`    - ${pc.cyan('tunnel')}`)
    console.log(`    - ${pc.cyan('storage')} / ${pc.cyan('minio')}\n`)
    process.exit(1)
    return
  }

  const service = SERVICE_MAP[inputService]
  console.log(pc.cyan(`\n  beech logs ${inputService} — streaming logs for ${service}…\n`))

  const result = spawnSync('docker', ['compose', '-f', 'docker/docker-compose.yml', 'logs', '-f', service], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
    return
  }
}
