// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import * as p from '@clack/prompts'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { findWranglerConfig } from '../lib/wrangler.js'

export interface SetupCloudflareOptions {
  projectName?: string
  nonInteractive?: boolean
}

function parseWranglerConfig(configPath: string): { name: string; raw: string; parsed: any } {
  const raw = readFileSync(configPath, 'utf-8')
  const stripped = raw
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const parsed = JSON.parse(stripped)
  return { name: parsed.name || 'my-beech-project', raw, parsed }
}

export async function setupCloudflare(options: SetupCloudflareOptions = {}): Promise<void> {
  p.intro(pc.cyan('⚡ BeechCMS — Automated Cloudflare Provisioning'))

  const configPath = findWranglerConfig()
  let projectName = options.projectName

  if (!projectName && configPath) {
    try {
      const cfg = parseWranglerConfig(configPath)
      projectName = cfg.name
    } catch {}
  }

  if (!projectName) {
    if (options.nonInteractive) {
      projectName = 'my-beech-project'
    } else {
      const input = await p.text({
        message: 'Project name',
        placeholder: 'my-website',
        validate: (v) => {
          if (!v.trim()) return 'Required'
          if (!/^[a-z0-9][a-z0-9-]*$/.test(v.trim())) return 'Lowercase letters, numbers and hyphens only'
        },
      })
      if (p.isCancel(input)) {
        p.cancel('Setup cancelled')
        return
      }
      projectName = input.trim()
    }
  }

  const d1Name = `${projectName}-db`
  const r2Bucket = `${projectName}-media`

  const s = p.spinner()

  // 1. Provision D1 Database
  s.start(`Creating Cloudflare D1 database: ${pc.bold(d1Name)}…`)
  const d1Result = spawnSync('npx', ['wrangler', 'd1', 'create', d1Name], {
    encoding: 'utf-8',
    shell: true,
    cwd: process.cwd(),
  })

  let databaseId: string | null = null
  const d1Output = (d1Result.stdout || '') + (d1Result.stderr || '')

  // Extract database_id from output
  const idMatch = d1Output.match(/database_id\s*=\s*["']?([a-f0-9-]{36})["']?/i) ||
                  d1Output.match(/"database_id":\s*"([a-f0-9-]{36})"/i) ||
                  d1Output.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i)

  if (idMatch) {
    databaseId = idMatch[1]
    s.stop(pc.green(`✓ D1 database ready: ${pc.bold(d1Name)} (${databaseId})`))
  } else if (d1Output.includes('already exists') || d1Result.status === 0) {
    s.stop(pc.yellow(`ℹ D1 database ${pc.bold(d1Name)} already exists or created.`))
  } else {
    s.stop(pc.yellow(`⚠ Note on D1 create: ${d1Output.trim().slice(0, 150)}`))
  }

  // 2. Provision R2 Bucket
  s.start(`Creating Cloudflare R2 bucket: ${pc.bold(r2Bucket)}…`)
  const r2Result = spawnSync('npx', ['wrangler', 'r2', 'bucket', 'create', r2Bucket], {
    encoding: 'utf-8',
    shell: true,
    cwd: process.cwd(),
  })

  const r2Output = (r2Result.stdout || '') + (r2Result.stderr || '')
  if (r2Result.status === 0 || r2Output.includes('already exists')) {
    s.stop(pc.green(`✓ R2 bucket ready: ${pc.bold(r2Bucket)}`))
  } else {
    s.stop(pc.yellow(`⚠ Note on R2 create: ${r2Output.trim().slice(0, 150)}`))
  }

  // 3. Update wrangler.jsonc
  if (configPath && existsSync(configPath)) {
    try {
      let content = readFileSync(configPath, 'utf-8')

      // Update database_name
      content = content.replace(/"database_name":\s*"[^"]*"/, `"database_name": "${d1Name}"`)
      if (databaseId) {
        content = content.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${databaseId}"`)
      }
      // Update r2 bucket_name
      content = content.replace(/"bucket_name":\s*"[^"]*"/, `"bucket_name": "${r2Bucket}"`)

      writeFileSync(configPath, content, 'utf-8')
      p.log.success(pc.green(`Updated ${pc.bold(configPath)} with database_id and bucket_name.`))
    } catch (err: any) {
      p.log.warn(`Could not update wrangler config automatically: ${err.message}`)
    }
  }

  // 4. Setup R2 Presigned Credentials
  if (!options.nonInteractive) {
    p.note(
      [
        'Direct uploads via Presigned URLs (SigV4) stream directly from browser to R2 with zero Worker CPU/RAM.',
        'To configure Presigned uploads:',
        '  1. Open Cloudflare Dashboard → R2 → "Manage R2 API Tokens"',
        `  2. Click "Create API Token" → Object Read & Write → bucket: ${r2Bucket}`,
        '  Guide: https://developers.cloudflare.com/r2/api/s3/tokens/',
      ].join('\n'),
      'R2 S3 Credentials Setup'
    )

    const configureSecrets = await p.confirm({
      message: 'Do you have your R2 API Token ready to configure now?',
      initialValue: true,
    })

    if (!p.isCancel(configureSecrets) && configureSecrets) {
      const accountId = await p.text({
        message: 'Cloudflare Account ID (from dash.cloudflare.com)',
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        validate: (v) => { if (!v.trim()) return 'Required' },
      })

      const accessKeyId = !p.isCancel(accountId) ? await p.text({
        message: 'R2 Access Key ID',
        validate: (v) => { if (!v.trim()) return 'Required' },
      }) : null

      const secretAccessKey = (!p.isCancel(accessKeyId) && accessKeyId) ? await p.password({
        message: 'R2 Secret Access Key',
        validate: (v) => { if (!v.trim()) return 'Required' },
      }) : null

      if (!p.isCancel(accountId) && !p.isCancel(accessKeyId) && !p.isCancel(secretAccessKey) && accountId && accessKeyId && secretAccessKey) {
        const endpoint = `https://${accountId.trim()}.r2.cloudflarestorage.com`

        // Write .dev.vars
        const devVarsPath = resolve(process.cwd(), '.dev.vars')
        const devVarsContent = [
          '# Cloudflare R2 S3 credentials (for direct Presigned URL uploads)',
          `R2_ACCESS_KEY_ID=${accessKeyId.trim()}`,
          `R2_SECRET_ACCESS_KEY=${secretAccessKey.trim()}`,
          `R2_ENDPOINT=${endpoint}`,
          `R2_BUCKET_NAME=${r2Bucket}`,
        ].join('\n') + '\n'

        writeFileSync(devVarsPath, devVarsContent, 'utf-8')
        p.log.success(pc.green(`Created ${pc.bold('.dev.vars')} with local development credentials.`))

        // Set production secrets via wrangler
        s.start('Setting production secrets on Cloudflare Worker…')
        spawnSync('npx', ['wrangler', 'secret', 'put', 'R2_ACCESS_KEY_ID'], {
          input: accessKeyId.trim(),
          encoding: 'utf-8',
          shell: true,
        })
        spawnSync('npx', ['wrangler', 'secret', 'put', 'R2_SECRET_ACCESS_KEY'], {
          input: secretAccessKey.trim(),
          encoding: 'utf-8',
          shell: true,
        })
        spawnSync('npx', ['wrangler', 'secret', 'put', 'R2_ENDPOINT'], {
          input: endpoint,
          encoding: 'utf-8',
          shell: true,
        })
        spawnSync('npx', ['wrangler', 'secret', 'put', 'R2_BUCKET_NAME'], {
          input: r2Bucket,
          encoding: 'utf-8',
          shell: true,
        })
        s.stop(pc.green('✓ Production secrets configured on Cloudflare Worker.'))
      }
    }
  }

  p.outro(pc.green('✨ Cloudflare infrastructure setup complete! You are ready to run `npx beech deploy`.'))
}
