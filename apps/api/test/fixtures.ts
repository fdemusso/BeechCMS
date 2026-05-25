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
  R2_ACCESS_KEY_ID: 'beechdev',
  R2_SECRET_ACCESS_KEY: 'beechdevsecret',
  R2_ENDPOINT: 'http://localhost:9000',
  R2_BUCKET_NAME: 'beech-media-test',
  ENV: 'development',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '8025',
  EMAIL_FROM: 'Test <test@beech.local>',
  WEBHOOK_TESTER_URL: 'http://localhost:8084',
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
      { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true, policies: { public: true } },
      { alias: 'body', label: 'Body', type: 'richtext', policies: { public: true } }, // Changed to richtext for validation tests
      { alias: 'internal_note', label: 'Internal Note', type: 'text', policies: { public: false } },
      { alias: 'contact_email', label: 'Contact Email', type: 'text' },
      { alias: 'view_count', label: 'View Count', type: 'number' },
      { alias: 'image', label: 'Featured Image', type: 'file', fileOptions: { accept: 'image' } },
      { alias: 'tags', label: 'Tags', type: 'tags' },
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
      { alias: 'title', label: 'Title', type: 'text' },
    ],
  }),
  defineSeed({
    slug: 'numerical',
    label: 'Numerical',
    labelPlural: 'Numericals',
    displayNameAlias: 'id',
    branches: [
      { 
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
        alias: 'rating',
        label: 'Rating',
        type: 'number',
        numberOptions: {
          min: 0,
          step: 0.5
        }
      },
      {
        alias: 'unbounded',
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
