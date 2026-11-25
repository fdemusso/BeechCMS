// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { randomBytes } from 'node:crypto'

/** Local Public API keys. Public by design: the same in every scaffolded project and in the docs. */
export const DEV_PUBLISHABLE_KEY = 'beech_pk_dev'
export const DEV_SECRET_KEY = 'beech_sk_dev'

/** Secrets the worker reads in production. `.dev.vars` holds their local values; the order is the order the scaffolder prints. */
export const PRODUCTION_SECRETS = ['JWT_SECRET', 'BEECH_SECRET_KEY', 'PUBLIC_TIME_TRAP_SECRET', 'PRIVACY_MASTER_KEY']

export function buildWorkerTs() {
  return `/// <reference types="@cloudflare/workers-types" />
import { createBeechApp } from '@beechcms/api'

export default createBeechApp({ seeds: [] })
`
}

/**
 * @param {string} name Project name.
 * @param {string} d1Name D1 database the migration scripts target (the one in wrangler.jsonc).
 * @param {Record<string, string>} versions Dependency ranges, see `computeTemplateVersions`.
 */
export function buildPackageJson(name, d1Name, versions) {
  return JSON.stringify({
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'npm run db:migrate:local && wrangler dev --port 8789',
      // ENV decides dev-only behaviour (open rate limits, reset links in responses): production must say so.
      deploy: 'wrangler deploy --minify --var ENV:production',
      'db:migrate:local': 'wrangler d1 migrations apply ' + d1Name + ' --local',
      'db:reset:local': 'node -e "require(\'fs\').rmSync(\'.wrangler/state\',{recursive:true,force:true})" && npm run db:migrate:local',
    },
    dependencies: {
      '@beechcms/api': versions['@beechcms/api'],
      '@beechcms/core': versions['@beechcms/core'],
    },
    devDependencies: {
      '@beechcms/cli': versions['@beechcms/cli'],
      '@cloudflare/workers-types': versions['@cloudflare/workers-types'],
      wrangler: versions.wrangler,
      typescript: '^5.0.0',
    },
  }, null, 2) + '\n'
}

/**
 * @param {{ name: string, d1Name: string, d1Id: string, r2Bucket: string, corsOrigins: string, appUrl?: string }} cfg
 */
export function buildWranglerJsonc(cfg) {
  return `{
  "name": "${cfg.name}-api",
  "main": "worker.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],

  "vars": {
    "ENV": "development",
    "CORS_ORIGINS": "${cfg.corsOrigins}",
    "BEECH_PUBLISHABLE_KEY": "${DEV_PUBLISHABLE_KEY}",
    "APP_URL": "${cfg.appUrl || 'http://localhost:5173'}"
  },

  "assets": {
    "binding": "ASSETS",
    "directory": "node_modules/@beechcms/api/assets/dashboard"
  },

  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "${cfg.d1Name}",
      "database_id": "${cfg.d1Id}",
      "migrations_dir": "node_modules/@beechcms/api/migrations"
    }
  ],

  "r2_buckets": [
    {
      "binding": "MEDIA_BUCKET",
      "bucket_name": "${cfg.r2Bucket}"
    }
  ]
}
`
}

/**
 * @param {null | { r2AccessKey: string, r2SecretKey: string, r2Endpoint: string, r2Bucket: string }} cloudflare
 */
export function buildDevVars(cloudflare) {
  const PRIVACY_KEY_LINES = `# Master key for protected fields (AES-GCM + blind index). Do NOT change once data is stored.\nPRIVACY_MASTER_KEY=${randomBytes(32).toString('hex')}`
  const SECRET_LINES = [
    '# This file is git-ignored and must never be committed.',
    '# In production, set each value with `npx wrangler secret put <NAME>`.',
    '',
    '# Signs login tokens.',
    `JWT_SECRET=${randomBytes(32).toString('hex')}`,
    '',
    '# Public API secret key: server-only, reads and writes, refused outside ENV=development.',
    `BEECH_SECRET_KEY=${DEV_SECRET_KEY}`,
    '',
    '# Signs the anti-bot token of anonymous form submissions.',
    `PUBLIC_TIME_TRAP_SECRET=${randomBytes(32).toString('hex')}`,
    '',
  ].join('\n')
  if (cloudflare) {
    return [
      SECRET_LINES,
      `# Cloudflare R2 S3 credentials (required for direct client upload via Presigned URLs)`,
      `# Guide: https://developers.cloudflare.com/r2/api/s3/tokens/`,
      `R2_ACCESS_KEY_ID=${cloudflare.r2AccessKey}`,
      `R2_SECRET_ACCESS_KEY=${cloudflare.r2SecretKey}`,
      `R2_ENDPOINT=${cloudflare.r2Endpoint}`,
      `R2_BUCKET_NAME=${cloudflare.r2Bucket}`,
      '',
      PRIVACY_KEY_LINES,
    ].join('\n') + '\n'
  }
  return [
    SECRET_LINES,
    '# Media uploads work locally without any configuration: wrangler emulates R2 and the Worker stores the file.',
    '# For direct uploads through presigned URLs (production), add your R2 S3 credentials here and with `wrangler secret put`:',
    '#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME',
    '# Guide: https://developers.cloudflare.com/r2/api/s3/tokens/',
    '',
    PRIVACY_KEY_LINES,
  ].join('\n') + '\n'
}

export function buildTsConfig() {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      // No DOM: workers-types and lib.dom declare the same globals (Request, Response, WebSocket) and clash.
      lib: ['ES2022'],
      module: 'ES2022',
      moduleResolution: 'bundler',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      types: ['@cloudflare/workers-types'],
    },
    include: ['*.ts'],
  }, null, 2) + '\n'
}
