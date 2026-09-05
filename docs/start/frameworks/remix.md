# Integrate BeechCMS with Remix / React Router v7

Connect BeechCMS to your Remix / React Router application utilizing edge loaders, robust server fetching, and typed route hooks.

<LlmPromptNode
  framework="Remix"
  title="Remix Integration Prompt"
  description="Copy this prompt into Cursor, Claude, or ChatGPT to generate your Remix integration code:"
/>

## 1. Set up your BeechCMS backend & sample Seed

Before querying data in Remix, ensure you have a running BeechCMS instance with sample content:

1. **Start BeechCMS**: If running locally, start your backend via `pnpm run dev` (running on `http://localhost:8789`), or use your deployed Cloudflare Worker URL.
2. **Verify or Create the Seed**: In your BeechCMS admin dashboard (`/admin`), verify you have an `articles` Seed with:
   - **Branches**: `title` (Text), `slug` (Slug), and `body` (Rich Text).
   - **Permissions**: Ensure **Allow Public Read** (`allowPublicRead`) is checked so public requests can fetch content without admin secrets.
3. **Publish a Fruit (Record)**: Create at least one article and click **Publish**.

## 2. Create a Remix app

Create a new Remix / React Router project:

```bash
npx create-remix@latest my-remix-app
cd my-remix-app
```

## 3. Install the official client SDK

Install `@beechcms/client` in your Remix project:

<PackageManagerTabs command="@beechcms/client" />

## 4. Declare environment variables

Create a `.env` file in your Remix project root:

```bash
BEECH_API_URL=http://localhost:8789
BEECH_READ_KEY=dev-read-key-changeme
```

> In local development, the default read key is pre-configured. In production, configure these variables in your deployment environment.

## 5. Initialize the Beech client

Create `app/lib/beech.server.ts` to instantiate a typed server client:

```typescript
// app/lib/beech.server.ts
import { createBeechServerClient } from '@beechcms/client/server'

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

export const beech = createBeechServerClient<AppRegistry>({
  baseUrl: process.env.BEECH_API_URL || 'http://localhost:8789',
  apiKey: process.env.BEECH_READ_KEY || 'dev-read-key-changeme'
})
```

## 6. Query and render content

Replace `app/routes/_index.tsx` with a server loader and route component rendering content with `renderRichText`:

```tsx
// app/routes/_index.tsx
import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { useLoaderData, Link } from '@remix-run/react'
import { beech } from '~/lib/beech.server'
import { renderRichText } from '@beechcms/client/richtext'

export async function loader({ request }: LoaderFunctionArgs) {
  const result = await beech.content('articles').list({
    sort: { created_at: 'desc' },
    limit: 10
  })

  return json({
    articles: result.data ? result.data.data : []
  })
}

export default function IndexRoute() {
  const { articles } = useLoaderData<typeof loader>()

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>BeechCMS + Remix</h1>

      {articles.length === 0 ? (
        <p>No articles found. Plant an article in the BeechCMS dashboard!</p>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {articles.map((article) => (
            <article
              key={article.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '1.25rem'
              }}
            >
              <h2 style={{ marginTop: 0 }}>{article.title}</h2>
              <div
                dangerouslySetInnerHTML={{ __html: renderRichText(article.body) }}
              />
              <Link to={`/articles/${article.slug}`}>Read article →</Link>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}
```

## 7. Start the app

Run the Remix development server:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You will see your BeechCMS articles rendered through Remix server loaders.

## Production requirements

Before deploying to production:

- **Configure Seed Permissions**: Ensure your Seed has `allowPublicRead: true` enabled in the admin dashboard so public visitors can fetch published content.
- **Production API URL**: Point `BEECH_API_URL` to your production Cloudflare Worker URL (`https://api.yourdomain.com`).
- **Production API Keys**: Set `BEECH_READ_KEY` to your `PUBLIC_READ_API_KEY`.
- **Server Isolation**: Naming the file `beech.server.ts` guarantees that Remix tree-shakes client logic and never leaks server credentials into client browser bundles.

## Cloudflare Edge Deployment

When deploying Remix to Cloudflare Workers or Pages:

- **Cloudflare Context Bindings (`context.cloudflare.env`)**: On Cloudflare edge runtimes, environment variables and bindings are passed directly via the loader's `context.cloudflare.env`:
  ```typescript
  export async function loader({ context }: LoaderFunctionArgs) {
    const apiUrl = context.cloudflare.env.BEECH_API_URL || process.env.BEECH_API_URL
    // ...
  }
  ```
- **Cloudflare Adapter**: Use the `@remix-run/cloudflare` (or `@react-router/cloudflare`) adapter to bundle your application for edge Workers without Node.js dependencies.
- **Node.js Compatibility**: Add `compatibility_flags = ["nodejs_compat"]` to your `wrangler.jsonc`.

## Next steps

- **[5-Minute First Project Tutorial](/start/first-project)**: Follow a step-by-step tutorial covering project scaffolding, database bootstrap, visual modeling, and deployment.
- **[Client SDK Reference](/reference/client-sdk)**: Explore advanced querying, filtering, and pagination parameters.
- **[Public API Reference](/reference/public-api)**: Understand Edge REST endpoints, caching headers, and RFC 7807 error responses.
- **[Forms SDK (@beechcms/forms-react)](/features/forms)**: Capture user submissions and feedback with zero secrets and built-in bot defense.
