# Integrate BeechCMS with Hono

Consume BeechCMS content from a lightweight, high-performance Hono edge microservice or API gateway on Cloudflare Workers, Deno, or Node.js.

<LlmPromptNode
  framework="Hono"
  title="Hono Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Hono integration code:"
/>

## Step 1: Install Official Client SDK

Install `@beechcms/client` and `hono` in your consumer project:

<PackageManagerTabs command="@beechcms/client hono" />

## Step 2: Initialize Beech Client in Hono Context

Create a Hono app and bind the client via middleware:

```typescript
// src/index.ts
import { Hono } from 'hono'
import { createBeechServerClient, type BeechServerClient } from '@beechcms/client/server'
import { renderRichText } from '@beechcms/client/richtext'

export interface Post {
  id: string
  title: string
  slug: string
  cover_image?: string
  body: string | Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface AppRegistry {
  posts: Post
}

type Bindings = {
  BEECH_API_URL: string
  BEECH_READ_KEY: string
}

type Variables = {
  beech: BeechServerClient<AppRegistry>
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Middleware to inject BeechClient
app.use('*', async (c, next) => {
  const client = createBeechServerClient<AppRegistry>({
    baseUrl: c.env.BEECH_API_URL || 'http://localhost:8789',
    apiKey: c.env.BEECH_READ_KEY || 'dev-read-key-changeme'
  })
  c.set('beech', client)
  await next()
})
```

## Step 3: Route Handlers Returning JSON / HTML

Implement typed route endpoints consuming content from BeechCMS:

```typescript
// src/index.ts (continued)

// JSON API Gateway endpoint
app.get('/api/articles', async (c) => {
  const beech = c.get('beech')

  const result = await beech.content('posts').list({
    sort: { created_at: 'desc' },
    limit: 10
  })

  if (result.error) {
    return c.json({ error: result.error.detail }, 500)
  }

  return c.json({
    success: true,
    count: result.data.data.length,
    articles: result.data.data
  })
})

// Edge SSR HTML Route with TipTap RichText
app.get('/articles/:slug', async (c) => {
  const beech = c.get('beech')
  const slug = c.req.param('slug')

  const result = await beech.content('posts').get({ slug })

  if (result.error || !result.data) {
    return c.html('<h1>Article Not Found</h1>', 404)
  }

  const post = result.data.data
  const bodyHtml = renderRichText(post.body)

  return c.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${post.title}</title>
      </head>
      <body>
        <article>
          <h1>${post.title}</h1>
          ${post.cover_image ? `<img src="${post.cover_image}" alt="${post.title}" />` : ''}
          <div>${bodyHtml}</div>
        </article>
      </body>
    </html>
  `)
})

export default app
```
