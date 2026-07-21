// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineSeed } from '@beechcms/core'
import bcrypt from 'bcryptjs'

/**
 * GLOBAL TEST CONFIGURATION
 */
export const TEST_JWT_SECRET = 'beech_cms_super_secret_test_key_2024_!@#'
export const TEST_PUBLIC_READ_KEY = 'pk_read_live_6f8g9h0j1k2l'
export const TEST_PUBLIC_WRITE_KEY = 'pk_write_live_9a8b7c6d5e4f'

/**
 * SHARED HONO ENVIRONMENT
 */
export const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  PUBLIC_READ_API_KEY: TEST_PUBLIC_READ_KEY,
  PUBLIC_WRITE_API_KEY: TEST_PUBLIC_WRITE_KEY,
  // Always use MinIO root credentials — matches docker-compose.yml MINIO_ROOT_USER/PASSWORD.
  // Do NOT read from process.env: .dev.vars may carry a stale or production access key.
  R2_ACCESS_KEY_ID: 'beechdev',
  R2_SECRET_ACCESS_KEY: 'beechdevsecret',
  // Endpoint is dynamic: port is assigned by BEECH_MINIO_PORT in docker-compose.
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
  // Dedicated test bucket — never use the production 'beech-media' bucket.
  R2_BUCKET_NAME: 'beech-media-test',
  ENV: 'development',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'localhost',
  // Dynamic: BEECH_MAILPIT_SMTP_PORT controls host port in docker-compose.
  SMTP_PORT: process.env.BEECH_MAILPIT_SMTP_PORT ?? '1025',
  EMAIL_FROM: 'Test <test@beech.local>',
  // Dynamic: BEECH_WEBHOOK_TESTER_PORT controls host port in docker-compose.
  WEBHOOK_TESTER_URL: process.env.WEBHOOK_TESTER_URL ?? `http://localhost:${process.env.BEECH_WEBHOOK_TESTER_PORT ?? '8084'}`,
}

/**
 * SHARED CONTENT SEEDS
 * Used to test the Botanical Engine and Public APIs with realistic data.
 */
export const TEST_SEEDS = [
  defineSeed({
    slug: 'posts',
    label: 'Post',
    labelPlural: 'Posts',
    displayNameAlias: 'title',
    allowPublicRead: true,
    allowPublicPost: true,
    allowPublicEdit: true,
    allowDrafts: true,
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
      { id: 'br_02', alias: 'body', label: 'Body', type: 'richtext', policies: { public: true } }, // Changed to richtext for validation tests
      { id: 'br_03', alias: 'internal_note', label: 'Internal Note', type: 'text', policies: { public: false } },
      { id: 'br_04', alias: 'contact_email', label: 'Contact Email', type: 'text' },
      { id: 'br_05', alias: 'view_count', label: 'View Count', type: 'number' },
      { id: 'br_06', alias: 'image', label: 'Featured Image', type: 'file', fileOptions: { accept: 'image' } },
      { id: 'br_07', alias: 'tags', label: 'Tags', type: 'tags' },
    ],
  }),
  defineSeed({
    slug: 'documentation',
    label: 'Document',
    labelPlural: 'Documents',
    displayNameAlias: 'title',
    allowPublicRead: false,
    allowPublicPost: false,
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
    ],
  }),
  defineSeed({
    slug: 'numerical',
    label: 'Numerical',
    labelPlural: 'Numericals',
    displayNameAlias: 'id',
    branches: [
      {
        id: 'br_01',
        alias: 'score',
        label: 'Score',
        type: 'number',
        numberOptions: {
          min: 0,
          max: 10,
          step: 2
        }
      },
      {
        id: 'br_02',
        alias: 'rating',
        label: 'Rating',
        type: 'number',
        numberOptions: {
          min: 0,
          step: 0.5
        }
      },
      {
        id: 'br_03',
        alias: 'unconstrained',
        label: 'Unbounded',
        type: 'number'
      }
    ],
  }),
]

/**
 * SHARED TEST USERS
 * Used for authentication and access control tests.
 * Default password for all test users: 'password123'
 */
export const TEST_USERS = [
  {
    id: 'user_admin_01',
    email: 'flavio@beechcms.io',
    password_hash: bcrypt.hashSync('password123', 10),
    name: 'Flavio De Musso'
  },
  {
    id: 'user_editor_01',
    email: 'editor@beechcms.io',
    password_hash: bcrypt.hashSync('password123', 10),
    name: 'Jane Doe'
  }
]
