import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'

describe('Hono Routing with Slashes', () => {
  it('testing :key{.+} regex parameter', async () => {
    const app = new Hono()
    
    app.get('/api/media/:key{.+}', (c) => {
      const key = c.req.param('key')
      return c.json({ key })
    })

    const res = await app.request('/api/media/avatars/discount_10%25_off.png')
    expect(res.status).toBe(200)
    const json = await res.json<any>()
    expect(json.key).toBe('avatars/discount_10%_off.png')
  })
})
