# Integrate BeechCMS with Hono

Consume BeechCMS content from a lightweight, high-performance Hono edge microservice or API gateway on Cloudflare Workers, Deno, or Node.js.

<LlmPromptNode
  framework="Hono"
  title="Hono Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Hono integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in Hono, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create a Hono app

Create a new Hono project targeting Cloudflare Workers (or Node.js):

```bash
npm create hono@latest my-hono-app
cd my-hono-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your Hono project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

For Cloudflare Workers development, configure variables in `.dev.vars`:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

> In local development, the default read key is pre-configured. In production, configure secrets via `wrangler secret put BEECH_READ_KEY`.

## 5. Initialize the Beech client

Define your content types and inject a typed Beech client into Hono context variables:

```typescript
// src/index.ts
import { Hono } from 'hono'
import { createBeechServerClient, type BeechServerClient } from '@beechcms/client/server'
import { renderRichText } from '@beechcms/client/richtext'

export interface Article {
  id: string
  title: string
  slug: string
  cover_image?: string
  body: string | Record<string, unknown>
  created_at: number
  updated_at: number
}

export interface AppRegistry {
  articles: Article
}

type Bindings = {
  BEECH_API_URL: string
  BEECH_READ_KEY: string
}

type Variables = {
  beech: BeechServerClient<AppRegistry>
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Middleware: Attach Beech client to Hono context
app.use('*', async (c, next) => {
  const client = createBeechServerClient<AppRegistry>({
    baseUrl: c.env.BEECH_API_URL || 'http://localhost:8789',
    apiKey: c.env.BEECH_READ_KEY || 'dev-read-key-changeme'
  })
  c.set('beech', client)
  await next()
})
```

## 6. Query and render content

Add JSON and HTML endpoints consuming BeechCMS content:

```typescript
// src/index.ts (continued)

// JSON API Endpoint
app.get('/api/articles', async (c) => {
  const beech = c.get('beech')

  const result = await beech.content('articles').list({
    sort: { created_at: 'desc' },
    limit: 10
  })

  if (result.error) {
    return c.json({ error: result.error.detail }, 500)
  }

  return c.json({
    count: result.data.data.length,
    articles: result.data.data
  })
})

// Edge SSR HTML Route with TipTap RichText
app.get('/', async (c) => {
  const beech = c.get('beech')

  const result = await beech.content('articles').list({
    sort: { created_at: 'desc' },
    limit: 10
  })

  const articles = result.data ? result.data.data : []

  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>BeechCMS + Hono</title>
      </head>
      <body style="font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem;">
        <h1>BeechCMS + Hono Edge Microservice</h1>
        ${articles.length === 0 ? '<p>No articles found.</p>' : ''}
        ${articles.map(article => `
          <article style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem;">
            <h2>${article.title}</h2>
            <div>${renderRichText(article.body)}</div>
          </article>
        `).join('')}
      </body>
    </html>
  `

  return c.html(html)
})

export default app
```

## 7. Start the app

Run the Hono development server (e.g. via Wrangler for Cloudflare Workers):

```bash
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) in your browser. You will see your BeechCMS articles rendered directly from your edge handler.

## Production requirements

Before deploying to production:

- **Configure Seed Permissions**: Ensure your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `BEECH_READ_KEY` to your `PUBLIC_READ_API_KEY`.
- **Edge Performance**: Running Hono alongside BeechCMS on Cloudflare Workers allows sub-millisecond edge invocation with zero cold starts.

## Cloudflare Edge Deployment

Hono and BeechCMS share the exact same Cloudflare Workers isolate runtime, making them the ultimate edge pairing:

- **Deploying to Cloudflare Workers**: Run `wrangler deploy` to publish your consumer service to Cloudflare's global edge network.
- **Service Bindings (Zero Network Overhead)**: If your Hono microservice runs in the same Cloudflare account as BeechCMS, connect them via a **Service Binding** in `wrangler.jsonc`:
  ```jsonc
  "services": [
    { "binding": "BEECH_API", "service": "beech-api" }
  ]
  ```
  Service Bindings allow your Hono worker to invoke BeechCMS directly in memory across edge isolates with **sub-millisecond latency, zero SSL overhead, and zero public internet exposure**.
- **Edge Streaming**: Hono natively supports Web Streams (`c.streamText()` or chunked HTML streaming), allowing you to stream large BeechCMS content payloads straight to the client without memory buffering.

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
