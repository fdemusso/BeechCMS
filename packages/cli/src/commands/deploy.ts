import pc from 'picocolors'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { findWranglerConfig } from '../lib/wrangler.js'

export interface DeployOptions {
  skipSeed?: boolean
  skipCheck?: boolean
}

function readWorkerName(configPath: string | null): string | null {
  if (!configPath) return null
  try {
    const raw = readFileSync(configPath, 'utf-8')
    const stripped = raw
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
    const parsed = JSON.parse(stripped)
    return (parsed?.name as string) ?? null
  } catch {
    return null
  }
}

// Extracts the first workers.dev URL from wrangler deploy stdout.
// wrangler writes progress to stderr (shown live) and the summary to stdout (captured).
function extractWorkerUrl(output: string): string | null {
  const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+\.workers\.dev\b/)
  return match?.[0] ?? null
}

async function checkAdmin(url: string): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetch(`${url}/admin`, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    })
    return { ok: res.status < 500, status: res.status }
  } catch {
    return { ok: false, status: null }
  }
}

export async function deploy(args: DeployOptions): Promise<void> {
  console.log(pc.cyan('\n  beech deploy\n'))

  // Step 1: wrangler deploy via npm run deploy.
  // stdout captured to extract the deployed URL; stderr stays on the terminal for live progress.
  console.log(pc.dim('  [1/3] Deploying Worker…\n'))
  const deployResult = spawnSync('npm', ['run', 'deploy'], {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf-8',
    cwd: process.cwd(),
    shell: true,
  })

  const deployStdout = deployResult.stdout ?? ''
  if (deployStdout) process.stdout.write(deployStdout)

  if (deployResult.status !== 0) {
    console.log(pc.red('\n  ✗ Worker deploy failed\n'))
    console.log(pc.dim('  Check the wrangler output above for details.'))
    console.log(pc.cyan('\n  → Run:  npx wrangler login           # if not authenticated'))
    console.log(pc.cyan('  → Or:   Update wrangler.jsonc        # if database_id is wrong\n'))
    process.exit(1)
  }

  const deployedUrl = extractWorkerUrl(deployStdout)
  console.log(pc.green('\n  ✓ Worker deployed'))

  // Step 2: seed:load --remote as a subprocess so that wrangler failures
  // (which call process.exit internally) don't abort our own process.
  if (args.skipSeed) {
    console.log(pc.dim('\n  [2/3] Skipping seed:load (--skip-seed)'))
  } else {
    console.log(pc.dim('\n  [2/3] Syncing content schema to remote D1…\n'))
    const seedResult = spawnSync('npx', ['beech', 'seed:load'], {
      stdio: 'inherit',
      cwd: process.cwd(),
      shell: true,
    })
    if (seedResult.status !== 0) {
      console.log(pc.yellow('\n  ⚠ seed:load failed\n'))
      console.log(pc.dim('  Sync the remote content schema manually:'))
      console.log(pc.cyan('  → Run: npx beech seed:load\n'))
    } else {
      console.log(pc.green('\n  ✓ Content schema synced'))
    }
  }

  // Step 3: check /admin reachability.
  // Use URL extracted from deploy output; fall back to worker name from wrangler.jsonc.
  if (args.skipCheck) {
    console.log(pc.dim('\n  [3/3] Skipping admin check (--skip-check)\n'))
    return
  }

  const adminBase = deployedUrl ?? (() => {
    const workerName = readWorkerName(findWranglerConfig())
    // We can't reliably construct the full workers.dev subdomain without knowing the account,
    // so only use the name-based URL as a fallback when nothing better is available.
    return workerName ? `https://${workerName}.workers.dev` : null
  })()

  if (!adminBase) {
    console.log(pc.dim('\n  [3/3] Could not determine worker URL — skipping admin check\n'))
    console.log(pc.dim('  The deployed URL is printed by wrangler above. Open <url>/admin to verify.\n'))
    return
  }

  console.log(pc.dim(`\n  [3/3] Checking ${adminBase}/admin…\n`))
  const { ok, status } = await checkAdmin(adminBase)

  if (ok) {
    console.log(pc.green(`  ✓ Admin reachable at: ${adminBase}/admin\n`))
  } else {
    const statusStr = status != null ? ` (HTTP ${status})` : ''
    console.log(pc.yellow(`  ⚠ Admin returned an error${statusStr} at: ${adminBase}/admin\n`))
    console.log(pc.dim('  The database may not be fully initialized.'))
    console.log(pc.cyan('  → Run: npx beech init --db --remote\n'))
  }
}
