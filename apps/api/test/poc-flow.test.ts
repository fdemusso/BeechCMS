import { describe, it, expect, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { defineSeed } from '@beechcms/core'

const testSeeds = [
  defineSeed({
    slug: 'posts',
    label: 'Post',
    labelPlural: 'Posts',
    displayNameAlias: 'title',
    allowPublicRead: true,
    allowPublicPost: true,
    branches: [
      { alias: 'title', label: 'Title', type: 'text', requiredOnCreate: true },
      { alias: 'body', label: 'Body', type: 'text' },
    ],
  }),
]

const ENV = {
  JWT_SECRET: 'test-secret',
  PUBLIC_READ_API_KEY: 'read-key',
  PUBLIC_WRITE_API_KEY: 'write-key',
  ENV: 'development',
}

describe('Flow: Guest Access (Public API)', () => {
  let repo: StaticContentRepository
  let idempotencyRepo: StaticIdempotencyRepository
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    repo = new StaticContentRepository(testSeeds)
    idempotencyRepo = new StaticIdempotencyRepository()
    app = createBeechApp({ seeds: testSeeds, repository: repo, idempotencyRepository: idempotencyRepo })
  })

  it('POST add → GET list: entry persists in repository', async () => {
    const postRes = await app.request('/api/v1/public/posts/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'write-key' },
      body: JSON.stringify({ status: 'published', data: { title: 'My First Post' } }),
    }, ENV)

    expect(postRes.status).toBe(201)
    const { id } = await postRes.json<{ id: string }>()
    expect(id).toBeDefined()

    const listRes = await app.request('/api/v1/public/posts', {
      headers: { 'X-API-Key': 'read-key' },
    }, ENV)

    expect(listRes.status).toBe(200)
    const { data } = await listRes.json<{ data: any[] }>()
    expect(data.some((p) => p.id === id)).toBe(true)
    expect(data.find((p) => p.id === id)?.title).toBe('My First Post')
  })

  it('POST add → GET detail by ID', async () => {
    const postRes = await app.request('/api/v1/public/posts/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': 'write-key' },
      body: JSON.stringify({ status: 'published', data: { title: 'Detail Test' } }),
    }, ENV)

    expect(postRes.status).toBe(201)
    const { id } = await postRes.json<{ id: string }>()

    const detailRes = await app.request(`/api/v1/public/posts?id=${id}`, {
      headers: { 'X-API-Key': 'read-key' },
    }, ENV)

    expect(detailRes.status).toBe(200)
    const { data } = await detailRes.json<{ data: any }>()
    expect(data.id).toBe(id)
    expect(data.title).toBe('Detail Test')
  })

  it('GET list: seed inesistente → 404', async () => {
    const res = await app.request('/api/v1/public/nonexistent', {
      headers: { 'X-API-Key': 'read-key' },
    }, ENV)

    expect(res.status).toBe(404)
  })

  it('POST add: API key mancante → 401', async () => {
    const res = await app.request('/api/v1/public/posts/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'No Key' }),
    }, ENV)

    expect(res.status).toBe(401)
  })

  it('POST add idempotenza: stesso X-Idempotency-Key non duplica record', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': 'write-key',
      'Idempotency-Key': 'unique-key-123',
    }
    const body = JSON.stringify({ status: 'published', data: { title: 'Idempotent Post' } })

    const first = await app.request('/api/v1/public/posts/add', { method: 'POST', headers, body }, ENV)
    expect(first.status).toBe(201)
    const { id: firstId } = await first.json<{ id: string }>()

    const second = await app.request('/api/v1/public/posts/add', { method: 'POST', headers, body }, ENV)
    expect(second.status).toBe(201)
    const { id: secondId } = await second.json<{ id: string }>()

    expect(firstId).toBe(secondId)

    const listRes = await app.request('/api/v1/public/posts', { headers: { 'X-API-Key': 'read-key' } }, ENV)
    const { data } = await listRes.json<{ data: any[] }>()
    expect(data.filter((p) => p.title === 'Idempotent Post')).toHaveLength(1)
  })
})
